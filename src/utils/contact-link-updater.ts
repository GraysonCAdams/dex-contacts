import { App, Editor, MarkdownView } from 'obsidian';
import { ProcessedContact } from '../core/types';
import { DebugLogger } from './debug-logger';
import { LINK_SEARCH_RADIUS } from '../constants';

/**
 * Interface for plugin settings related to link formatting
 */
export interface LinkFormattingSettings {
	includeAtSymbol: boolean;
	stripLastName: boolean;
	includeAtInLink: boolean;
}

/**
 * Utility class for updating contact links in markdown documents
 * Handles various link formats (vault links, external links)
 */
export class ContactLinkUpdater {
	private app: App;
	private logger: DebugLogger | null;

	constructor(app: App, logger: DebugLogger | null = null) {
		this.app = app;
		this.logger = logger;
	}

	/**
	 * Format link text for a contact based on plugin settings
	 * 
	 * @param contact - The contact to format the link text for
	 * @param settings - Link formatting settings
	 * @returns Formatted link text (e.g., "@John Doe" or "John")
	 */
	formatLinkTextForContact(contact: ProcessedContact, settings: LinkFormattingSettings): string {
		let displayName = '';
		
		// Build the display name based on settings
		if (settings.stripLastName) {
			// Only use first name
			displayName = contact.firstName || contact.name.split(' ')[0] || contact.name;
		} else {
			// Use full name
			displayName = contact.name;
		}
		
		// Add @ symbol if settings require it
		if (settings.includeAtSymbol && settings.includeAtInLink) {
			if (!displayName.startsWith('@')) {
				displayName = '@' + displayName;
			}
		}
		
		// Remove any existing @ from the beginning to avoid double @
		if (displayName.startsWith('@@')) {
			displayName = displayName.substring(1);
		}
		
		this.logger?.logDebug('Formatted link text for contact', {
			originalName: contact.name,
			firstName: contact.firstName,
			stripLastName: settings.stripLastName,
			includeAtSymbol: settings.includeAtSymbol,
			includeAtInLink: settings.includeAtInLink,
			formattedName: displayName
		});
		
		return displayName;
	}

