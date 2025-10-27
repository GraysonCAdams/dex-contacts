import { Plugin, TFile, Notice, MarkdownView, Editor } from 'obsidian';
import { DexApiClient, ObsidianDexFetcher } from './src/api/client';
import { ProcessedContact, PluginContext } from './src/core/types';
import { DexContactsSettings, DEFAULT_SETTINGS, ContactCardField } from './src/core/settings-types';
import { ContactManager } from './src/core/contact-manager';
import { MemoManager } from './src/core/memo-manager';
import { ContactSuggestModal } from './src/ui/contact-suggest';
import { ContactCreationModal } from './src/ui/contact-creation-modal';
import { NotificationManager } from './src/ui/notifications';
import { DexContactsSettingTab } from './src/ui/settings-tab';
import { DebugLogger } from './src/utils/debug-logger';
import { ContentProcessor } from './src/utils/content-processor';
import { ContactSelectionManager } from './src/utils/contact-selection-manager';
import { createSyncButtonExtension } from './src/ui/sync-buttons/codemirror-extension';
import { createHideDexCommentsExtension } from './src/ui/hide-dex-comments-extension';
import { ContactHoverCard } from './src/ui/contact-hover-card';
import { simpleHash } from './src/utils/content-hash';
import { CSSManager } from './src/utils/css-manager';
import { NOTIFICATION_INFO_DURATION, NOTIFICATION_SUCCESS_DURATION, NOTIFICATION_ERROR_DURATION, MEMO_ID_CLEANUP_PATTERN, MEMO_ID_PATTERN } from './src/constants';
import { Extension } from '@codemirror/state';
import { getErrorMessage } from './src/utils/error-utils';

export default class DexContactsPlugin extends Plugin {
	settings: DexContactsSettings;
	apiClient: DexApiClient;
	contactManager: ContactManager;
	memoManager: MemoManager;
	contentProcessor: ContentProcessor;
	contactSelectionManager: ContactSelectionManager;
	contactSuggest: ContactSuggestModal;
	notifications: NotificationManager;
	contactHoverCard: ContactHoverCard;
	logger: DebugLogger;
	cssManager: CSSManager;
	lastTestedApiKey: string = '';
	private syncButtonExtension: Extension | null = null;
	private hideDexCommentsExtension: Extension | null = null;
	private statusBarItem: HTMLElement | null = null;
	private autoSyncDebounceTimer: number | null = null;
	private readonly AUTO_SYNC_DELAY_MS = 5000; // 5 seconds after last edit
	private skipNextAutoSync = false; // Flag to skip auto-sync for programmatic changes

