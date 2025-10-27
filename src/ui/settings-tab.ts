import { PluginSettingTab, Setting } from 'obsidian';
import { DexApiClient, ObsidianDexFetcher } from '../api/client';
import DexContactsPlugin from '../../main';
import { MarkdownConverter } from '../utils/markdown-converter';
import { getErrorMessage } from '../utils/error-utils';
import { ContactCardField } from '../core/settings-types';

export class DexContactsSettingTab extends PluginSettingTab {
	plugin: DexContactsPlugin;
	private apiTestTimeout: NodeJS.Timeout | null = null;
	private markdownConverter: MarkdownConverter;

	constructor(app: any, plugin: DexContactsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.markdownConverter = new MarkdownConverter(app.vault.getName());
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Dex Contacts Settings' });

		// API Configuration Section
		containerEl.createEl('h3', { text: 'API Configuration' });

		// API Key Setting with auto-test
		const apiKeySetting = new Setting(containerEl)
			.setName('Dex API Key');
		
		// Add custom description with hyperlink
		const descEl = apiKeySetting.descEl;
		descEl.empty();
		descEl.appendText('Your personal API key from Dex (found in ');
		const link = descEl.createEl('a', {
			text: 'Settings > API',
			href: 'https://getdex.com/appv3/settings/api'
		});
		link.target = '_blank';
		descEl.appendText(')');
		
		apiKeySetting.addText(text => {
				const textComponent = text
					.setPlaceholder('Enter your API key')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						// Clear cache if API key changed
						if (this.plugin.settings.apiKey !== value) {
							this.plugin.contactManager?.clearCache();
							this.plugin.lastTestedApiKey = '';
						}
						
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
						
						// Show/hide status indicator based on content
						if (value.trim()) {
							// Update API client with new key
							this.plugin.apiClient = new DexApiClient(value, new ObsidianDexFetcher(), this.plugin.logger);
							
							statusEl.style.display = 'inline-flex';
							
							// Debounce the API test to avoid excessive requests while typing
							if (this.apiTestTimeout) {
								clearTimeout(this.apiTestTimeout);
							}
							
							this.apiTestTimeout = setTimeout(async () => {
								await this.testApiKeyWithIndicator(value, statusEl);
							}, 1000); // Wait 1 second after user stops typing
						} else {
							statusEl.style.display = 'none';
							statusEl.empty();
						}
						
						if (value) {
							this.plugin.apiClient = new DexApiClient(value, new ObsidianDexFetcher(), this.plugin.logger);
						}
					});
				
				return textComponent;
			});

		// Add status indicator to the API key setting (initially hidden)
		const statusEl = apiKeySetting.settingEl.createDiv({ cls: 'dex-api-status-inline' });
		statusEl.style.display = this.plugin.settings.apiKey.trim() ? 'inline-flex' : 'none';
		
		// Test the current API key on load if it exists
		if (this.plugin.settings.apiKey.trim()) {
			this.testApiKeyWithIndicator(this.plugin.settings.apiKey, statusEl);
		}

		// API Test Button (keep the manual test button too)
		if (this.plugin.settings.apiKey) {
			new Setting(containerEl)
				.setName('Test API Connection')
				.setDesc('Verify that your API key works and diagnose connection issues')
				.addButton(button => button
					.setButtonText('Test Connection')
					.onClick(async () => {
						button.setButtonText('Testing...');
						button.setDisabled(true);
						
						try {
							const result = await this.plugin.apiClient.testConnection();
							if (result.success) {
								this.plugin.notifications.showNotification('✅ Dex API connection successful!', 'success');
							} else {
								this.plugin.notifications.showNotification(`❌ Dex API connection failed: ${result.error}`, 'error');
							}
						} catch (error) {
							this.plugin.notifications.showNotification(`❌ Dex API test failed: ${error.message}`, 'error');
						} finally {
							button.setButtonText('Test Connection');
							button.setDisabled(false);
						}
					}))
				.addButton(button => button
					.setButtonText('Diagnose Issues')
					.onClick(async () => {
						button.setButtonText('Diagnosing...');
						button.setDisabled(true);
						
						try {
							await this.plugin.diagnoseConnection();
						} finally {
							button.setButtonText('Diagnose Issues');
							button.setDisabled(false);
						}
					}));
		}

		// Link Settings Section
		containerEl.createEl('h3', { text: 'Link Settings' });

		// Link Mode Setting with inline path options
		const linkModeSetting = new Setting(containerEl)
			.setName('Link Mode')
			.setDesc('How to link contact names when selected')
			.addDropdown(dropdown => dropdown
				.addOption('dex-url', 'Link to Dex URL')
				.addOption('vault-page', 'Link to Vault Page')
				.setValue(this.plugin.settings.linkMode)
				.onChange(async (value) => {
					this.plugin.settings.linkMode = value as 'dex-url' | 'vault-page';
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide dependent settings
				}));

		// Vault Path Settings (only show if vault-page mode is selected, inline with Link Mode)
		if (this.plugin.settings.linkMode === 'vault-page') {
			linkModeSetting
				.addDropdown(dropdown => dropdown
					.addOption('vault', 'Root of Vault')
					.addOption('path', 'Custom Path')
					.setValue(this.plugin.settings.vaultPath)
					.onChange(async (value) => {
						this.plugin.settings.vaultPath = value as 'vault' | 'path';
						await this.plugin.saveSettings();
						this.display();
					}));

			if (this.plugin.settings.vaultPath === 'path') {
				linkModeSetting.addText(text => text
					.setPlaceholder('e.g., People or Contacts/Dex')
					.setValue(this.plugin.settings.customPath)
					.onChange(async (value) => {
						this.plugin.settings.customPath = value;
						await this.plugin.saveSettings();
					}));
			}
		}

		// Additional Link Options (only show if vault-page mode is selected)
		if (this.plugin.settings.linkMode === 'vault-page') {
			new Setting(containerEl)
				.setName('Include @ Symbol')
				.setDesc('Include @ symbol in contact page names')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.includeAtSymbol)
					.onChange(async (value) => {
						this.plugin.settings.includeAtSymbol = value;
						await this.plugin.saveSettings();
					}));
		}

		// Contact Display Section
		containerEl.createEl('h3', { text: 'Contact Display' });

		new Setting(containerEl)
			.setName('Include @ in Link Text')
			.setDesc('Include the @ symbol in the actual link text when inserting contacts')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeAtInLink)
				.onChange(async (value) => {
					this.plugin.settings.includeAtInLink = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Strip Last Name')
			.setDesc('Show only first names when mentioning contacts (e.g., "@John" instead of "@John Doe")')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.stripLastName)
				.onChange(async (value) => {
					this.plugin.settings.stripLastName = value;
					await this.plugin.saveSettings();
				}));

		// Memo Template Section
		containerEl.createEl('h3', { text: 'Memo Templates' });

		const templateSetting = new Setting(containerEl)
			.setName('Memo Template')
			.setDesc('Template for memos synced to Dex. Available variables: {{date}} (current date), {{title}} (note title), {{obsidian_uri}} (URI to note), {{content}} (paragraph content), {{header}} (header text)');
			
		templateSetting.addTextArea(text => {
			const textArea = text
				.setPlaceholder('{{content}}')
				.setValue(this.plugin.settings.memoTemplate)
				.onChange(async (value) => {
					this.plugin.settings.memoTemplate = value;
					await this.plugin.saveSettings();
					// Update preview when template changes
					this.updateTemplatePreview(previewEl, value);
				});
			
			// Make the textarea taller for better editing
			textArea.inputEl.style.height = '120px';
			textArea.inputEl.style.resize = 'vertical';
			
			// Add auto-suggest for template variables
			this.setupTemplateAutoSuggest(textArea.inputEl);
			
			return textArea;
		});
		
		// Add template preview area
		const previewContainer = containerEl.createDiv({ cls: 'dex-template-preview-container' });
		previewContainer.style.marginTop = '10px';
		previewContainer.style.padding = '10px';
		previewContainer.style.border = '1px solid var(--background-modifier-border)';
		previewContainer.style.borderRadius = '4px';
		previewContainer.style.backgroundColor = 'var(--background-secondary)';
		
		const previewLabel = previewContainer.createDiv();
		previewLabel.style.fontSize = '0.9em';
		previewLabel.style.fontWeight = '600';
		previewLabel.style.marginBottom = '8px';
		previewLabel.style.color = 'var(--text-muted)';
		previewLabel.setText('HTML Preview (how it will appear in Dex):');
		
		const previewEl = previewContainer.createDiv({ cls: 'dex-template-preview' });
		previewEl.style.fontFamily = 'var(--font-text)';
		previewEl.style.fontSize = '0.9em';
		previewEl.style.lineHeight = '1.4';
		previewEl.style.padding = '8px';
		previewEl.style.backgroundColor = 'var(--background-primary)';
		previewEl.style.borderRadius = '3px';
		previewEl.style.border = '1px solid var(--background-modifier-border)';
		previewEl.style.minHeight = '60px';
		
		// Initialize preview
		this.updateTemplatePreview(previewEl, this.plugin.settings.memoTemplate);

		// Sync Settings Section
		containerEl.createEl('h3', { text: 'Sync Settings' });

		new Setting(containerEl)
			.setName('Show Sync Buttons')
			.setDesc('Show sync buttons next to contact mentions. Alternatively, use the command palette (Ctrl/Cmd+P) or assign hotkeys for "Sync contact memo" and "Suggest contact" commands.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showSyncButtons)
				.onChange(async (value) => {
					this.plugin.settings.showSyncButtons = value;
					await this.plugin.saveSettings();
					// Update the extension registration
					this.plugin.updateSyncButtonExtension();
				}));

		// Auto-sync on Content Change
		new Setting(containerEl)
			.setName('Auto-sync After Editing')
			.setDesc('Automatically sync memos after you stop editing (waits 5 seconds after last change). Useful for keeping Dex updated without manual clicks.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSyncOnSave)
				.onChange(async (value) => {
					this.plugin.settings.autoSyncOnSave = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Hide Dex Metadata in Live Preview')
			.setDesc('Hide Dex comment metadata (%%dex:contact-id=X%%) in Live Preview mode. Disable to make metadata visible for debugging.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideDexMetadata)
				.onChange(async (value) => {
					this.plugin.settings.hideDexMetadata = value;
					await this.plugin.saveSettings();
					// Update the extension to apply the visibility change
					this.plugin.updateSyncButtonExtension();
				}));

		// Contact Cards Section
		containerEl.createEl('h3', { text: 'Contact Cards' });

		new Setting(containerEl)
			.setName('Show Contact Cards on Hover')
			.setDesc('Display rich contact information cards when hovering over contact links')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showContactCards)
				.onChange(async (value) => {
					this.plugin.settings.showContactCards = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide sub-settings
				}));

		// Sub-settings (only show if contact cards are enabled)
		if (this.plugin.settings.showContactCards) {
			new Setting(containerEl)
				.setName('Show in Reading View')
				.setDesc('Replace default page hover previews with contact cards in Reading View')
				.setClass('dex-subsetting')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showContactCardsInReader)
					.onChange(async (value) => {
						this.plugin.settings.showContactCardsInReader = value;
						await this.plugin.saveSettings();
					}));

			// Contact card fields customization
			this.addContactCardFieldsSettings(containerEl);
		}

		// Support Section
		containerEl.createEl('h3', { text: 'Show Some Love' });
		
		new Setting(containerEl)
			.setName('☕ Say Thanks')
			.setDesc('Enjoying the plugin? A small coffee donation helps keep development brewing and new features coming! ☕')
			.addButton(button => button
				.setButtonText('☕ Buy me a coffee')
				.setCta()
				.onClick(() => {
					window.open('https://buymeacoffee.com/grayadams', '_blank');
				}));

		// Developer Settings Section
		containerEl.createEl('h3', { text: 'Developer Settings' });
		
		new Setting(containerEl)
			.setName('Debug Mode')
			.setDesc('Enable detailed logging for troubleshooting (logs to console and debug viewer)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide debug log viewer
				}));

		// Debug Log Viewer (only show if debug mode is enabled)
		if (this.plugin.settings.debugMode) {
			// Create a setting row for the debug log management
			const debugSetting = new Setting(containerEl)
				.setName('Debug Logs')
				.setDesc(`Plugin started: ${this.plugin.logger.getStartTime().toLocaleString()}`)
				.addButton(button => button
					.setButtonText('Refresh')
					.onClick(() => {
						// Prevent rapid clicks
						button.setDisabled(true);
						setTimeout(() => {
							this.updateDebugLogDisplay(logContainer);
							button.setDisabled(false);
						}, 100);
					}))
				.addButton(button => button
					.setButtonText('Clear Logs')
					.onClick(() => {
						this.plugin.logger.clearLogs();
						this.updateDebugLogDisplay(logContainer);
					}))
				.addButton(button => button
					.setButtonText('Copy All')
					.setTooltip('Copy all logs to clipboard')
					.onClick(async () => {
						try {
							const logs = this.plugin.logger.exportLogs();
							await navigator.clipboard.writeText(logs);
							this.plugin.notifications.showNotification('✅ Debug logs copied to clipboard!', 'success');
						} catch (error) {
							this.plugin.notifications.showNotification('❌ Failed to copy logs to clipboard', 'error');
						}
					}))
				.addButton(button => button
					.setButtonText('Export Logs')
					.onClick(() => {
						this.exportDebugLogs();
					}));

			// Create a full-width container below the setting row for the logs
			const logContainer = containerEl.createDiv({ cls: 'dex-debug-log-container' });
			this.updateDebugLogDisplay(logContainer);
		}

		// Attribution section
		containerEl.createEl('h3', { text: 'Credits' });
		
		const attributionDiv = containerEl.createDiv({ cls: 'dex-attribution' });
		attributionDiv.createSpan({ text: 'Icons provided by ' });
		const lucideLink = attributionDiv.createEl('a', {
			text: 'Lucide',
			href: 'https://lucide.dev'
		});
		lucideLink.target = '_blank';
		attributionDiv.createSpan({ text: ' under the ISC License.' });
	}

	private async testApiKeyWithIndicator(apiKey: string, statusEl: HTMLElement) {
		// Clear existing status
		statusEl.empty();
		
		if (!apiKey.trim()) {
			return;
		}

		// Only test if the API key has changed since last test
		if (apiKey === this.plugin.lastTestedApiKey) {
			// Show cached result
			if (this.plugin.contactManager?.getContacts().length > 0) {
				statusEl.addClass('dex-api-success');
				const successIcon = statusEl.createSpan({ cls: 'dex-api-icon' });
				successIcon.innerHTML = `
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" stroke-width="2">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
						<polyline points="22,4 12,14.01 9,11.01"></polyline>
					</svg>
				`;
				successIcon.title = 'API key is valid (cached)';
			}
			return;
		}

		// Show loading state
		statusEl.addClass('dex-api-testing');
		const loadingIcon = statusEl.createSpan({ cls: 'dex-api-loading' });
		loadingIcon.innerHTML = `
			<svg class="spinning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 12a9 9 0 11-6.219-8.56"/>
			</svg>
		`;

		try {
			const apiClient = new DexApiClient(apiKey, new ObsidianDexFetcher(), this.plugin.logger);
			const result = await apiClient.testConnection();
			
			// Clear loading state
			statusEl.removeClass('dex-api-testing');
			statusEl.empty();

			if (result.success) {
				// Store the tested API key to avoid retesting
				this.plugin.lastTestedApiKey = apiKey;
				
				// Only cache contacts if we don't have any cached yet
				try {
					if (this.plugin.contactManager?.getContacts().length === 0) {
						// Update the contact manager's API client and load contacts
						this.plugin.contactManager?.setApiClient(apiClient);
						await this.plugin.contactManager?.loadContacts();
						
						this.plugin.logger.logDebug(`Loaded contacts on API key test`);
					} else {
						this.plugin.logger.logDebug('Skipping contact loading - already have contacts');
					}
				} catch (error) {
					this.plugin.logger.logError('Failed to load contacts on API key test', error);
				}
				
				// Show success indicator
				statusEl.addClass('dex-api-success');
				const successIcon = statusEl.createSpan({ cls: 'dex-api-icon' });
				successIcon.innerHTML = `
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" stroke-width="2">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
						<polyline points="22,4 12,14.01 9,11.01"></polyline>
					</svg>
				`;
				successIcon.title = 'API key is valid';
				
				// Show success notification
				this.plugin.notifications.showNotification('✅ Dex API key is valid and connected!', 'success');
			} else {
				// Clear the last tested API key since this one failed
				this.plugin.lastTestedApiKey = '';
				
				// Show error indicator
				statusEl.addClass('dex-api-error');
				const errorIcon = statusEl.createSpan({ cls: 'dex-api-icon' });
				errorIcon.innerHTML = `
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-red)" stroke-width="2">
						<circle cx="12" cy="12" r="10"></circle>
						<line x1="15" y1="9" x2="9" y2="15"></line>
						<line x1="9" y1="9" x2="15" y2="15"></line>
					</svg>
				`;
				errorIcon.title = `API key is invalid: ${result.error}`;
				
				// Show error notification
				this.plugin.notifications.showNotification(`❌ Dex API key failed: ${result.error}`, 'error');
			}
		} catch (error) {
			// Clear loading state and show error
			statusEl.removeClass('dex-api-testing');
			statusEl.empty();
			statusEl.addClass('dex-api-error');
			
			const errorIcon = statusEl.createSpan({ cls: 'dex-api-icon' });
			errorIcon.innerHTML = `
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-red)" stroke-width="2">
					<circle cx="12" cy="12" r="10"></circle>
					<line x1="15" y1="9" x2="9" y2="15"></line>
					<line x1="9" y1="9" x2="15" y2="15"></line>
				</svg>
			`;
			errorIcon.title = `Connection failed: ${getErrorMessage(error)}`;
			
			// Show connection error notification
			this.plugin.notifications.showNotification(`❌ Dex API connection failed: ${error.message}`, 'error');
		}
	}

	private addContactCardFieldsSettings(containerEl: HTMLElement) {
		const fieldsContainer = containerEl.createDiv({ cls: 'dex-contact-card-fields' });
		
		new Setting(fieldsContainer)
			.setName('Visible Fields')
			.setDesc('Drag to reorder fields. Check/uncheck to show/hide them on contact cards.')
			.setHeading();

		// Field labels mapping
		const fieldLabels: Record<string, string> = {
			name: 'Full Name',
			title: 'Job Title',
			email: 'Email',
			phone: 'Phone Number',
			linkedin: 'LinkedIn',
			description: 'Description',
			birthday: 'Birthday'
		};

		// All available fields
		const allFields: ContactCardField[] = ['name', 'title', 'email', 'phone', 'linkedin', 'description', 'birthday'];

		// Create sortable list
		const listEl = fieldsContainer.createDiv({ cls: 'dex-field-list' });
		
		// Render current fields in order
		const currentFields = this.plugin.settings.contactCardFields;
		const remainingFields = allFields.filter(f => !currentFields.includes(f));
		const orderedFields = [...currentFields, ...remainingFields];

		orderedFields.forEach((field, index) => {
			// Skip fields that don't have a label (invalid fields)
			if (!fieldLabels[field]) {
				return;
			}
			
			const isEnabled = currentFields.includes(field);
			const itemEl = listEl.createDiv({ cls: `dex-field-item ${isEnabled ? 'enabled' : 'disabled'}` });
			
			// Drag handle
			const dragHandle = itemEl.createDiv({ cls: 'dex-field-drag-handle' });
			dragHandle.setText('⋮⋮');
			
			// Checkbox
			const checkbox = itemEl.createEl('input', { type: 'checkbox' });
			checkbox.checked = isEnabled;
			checkbox.addEventListener('change', async () => {
				if (checkbox.checked) {
					// Add field in its current position relative to other enabled fields
					const newFields = [...this.plugin.settings.contactCardFields];
					const insertIndex = orderedFields
						.slice(0, index)
						.filter(f => this.plugin.settings.contactCardFields.includes(f))
						.length;
					newFields.splice(insertIndex, 0, field);
					this.plugin.settings.contactCardFields = newFields;
				} else {
					// Remove field
					this.plugin.settings.contactCardFields = this.plugin.settings.contactCardFields.filter(f => f !== field);
				}
				await this.plugin.saveSettings();
				this.display(); // Refresh to update UI
			});
			
			// Label
			const label = itemEl.createDiv({ cls: 'dex-field-label' });
			label.setText(fieldLabels[field]);
			
			// Make draggable
			itemEl.draggable = true;
			
			itemEl.addEventListener('dragstart', (e) => {
				e.dataTransfer?.setData('text/plain', index.toString());
				itemEl.addClass('dragging');
			});
			
			itemEl.addEventListener('dragend', () => {
				itemEl.removeClass('dragging');
			});
			
			itemEl.addEventListener('dragover', (e) => {
				e.preventDefault();
				const dragging = listEl.querySelector('.dragging');
				if (dragging && dragging !== itemEl) {
					const rect = itemEl.getBoundingClientRect();
					const midpoint = rect.top + rect.height / 2;
					if (e.clientY < midpoint) {
						itemEl.before(dragging);
					} else {
						itemEl.after(dragging);
					}
				}
			});
			
			itemEl.addEventListener('drop', async (e) => {
				e.preventDefault();
				// Reorder based on current DOM order
				const items = Array.from(listEl.querySelectorAll('.dex-field-item'));
				const newOrder = items.map(item => {
					const label = item.querySelector('.dex-field-label')?.textContent;
					return Object.keys(fieldLabels).find(key => fieldLabels[key] === label);
				}).filter(Boolean) as ContactCardField[];
				
				// Update only the enabled fields in the new order
				const enabledFields = newOrder.filter(f => this.plugin.settings.contactCardFields.includes(f));
				this.plugin.settings.contactCardFields = enabledFields;
				await this.plugin.saveSettings();
			});
		});
	}

	private updateDebugLogDisplay(container: HTMLElement) {
		// Clear the container completely
		container.empty();
		
		const logs = this.plugin.logger.getLogs();
		
		// Add a small identifier to help debug refresh issues
		// Debug log display refreshed - info logged to plugin debug system
		
		if (logs.length === 0) {
			container.createDiv({ cls: 'dex-debug-empty', text: 'No debug logs yet. Enable debug mode and perform some actions to see logs appear here.' });
			return;
		}

		// Show log count and info
		const header = container.createDiv({ cls: 'dex-debug-header' });
		const leftInfo = header.createDiv();
		const refreshTime = new Date().toLocaleTimeString();
		leftInfo.createSpan({ text: `${logs.length} log entries (refreshed at ${refreshTime})` });
		leftInfo.createSpan({ 
			text: ' • Click to select text for copying (Ctrl/Cmd+A to select all)',
			cls: 'dex-debug-hint'
		});
		
		const rightInfo = header.createDiv();
		const lastLog = logs[logs.length - 1];
		if (lastLog) {
			rightInfo.createSpan({ 
				cls: 'dex-debug-last-update',
				text: `Last: ${new Date(lastLog.timestamp).toLocaleTimeString()}` 
			});
		}

		// Create scrollable log area
		const logArea = container.createDiv({ cls: 'dex-debug-logs' });
		
		// Show last 50 logs (most recent first)
		const recentLogs = logs.slice(-50).reverse();
		
		recentLogs.forEach(log => {
			const logEntry = logArea.createDiv({ cls: `dex-debug-entry dex-debug-${log.level}` });
			
			const timestamp = logEntry.createDiv({ cls: 'dex-debug-timestamp' });
			timestamp.setText(new Date(log.timestamp).toLocaleString());
			
			const level = logEntry.createSpan({ cls: 'dex-debug-level' });
			level.setText(log.level.toUpperCase());
			
			const message = logEntry.createDiv({ cls: 'dex-debug-message' });
			message.setText(log.message);
			
			if (log.details) {
				const details = logEntry.createDiv({ cls: 'dex-debug-details' });
				details.setText(JSON.stringify(log.details, null, 2));
			}
		});
	}

	private exportDebugLogs() {
		const logs = this.plugin.logger.exportLogs();
		
		// Create a downloadable file
		const blob = new Blob([logs], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		
		const link = document.createElement('a');
		link.href = url;
		// Format: dex-contacts-debug-YYYY-MM-DD-HH-MM-SS.log
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
		link.download = `dex-contacts-debug-${timestamp}.log`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		
		URL.revokeObjectURL(url);
		
		this.plugin.notifications.showNotification('📄 Debug logs exported successfully', 'success');
	}


	private updateTemplatePreview(previewEl: HTMLElement, template: string) {
		// Create a sample template with example data
		const sampleData = {
			'{{date}}': '2025-10-24',
			'{{title}}': 'Meeting Notes',
			'{{content}}': '**Important:** Discussed the new *product features* with ~~old approach~~ and:\n\n- Feature A implementation\n- Feature B timeline\n\n1. Phase 1: Research\n2. Phase 2: Development\n\nSee [project link](https://example.com) for more details.',
			'{{header}}': 'Quarterly Planning',
			'{{obsidian_uri}}': 'obsidian://open?vault=MyVault&file=Meeting%20Notes.md'
		};
		
		// Replace template variables with sample data
		let processedTemplate = template;
		for (const [variable, value] of Object.entries(sampleData)) {
			const escapedVariable = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			processedTemplate = processedTemplate.replace(new RegExp(escapedVariable, 'g'), value);
		}
		
		// Apply the same markdown-to-HTML conversion as used in memo content
		const htmlContent = this.convertMarkdownToHtml(processedTemplate);
		
		// Update the preview
		previewEl.innerHTML = htmlContent || '<em style="color: var(--text-muted);">Preview will appear here...</em>';
	}

	private convertMarkdownToHtml(text: string): string {
		return this.markdownConverter.convertMarkdownToHtml(text);
	}

	private setupTemplateAutoSuggest(textArea: HTMLTextAreaElement) {
		const availableVariables = [
			{ name: 'date', description: 'Current date' },
			{ name: 'title', description: 'Note title' },
			{ name: 'obsidian_uri', description: 'Obsidian URI to this note' },
			{ name: 'content', description: 'Paragraph content (without header)' },
			{ name: 'header', description: 'Header text if mention is in header' }
		];

		let suggestionContainer: HTMLElement | null = null;
		let currentSuggestionIndex = -1;
		let isShowingSuggestions = false;
		let lastCursorPosition = 0;

		const createSuggestionContainer = () => {
			if (suggestionContainer) {
				suggestionContainer.remove();
			}
			
			suggestionContainer = document.createElement('div');
			suggestionContainer.addClass('dex-template-suggestions');
			
			document.body.appendChild(suggestionContainer);
		};

		const positionSuggestions = () => {
			if (!suggestionContainer) return;
			
			const rect = textArea.getBoundingClientRect();
			const cursorPos = textArea.selectionStart;
			const computedStyle = window.getComputedStyle(textArea);
			const lineHeight = parseInt(computedStyle.lineHeight) || parseInt(computedStyle.fontSize) * 1.2;
			
			// Calculate which line the cursor is on
			const textBeforeCursor = textArea.value.substring(0, cursorPos);
			const lineNumber = textBeforeCursor.split('\n').length - 1;
			
			// Calculate cursor's vertical position within the textarea
			const cursorY = lineNumber * lineHeight;
			
			// Position dropdown below the current line with spacing
			const top = rect.top + cursorY + lineHeight + 5 + window.scrollY;
			const left = Math.min(rect.left, window.innerWidth - 200);
			
			// Check if dropdown would go off-screen at bottom
			const suggestionsHeight = 150; // Max height from CSS
			const viewportBottom = window.innerHeight + window.scrollY;
			
			if (top + suggestionsHeight > viewportBottom) {
				// Position above the current line instead
				suggestionContainer.style.top = (rect.top + cursorY - suggestionsHeight - 5 + window.scrollY) + 'px';
			} else {
				suggestionContainer.style.top = top + 'px';
			}
			
			suggestionContainer.style.left = left + 'px';
		};

		const showSuggestions = (query: string) => {
			if (!query.startsWith('{{')) return;
			
			const searchTerm = query.slice(2).toLowerCase();
			const matchingVars = availableVariables.filter(variable => 
				variable.name.toLowerCase().includes(searchTerm)
			);
			
			if (matchingVars.length === 0) {
				hideSuggestions();
				return;
			}
			
			createSuggestionContainer();
			if (!suggestionContainer) return;
			
			suggestionContainer.innerHTML = '';
			currentSuggestionIndex = 0;
			
			matchingVars.forEach((variable, index) => {
				const item = document.createElement('div');
				item.addClass('dex-suggestion-item');
				item.style.padding = '8px 12px';
				item.style.cursor = 'pointer';
				item.style.borderBottom = '1px solid var(--background-modifier-border)';
				
				if (index === currentSuggestionIndex) {
					item.style.backgroundColor = 'var(--background-modifier-hover)';
				}
				
				const nameEl = document.createElement('div');
				nameEl.style.fontWeight = '500';
				nameEl.textContent = `{{${variable.name}}}`;
				
				const descEl = document.createElement('div');
				descEl.style.fontSize = '0.85em';
				descEl.style.color = 'var(--text-muted)';
				descEl.textContent = variable.description;
				
				item.appendChild(nameEl);
				item.appendChild(descEl);
				
				item.addEventListener('click', () => insertSuggestion(variable.name));
				item.addEventListener('mouseenter', () => {
					document.querySelectorAll('.dex-suggestion-item').forEach(el => {
						(el as HTMLElement).style.backgroundColor = '';
					});
					item.style.backgroundColor = 'var(--background-modifier-hover)';
					currentSuggestionIndex = index;
				});
				
				suggestionContainer!.appendChild(item);
			});
			
			positionSuggestions();
			isShowingSuggestions = true;
		};

		const hideSuggestions = () => {
			if (suggestionContainer) {
				suggestionContainer.remove();
				suggestionContainer = null;
			}
			isShowingSuggestions = false;
			currentSuggestionIndex = -1;
		};

		const insertSuggestion = (variableName: string) => {
			const cursorPos = textArea.selectionStart;
			const textValue = textArea.value;
			
			// Find the start of the current {{ query
			let queryStart = cursorPos;
			while (queryStart > 1 && textValue.slice(queryStart - 2, queryStart) !== '{{') {
				queryStart--;
			}
			queryStart -= 2; // Include the {{
			
			// Replace the partial query with the full variable
			const before = textValue.substring(0, queryStart);
			const after = textValue.substring(cursorPos);
			const newValue = before + `{{${variableName}}}` + after;
			
			textArea.value = newValue;
			textArea.setSelectionRange(queryStart + variableName.length + 4, queryStart + variableName.length + 4);
			
			// Trigger the change event
			const event = new Event('input', { bubbles: true });
			textArea.dispatchEvent(event);
			
			hideSuggestions();
			textArea.focus();
		};

		const updateSuggestionHighlight = () => {
			if (!suggestionContainer) return;
			
			const items = suggestionContainer.querySelectorAll('.dex-suggestion-item');
			items.forEach((item, index) => {
				if (index === currentSuggestionIndex) {
					(item as HTMLElement).style.backgroundColor = 'var(--background-modifier-hover)';
				} else {
					(item as HTMLElement).style.backgroundColor = '';
				}
			});
		};

		// Event listeners
		textArea.addEventListener('input', () => {
			const cursorPos = textArea.selectionStart;
			const textValue = textArea.value;
			
			// Look for {{ pattern before cursor
			let queryStart = cursorPos;
			let foundStart = false;
			
			// Look backwards from cursor for {{
			while (queryStart >= 2) {
				if (textValue.slice(queryStart - 2, queryStart) === '{{') {
					foundStart = true;
					queryStart -= 2;
					break;
				}
				queryStart--;
				
				// Stop if we hit whitespace or }} (end of another variable)
				if (textValue[queryStart] === ' ' || textValue[queryStart] === '\n' || 
					(queryStart < textValue.length - 1 && textValue.slice(queryStart, queryStart + 2) === '}}')) {
					break;
				}
			}
			
			if (foundStart) {
				const query = textValue.substring(queryStart, cursorPos);
				// Only show suggestions if query doesn't end with }}
				if (!query.includes('}}')) {
					showSuggestions(query);
					return;
				}
			}
			
			hideSuggestions();
		});

		textArea.addEventListener('keydown', (e) => {
			if (!isShowingSuggestions) return;
			
			const items = suggestionContainer?.querySelectorAll('.dex-suggestion-item');
			if (!items) return;
			
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					currentSuggestionIndex = Math.min(currentSuggestionIndex + 1, items.length - 1);
					updateSuggestionHighlight();
					break;
				case 'ArrowUp':
					e.preventDefault();
					currentSuggestionIndex = Math.max(currentSuggestionIndex - 1, 0);
					updateSuggestionHighlight();
					break;
				case 'Enter':
				case 'Tab':
					e.preventDefault();
					if (currentSuggestionIndex >= 0) {
						const selectedVar = availableVariables.filter(v => 
							v.name.toLowerCase().includes(
								textArea.value.slice(
									textArea.value.lastIndexOf('{{', textArea.selectionStart) + 2,
									textArea.selectionStart
								).toLowerCase()
							)
						)[currentSuggestionIndex];
						if (selectedVar) {
							insertSuggestion(selectedVar.name);
						}
					}
					break;
				case 'Escape':
					e.preventDefault();
					hideSuggestions();
					break;
			}
		});

		// Hide suggestions when clicking outside
		textArea.addEventListener('blur', () => {
			setTimeout(() => {
				if (!suggestionContainer?.matches(':hover')) {
					hideSuggestions();
				}
			}, 100);
		});
	}
}