	/**
	 * Update a link in the editor with a new contact's information
	 * Finds and replaces the link, preserving any existing Dex comments
	 * 
	 * @param editor - The Obsidian editor instance
	 * @param newContact - The new contact to update the link to
	 * @param originalLinkText - The original link text to find and replace
	 * @param settings - Link formatting settings
	 * @param currentTargetElement - Optional target element to help locate the link
	 */
	updateLinkWithContactId(
		editor: Editor,
		newContact: ProcessedContact,
		originalLinkText: string,
		settings: LinkFormattingSettings,
		currentTargetElement?: HTMLElement | null
	): void {
		try {
			this.logger?.logDebug('Starting updateLinkWithContactId', {
				newContactId: newContact.id,
				newContactName: newContact.name,
				originalLinkText
			});

			const cursor = editor.getCursor();
			let targetLineNum = cursor.line;
			let targetLineText = editor.getLine(targetLineNum);
			
			this.logger?.logDebug('Initial cursor position', {
				line: targetLineNum,
				lineText: targetLineText
			});

			// If we have a stored target element, try to use it to find the right line
			if (currentTargetElement) {
				this.logger?.logDebug('Using stored target element to locate link');
				const linkText = currentTargetElement.textContent?.trim() || '';
				this.logger?.logDebug('Target element text', { linkText });
				
				// Search a few lines around the cursor for the contact name
				let foundLine = false;
				
				for (let offset = -LINK_SEARCH_RADIUS; offset <= LINK_SEARCH_RADIUS; offset++) {
					const checkLineNum = targetLineNum + offset;
					if (checkLineNum >= 0 && checkLineNum < editor.lineCount()) {
						const checkLineText = editor.getLine(checkLineNum);
						this.logger?.logDebug('Checking line for original link', { 
							lineNum: checkLineNum, 
							lineText: checkLineText 
						});
						
						// Look for the original link text in this line (not the new contact name)
						if (checkLineText.includes(originalLinkText)) {
							this.logger?.logDebug('Found original link text', { lineNum: checkLineNum });
							targetLineNum = checkLineNum;
							targetLineText = checkLineText;
							foundLine = true;
							break;
						}
					}
				}
				
				if (!foundLine) {
					this.logger?.logDebug('Could not find line containing contact name, using cursor position');
				}
			}

			// Format the new display text
			const newDisplayText = this.formatLinkTextForContact(newContact, settings);
			
			this.logger?.logDebug('Formatted new display text', { 
				displayText: newDisplayText,
				targetLineText 
			});
			
			// Look for various link formats that might contain our original link text
			const escapedOriginalText = this.escapeRegex(originalLinkText);
			const patterns = [
				{
					name: 'Vault link with display text',
					regex: new RegExp(`\\[\\[${escapedOriginalText}\\|${escapedOriginalText}\\]\\]`, 'gi'),
					replacement: () => `[[${newDisplayText}|${newDisplayText}]]`
				},
				{
					name: 'Vault link with different path - e.g. [[/@Name|@Name]]',
					regex: new RegExp(`\\[\\[[^\\]]*${escapedOriginalText}\\|${escapedOriginalText}\\]\\]`, 'gi'),
					replacement: () => `[[${newDisplayText}|${newDisplayText}]]`
				},
				{
					name: 'Simple vault link',
					regex: new RegExp(`\\[\\[${escapedOriginalText}\\]\\]`, 'gi'),
					replacement: () => `[[${newDisplayText}]]`
				},
				{
					name: 'External link',
					regex: new RegExp(`\\[${escapedOriginalText}\\]\\(([^)]+)\\)`, 'gi'),
					replacement: (match: string, url: string) => `[${newDisplayText}](${url})`
				}
			];

			let updatedLine = targetLineText;
			let wasUpdated = false;
			let matchedPattern: string | null = null;

			this.logger?.logDebug('Testing link patterns for update');
			for (const pattern of patterns) {
				this.logger?.logDebug('Testing pattern', { 
					name: pattern.name,
					regex: pattern.regex.toString()
				});
				
				// Reset regex lastIndex to ensure fresh matching
				pattern.regex.lastIndex = 0;
				
				const testMatch = pattern.regex.exec(targetLineText);
				if (testMatch) {
					this.logger?.logDebug('Pattern matched', { 
						pattern: pattern.name,
						match: testMatch[0],
						groups: testMatch.slice(1)
					});
					
					// Reset regex again for replacement
					pattern.regex.lastIndex = 0;
					updatedLine = targetLineText.replace(pattern.regex, pattern.replacement as any);
					wasUpdated = true;
					matchedPattern = pattern.name;
					this.logger?.logDebug('Line updated', { updatedLine });
					break;
				}
			}

			if (!wasUpdated) {
				this.logger?.logDebug('No patterns matched - trying broader search');
				
				// Let's try to find ANY link with this original link text, regardless of format
				const broadPatterns = [
					`\\[\\[.*${escapedOriginalText}.*\\]\\]`,
					`\\[.*${escapedOriginalText}.*\\]\\([^)]*\\)`
				];
				
				for (const broadPattern of broadPatterns) {
					const regex = new RegExp(broadPattern, 'gi');
					const match = regex.exec(targetLineText);
					if (match) {
						this.logger?.logDebug('Found broad match', { match: match[0], pattern: broadPattern });
					}
				}
			}

			if (wasUpdated) {
				this.logger?.logDebug('Successfully updated line', { 
					pattern: matchedPattern,
					original: targetLineText,
					updated: updatedLine
				});
				
				// Now add or update the Dex comment for this specific link
				// We need to find the link we just updated and add/update its comment
				const escapedNewText = this.escapeRegex(newDisplayText);
				
				// Build patterns to find the updated link and its possible existing comment
				const linkWithCommentPatterns = [
					{
						// Vault link with existing comment: [[name]]%%dex:...%%
						regex: new RegExp(`(\\[\\[${escapedNewText}\\]\\])\\s*%%dex:contact-id=[^%]*%%`, 'i'),
						replacement: `$1%%dex:contact-id=${newContact.id}%% `
					},
					{
						// External link with existing comment: [name](url)%%dex:...%%
						regex: new RegExp(`(\\[${escapedNewText}\\]\\([^)]+\\))\\s*%%dex:contact-id=[^%]*%%`, 'i'),
						replacement: `$1%%dex:contact-id=${newContact.id}%% `
					},
					{
						// Vault link without comment: [[name]]
						regex: new RegExp(`(\\[\\[${escapedNewText}\\]\\])(?!%%dex:)`, 'i'),
						replacement: `$1%%dex:contact-id=${newContact.id}%% `
					},
					{
						// External link without comment: [name](url)
						regex: new RegExp(`(\\[${escapedNewText}\\]\\([^)]+\\))(?!%%dex:)`, 'i'),
						replacement: `$1%%dex:contact-id=${newContact.id}%% `
					}
				];
				
				let commentAdded = false;
				for (const pattern of linkWithCommentPatterns) {
					if (pattern.regex.test(updatedLine)) {
						updatedLine = updatedLine.replace(pattern.regex, pattern.replacement);
						commentAdded = true;
						this.logger?.logDebug('Added/updated Dex comment for link', {
							contactId: newContact.id,
							finalLine: updatedLine
						});
						break;
					}
				}
				
				if (!commentAdded) {
					this.logger?.logDebug('Could not add Dex comment - link not found in expected format');
				}
				
				// Replace the line in the editor
				editor.setLine(targetLineNum, updatedLine);
				this.logger?.logDebug('Line updated in editor with Dex comment');
				
				// Force a refresh of the document view to recognize the new contact
				this.refreshEditorView();
			} else {
				this.logger?.logDebug('No matching link pattern found to update', {
					targetLineText,
					originalLinkText,
					newDisplayText,
					contactId: newContact.id,
					targetLineNum
				});
			}
		} catch (error) {
			this.logger?.logError('Failed to update link with contact ID', error);
		}
	}

	/**
	 * Refresh the editor view to update CodeMirror extensions
	 * Triggers a re-render after link updates
	 */
	private refreshEditorView(): void {
		setTimeout(() => {
			this.logger?.logDebug('Triggering document refresh');
			const activeLeaf = this.app.workspace.activeLeaf;
			if (activeLeaf && activeLeaf.view && activeLeaf.view.getViewType() === 'markdown') {
				this.logger?.logDebug('Active leaf found, refreshing editor');
				const markdownView = activeLeaf.view as MarkdownView;
				// Force a re-render of the editor to update contact detection
				if (markdownView.editor) {
					markdownView.editor.refresh();
					this.logger?.logDebug('Editor refreshed');
				}
				// Also trigger a document change event to refresh CodeMirror extensions
				const changeEvent = new Event('editor-change');
				activeLeaf.view.containerEl.dispatchEvent(changeEvent);
				this.logger?.logDebug('Change event dispatched');
			}
		}, 200);
	}

	/**
	 * Escape special regex characters in a string
	 * 
	 * @param string - The string to escape
	 * @returns Escaped string safe for use in RegExp
	 */
	private escapeRegex(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