	async onload() {
		await this.loadSettings();
		
		// Initialize debug logger
		this.logger = new DebugLogger(this);
		
		// Initialize CSS manager
		this.cssManager = new CSSManager(this.logger);
		
		// Initialize notification manager
		this.notifications = new NotificationManager(this);
		
		// Initialize API client if available
		if (this.settings.apiKey) {
			this.logger.logDebug('API key found, initializing client and loading contacts');
			this.apiClient = new DexApiClient(this.settings.apiKey, new ObsidianDexFetcher(), this.logger);
		} else {
			this.logger.logDebug('No API key found - contacts will not be loaded');
		}

		// Create PluginContext for dependency injection
		const context: PluginContext = {
			app: this.app,
			apiClient: this.apiClient,
			settings: this.settings,
			logger: this.logger,
			notifications: this.notifications,
			cssManager: this.cssManager
		};

		// Initialize core managers with PluginContext
		this.contactManager = new ContactManager(context);
		this.contentProcessor = new ContentProcessor(context, this.contactManager);
		this.memoManager = new MemoManager(context, this.contentProcessor);
		this.contactSelectionManager = new ContactSelectionManager(this.app, this.settings, this.logger);
		
		// Force CSS reload to ensure styles are available after re-enabling
		this.cssManager.refreshCSS();
		
		// Initialize contact hover card
		this.contactHoverCard = new ContactHoverCard(this.app, this.apiClient, this.logger, this.cssManager, this.settings);
		this.contactHoverCard.initialize();
		
		// Initialize contact suggestion modal after managers are ready
		this.logger.logDebug(`Initializing ContactSuggestModal`);
		this.contactSuggest = new ContactSuggestModal(this.app, [], this.settings, this.logger, this.apiClient);
		this.contactSuggest.setOnSelectCallback(this.contactSelectionManager.onContactSelected.bind(this.contactSelectionManager));
		this.contactSuggest.setOnContactCreatedCallback((newContact: ProcessedContact) => {
			// Add new contact to the contact manager's cache
			this.contactManager.addContactToCache(newContact);
			this.logger.logDebug('New contact added to cache', newContact);
		});
		this.registerEditorSuggest(this.contactSuggest);
		this.logger.logDebug('EditorSuggest registered successfully');
		
		// Set the contact suggest modal on the contact manager
		this.contactManager.setContactSuggest(this.contactSuggest);
		
		// Load contacts if API key is available
		if (this.settings.apiKey) {
			await this.contactManager.loadContacts();
		}

		// Add commands
		this.addCommand({
			id: 'refresh-contacts',
			name: 'Refresh Dex Contacts',
			callback: () => this.forceRefreshContacts()
		});

		this.addCommand({
			id: 'sync-current-line',
			name: 'Sync current line to Dex',
			hotkeys: [{ modifiers: ['Mod'], key: 'Enter' }],
			editorCallback: (editor) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView) {
					this.syncCurrentLine(editor, activeView);
				}
			}
		});

		this.addCommand({
			id: 'sync-all-memos',
			name: 'Sync all lines in current note to Dex',
			editorCallback: (editor) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView) {
					this.syncAllMemos(editor, activeView);
				}
			}
		});

		this.addCommand({
			id: 'diagnose-connection',
			name: 'Diagnose Dex API Connection',
			callback: () => this.diagnoseConnection()
		});

		this.addCommand({
			id: 'clear-contact-cache',
			name: 'Clear Dex Contact Cache',
			callback: () => this.clearContactCache()
		});

		this.addCommand({
			id: 'cleanup-dex-tags',
			name: 'Remove All Dex Tags from Current Note',
			checkCallback: (checking: boolean) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView) {
					if (!checking) {
						this.cleanupDexTags(activeView.editor);
					}
					return true;
				}
				return false;
			}
		});

		// Register event handlers
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				// Update status bar when switching files
				this.updateStatusBar();
			})
		);

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				// Update status bar when switching between panes
				this.updateStatusBar();
			})
		);

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				// Update status bar when file content changes
				if (file === this.app.workspace.getActiveFile()) {
					this.updateStatusBar();
					
					// Auto-sync after debounce delay if enabled
					if (this.settings.autoSyncOnSave && file instanceof TFile && file.extension === 'md') {
						// Skip auto-sync if this was a programmatic change (like adding contact ID)
						if (this.skipNextAutoSync) {
							this.logger?.logDebug('Skipping auto-sync for programmatic change');
							this.skipNextAutoSync = false;
							return;
						}
						this.scheduleAutoSync();
					}
				}
			})
		);

		// Register CodeMirror extension for inline sync buttons
		this.updateSyncButtonExtension();

		// Add settings tab
		this.addSettingTab(new DexContactsSettingTab(this.app, this));

		// Initialize status bar
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass('plugin-dex-contacts');
		this.updateStatusBar();
	}

	updateSyncButtonExtension() {
		// Remove existing extensions if any (this is safe to call even if none exists)
		if (this.syncButtonExtension) {
			// Obsidian will handle cleanup when extensions are replaced
		}
		if (this.hideDexCommentsExtension) {
			// Obsidian will handle cleanup when extensions are replaced
		}
		
		// Always register the hide-dex-comments extension (it checks the setting internally)
		this.hideDexCommentsExtension = createHideDexCommentsExtension(this);
		this.registerEditorExtension(this.hideDexCommentsExtension);
		
		// Add sync button extension if enabled
		if (this.settings.showSyncButtons) {
			this.syncButtonExtension = createSyncButtonExtension(this);
			this.registerEditorExtension(this.syncButtonExtension);
		}
		
		// Force all open markdown views to refresh
		this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.editor) {
				// Trigger a selection change to force CodeMirror extensions to re-render
				const cursor = view.editor.getCursor();
				view.editor.setCursor(cursor);
			}
		});
	}

	updateStatusBar() {
		if (!this.statusBarItem) return;
		
		const { syncedCount, totalCount } = this.countMemos();
		
		if (totalCount === 0) {
			this.statusBarItem.setText('');
			this.statusBarItem.style.display = 'none';
		} else {
			this.statusBarItem.setText(`${syncedCount}/${totalCount} Dex memos`);
			this.statusBarItem.style.display = '';
			this.statusBarItem.setAttribute('title', `${syncedCount} synced, ${totalCount - syncedCount} need sync`);
		}
	}

	private countMemos(): { syncedCount: number; totalCount: number } {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			return { syncedCount: 0, totalCount: 0 };
		}

		// Get the active editor
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf || activeLeaf.view.getViewType() !== 'markdown') {
			return { syncedCount: 0, totalCount: 0 };
		}

		const view = activeLeaf.view as MarkdownView;
		const editor = view.editor;
		
		if (!editor) {
			return { syncedCount: 0, totalCount: 0 };
		}

		let syncedCount = 0;
		let totalCount = 0;

		// Scan all lines for contact mentions and memo IDs
		for (let i = 0; i < editor.lineCount(); i++) {
			const line = editor.getLine(i);
			
			// Check if line has contact mentions via Dex comments
			// Format: %%dex:contact-id=X,memo-id=Y,hash=Z%%
			const hasDexComment = MEMO_ID_PATTERN.test(line);
			const hasDexUrlLink = /\[([^\]]*)\]\(https:\/\/getdex\.com\/appv3\/contacts\/details\/([^)]+)\)/.test(line);
			const hasVaultLink = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.test(line);
			
			// Line must have both a link and a Dex comment to be counted as a tracked contact
			if (hasDexComment && (hasDexUrlLink || hasVaultLink)) {
				// This content block has contacts, check if it has memo ID
				const contentBlock = this.contentProcessor.getContentBlock(editor, i);
				totalCount++;
				
				if (contentBlock.hasExistingMemo) {
					// Get the memo data from Dex comment on start line
					const startLineText = editor.getLine(i);
					const memoMatch = startLineText.match(MEMO_ID_PATTERN);
					
					if (memoMatch) {
						const storedHash = memoMatch[3] || ''; // Group 3 contains hash
						
						// Check if content has changed since last sync
						const contentForHash = contentBlock.content.replace(MEMO_ID_CLEANUP_PATTERN, '').trim();
						const currentHash = simpleHash(contentForHash);
						
						// Count as synced if hash matches (or no hash exists - legacy)
						if (!storedHash || storedHash === currentHash) {
							syncedCount++;
						}
					}
				}
				
				// Skip to end of content block to avoid double counting
				i = contentBlock.endLine;
			}
		}

		return { syncedCount, totalCount };
	}

	onunload() {
		this.logger?.logDebug('Plugin unloading - cleaning up all components');
		
		// Clean up hover card
		if (this.contactHoverCard) {
			this.contactHoverCard.cleanup();
			this.contactHoverCard = null;
		}
		
		// Clean up status bar
		if (this.statusBarItem) {
			this.statusBarItem.remove();
			this.statusBarItem = null;
		}
		
		// Clean up contact suggestion modal (unregister from editor)
		if (this.contactSuggest) {
			// Note: Obsidian automatically handles unregistering EditorSuggest on plugin unload
			this.contactSuggest = null;
		}
		
		// Clean up sync button extension
		if (this.syncButtonExtension) {
			// Note: Obsidian automatically handles unregistering EditorExtensions on plugin unload
			this.syncButtonExtension = null;
		}
		
		// Clean up managers (these don't have active listeners, but good practice)
		this.contactManager = null;
		this.memoManager = null;
		this.contentProcessor = null;
		this.contactSelectionManager = null;
		this.notifications = null;
		
		// Clean up API client
		this.apiClient = null;
		
		// Clean up CSS manager
		if (this.cssManager) {
			this.cssManager.removeCSS();
			this.cssManager = null;
		}
		
		// Clean up logger
		this.logger?.logDebug('Plugin cleanup complete');
		this.logger = null;
		
		// Note: Commands and event handlers are automatically cleaned up by Obsidian
		// when the plugin unloads via this.addCommand() and this.registerEvent()
	}



	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		
		// Clean up any invalid contact card fields
		const validFields: ContactCardField[] = ['name', 'title', 'email', 'phone', 'linkedin', 'description', 'birthday'];
		this.settings.contactCardFields = this.settings.contactCardFields.filter(
			(field): field is ContactCardField => validFields.includes(field as ContactCardField)
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async forceRefreshContacts() {
		if (this.contactManager) {
			await this.contactManager.forceRefreshContacts();
		}
	}

	clearContactCache() {
		if (this.contactManager) {
			this.contactManager.clearCache();
		}
		this.lastTestedApiKey = '';
		this.logger.logDebug('Contact cache cleared');
		new Notice('Dex contact cache cleared');
	}

	async diagnoseConnection() {
		if (!this.apiClient) {
			this.notifications.showNotification('❌ No API client configured. Please set up your Dex API key first.', 'error');
			return;
		}

		this.notifications.showNotification('🔍 Testing API connection...', 'info');
		this.logger.logDebug('Starting connection test');

		try {
			const result = await this.apiClient.testConnection();
			
			// Log detailed results
			this.logger.logDebug('Connection test completed', result);
			
			// Show user-friendly results
			if (result.success) {
				this.notifications.showNotification('✅ Connection test passed! API is working correctly.', 'success');
		} else {
			this.notifications.showNotification(`❌ Connection failed: ${result.error}`, 'error');
		}
		
	} catch (error) {
		this.logger.logError('Connection test failed', error);
		this.notifications.showNotification(`❌ Connection test failed: ${getErrorMessage(error)}`, 'error');
	}
}	private async syncCurrentLine(editor: Editor, view: MarkdownView): Promise<void> {
		if (!this.contactManager?.getContacts() || this.contactManager.getContacts().length === 0) {
			new Notice('No contacts loaded. Please check your API key and try refreshing.', NOTIFICATION_ERROR_DURATION);
			return;
		}

		const cursor = editor.getCursor();
		const lineContent = editor.getLine(cursor.line);
		
		// Find contacts mentioned on this line
		const mentionedContacts = this.contentProcessor.findContactsInLine(lineContent);
		
		if (mentionedContacts.length === 0) {
			new Notice('No contacts found on current line', NOTIFICATION_INFO_DURATION);
			return;
		}

		// If multiple contacts, let user choose or sync all
		if (mentionedContacts.length === 1) {
			const contact = mentionedContacts[0];
			try {
				await this.memoManager.syncContactMemo(contact, cursor.line, editor);
				// Notification is now handled by syncContactMemo
			} catch (error) {
				const errorMessage = getErrorMessage(error);
				new Notice(`❌ Failed to sync memo for ${contact.name}: ${errorMessage}`, NOTIFICATION_ERROR_DURATION);
			}
		} else {
			// Multiple contacts - sync all
			let syncCount = 0;
			for (const contact of mentionedContacts) {
				try {
					await this.memoManager.syncContactMemo(contact, cursor.line, editor);
					syncCount++;
				} catch (error) {
					this.logger.logError(`Failed to sync with ${contact.name}`, error);
				}
			}
			new Notice(`✅ Synced memo with ${syncCount}/${mentionedContacts.length} contacts`, NOTIFICATION_SUCCESS_DURATION);
		}
	}

	private async syncAllMemos(editor: Editor, view: MarkdownView): Promise<void> {
		if (!this.contactManager?.getContacts() || this.contactManager.getContacts().length === 0) {
			new Notice('No contacts loaded. Please check your API key and try refreshing.', NOTIFICATION_ERROR_DURATION);
			return;
		}

		const lineCount = editor.lineCount();
		let totalSynced = 0;
		let totalErrors = 0;
		const contactsSynced = new Set<string>();

		new Notice('🔄 Syncing all memos in document...', NOTIFICATION_INFO_DURATION);
		
		// Process each line in the document
		for (let lineNum = 0; lineNum < lineCount; lineNum++) {
			const lineContent = editor.getLine(lineNum);
			
			// Find contacts mentioned on this line
			const mentionedContacts = this.contentProcessor.findContactsInLine(lineContent);
			
			if (mentionedContacts.length > 0) {
				// ONLY sync memo with the FIRST contact on this line
				// Other contacts are just mentioned, but the memo belongs to the first one
				const firstContact = mentionedContacts[0];
				try {
					await this.memoManager.syncContactMemo(firstContact, lineNum, editor);
					contactsSynced.add(firstContact.id);
					totalSynced++;
				} catch (error) {
					this.logger.logError(`Failed to sync line ${lineNum + 1} with ${firstContact.name}`, error);
					totalErrors++;
				}
			}
		}

		// Show summary notification
		if (totalSynced > 0) {
			const uniqueContacts = contactsSynced.size;
			new Notice(
				`✅ Synced ${totalSynced} memo${totalSynced !== 1 ? 's' : ''} with ${uniqueContacts} contact${uniqueContacts !== 1 ? 's' : ''}` +
				(totalErrors > 0 ? ` (${totalErrors} error${totalErrors !== 1 ? 's' : ''})` : ''),
				NOTIFICATION_SUCCESS_DURATION
			);
		} else {
			new Notice('No contact mentions found in document', NOTIFICATION_INFO_DURATION);
		}
	}

	// Wrapper method for sync button extension
	async syncContactMemo(contact: ProcessedContact, lineNumber: number, editor: Editor): Promise<string> {
		if (!this.memoManager) {
			throw new Error('Memo manager not initialized');
		}
		
		if (!this.apiClient) {
			throw new Error('API client not configured - please set your Dex API key');
		}
		
		this.logger?.logDebug('Sync button triggered memo sync', {
			contactId: contact.id,
			contactName: contact.name,
			lineNumber
		});
		
		return await this.memoManager.syncContactMemo(contact, lineNumber, editor);
	}

	cleanupDexTags(editor: Editor) {
		const content = editor.getValue();
		let cleanedContent = content;
		let removeCount = 0;
		
		// Remove all Dex comments using the unified cleanup pattern
		// Pattern matches: %%dex:...%%
		const dexPattern = MEMO_ID_CLEANUP_PATTERN;
		const matches = cleanedContent.match(dexPattern);
		if (matches) {
			removeCount += matches.length;
			cleanedContent = cleanedContent.replace(dexPattern, '');
		}
		
		// Clean up any extra whitespace that might be left
		cleanedContent = cleanedContent.replace(/\s+$/gm, ''); // Remove trailing whitespace from lines
		
		if (removeCount > 0) {
			editor.setValue(cleanedContent);
			new Notice(`✅ Removed ${removeCount} Dex tags from the note`, NOTIFICATION_INFO_DURATION);
			this.logger?.logDebug(`Cleaned up ${removeCount} Dex tags from note`);
		} else {
			new Notice('No Dex tags found to remove', NOTIFICATION_INFO_DURATION);
		}
	}

	/**
	 * Schedule an auto-sync after the debounce delay.
	 * Cancels any pending auto-sync and starts a new timer.
	 */
	private scheduleAutoSync() {
		// Cancel any pending auto-sync
		if (this.autoSyncDebounceTimer !== null) {
			window.clearTimeout(this.autoSyncDebounceTimer);
		}

		// Schedule new auto-sync
		this.autoSyncDebounceTimer = window.setTimeout(() => {
			this.performAutoSync();
			this.autoSyncDebounceTimer = null;
		}, this.AUTO_SYNC_DELAY_MS);

		this.logger?.logDebug('Auto-sync scheduled', { delayMs: this.AUTO_SYNC_DELAY_MS });
	}

	/**
	 * Temporarily disable auto-sync for the next document modification.
	 * Used when programmatically updating the document (e.g., adding contact IDs).
	 */
	suppressNextAutoSync() {
		this.skipNextAutoSync = true;
	}

	/**
	 * Perform auto-sync for all unsynced memos in the active file.
	 */
	private async performAutoSync() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			this.logger?.logDebug('Auto-sync skipped: no active markdown view');
			return;
		}

		const editor = activeView.editor;
		const { syncedCount, totalCount } = this.countMemos();
		const unsyncedCount = totalCount - syncedCount;

		if (unsyncedCount === 0) {
			this.logger?.logDebug('Auto-sync skipped: no unsynced memos');
			return;
		}

		this.logger?.logDebug('Auto-sync starting', { unsyncedCount, totalCount });

		// Find all lines with unsynced contact memos
		let syncedThisRound = 0;
		let failedThisRound = 0;
		const contacts = this.contactManager.getContacts();

		for (let i = 0; i < editor.lineCount(); i++) {
			const line = editor.getLine(i);
			
			// Check if line has contact mentions via Dex comments
			const hasDexComment = MEMO_ID_PATTERN.test(line);
			const hasDexUrlLink = /\[([^\]]*)\]\(https:\/\/getdex\.com\/appv3\/contacts\/details\/([^)]+)\)/.test(line);
			const hasVaultLink = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.test(line);
			
			if (hasDexComment && (hasDexUrlLink || hasVaultLink)) {
				const contentBlock = this.contentProcessor.getContentBlock(editor, i);
				
				// Only sync if there's content and no existing memo, or extract contact to check hash
				const shouldSync = !contentBlock.hasExistingMemo || (() => {
					// Check if content hash has changed
					const contentForHash = contentBlock.content.replace(MEMO_ID_CLEANUP_PATTERN, '').trim();
					const currentHash = simpleHash(contentForHash);
					const hashMatch = line.match(/%%dex:[^,]*,[^,]*,hash=([^%]+)%%/);
					const storedHash = hashMatch ? hashMatch[1] : null;
					const hashMismatch = currentHash !== storedHash;
					
					this.logger?.logDebug('Auto-sync checking line', { 
						lineNum: i,
						hasExistingMemo: contentBlock.hasExistingMemo,
						currentHash,
						storedHash,
						hashMismatch
					});
					
					return hashMismatch;
				})();

				if (shouldSync) {
					// Extract contact ID from the Dex comment
					// Format: %%dex:contact-id=X,memo-id=Y,hash=Z%%
					const contactIdMatch = line.match(/%%dex:contact-id=([^,%)]+)/);
					const contactId = contactIdMatch ? contactIdMatch[1].trim() : null;

					this.logger?.logDebug('Auto-sync attempting to sync line', { 
						lineNum: i,
						contactId,
						hasContact: !!contactId
					});

					if (contactId) {
						const contact = contacts.find(c => c.id === contactId);
						if (contact) {
							this.logger?.logDebug('Auto-sync syncing contact', { 
								contactId,
								contactName: contact.name,
								lineNum: i
							});
							try {
								await this.memoManager.syncContactMemo(contact, i, editor, true); // silent = true for auto-sync
								syncedThisRound++;
							} catch (error) {
								failedThisRound++;
								this.logger?.logError('Auto-sync failed for contact', error instanceof Error ? error : new Error(getErrorMessage(error)));
							}
						} else {
							this.logger?.logDebug('Auto-sync: contact not found', { contactId });
						}
					}
				}
				
				// Skip to end of content block
				i = contentBlock.endLine;
			}
		}

		if (syncedThisRound > 0) {
			// Silent auto-sync - no notifications
			this.logger?.logDebug('Auto-sync completed', { synced: syncedThisRound, failed: failedThisRound });
		}

		if (failedThisRound > 0) {
			// Silent failure - just log it
			this.logger?.logDebug('Auto-sync had failures', { failed: failedThisRound });
		}
	}

}
