import { MarkdownView, Editor, App } from 'obsidian';
import type { ProcessedContact } from '../core/types';
import type { DexContactsSettings } from '../core/settings-types';
import type { DebugLogger } from './debug-logger';

export class ContactSelectionManager {
	private app: App;
	private settings: DexContactsSettings;
	private logger: DebugLogger;

	constructor(app: App, settings: DexContactsSettings, logger: DebugLogger) {
		this.app = app;
		this.settings = settings;
		this.logger = logger;
	}

	onContactSelected(contact: ProcessedContact, replaceFrom: number, replaceTo: number): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const editor = activeView.editor;
		const cursor = editor.getCursor();
		
		// Determine display name based on stripLastName setting
		const displayName = this.settings.stripLastName ? contact.firstName : contact.name;
		
		// Create link based on settings (if link mode is enabled)
		let linkText = displayName;
		if (this.settings.linkMode === 'dex-url') {
			// For Dex URLs, the link text can optionally include @
			const linkDisplayText = this.settings.includeAtInLink ? `@${displayName}` : displayName;
			// Add Dex comment with contact ID right after the link (no space)
			linkText = `[${linkDisplayText}](${contact.dexUrl})%%dex:contact-id=${contact.id}%%`;
		} else if (this.settings.linkMode === 'vault-page') {
			// For vault pages, ALWAYS use full name for the page path (not affected by stripLastName)
			// This ensures each contact has a unique page even if display names are shortened
			const pageName = this.settings.includeAtSymbol ? `@${contact.name}` : contact.name;
			const fullPath = this.settings.vaultPath === 'vault' 
				? pageName 
				: `${this.settings.customPath}/${pageName}`;
			// The link display text CAN be shortened based on stripLastName setting
			const linkDisplayText = this.settings.includeAtInLink ? `@${displayName}` : displayName;
			// Add Dex comment with contact ID right after the link (no space)
			linkText = `[[${fullPath}|${linkDisplayText}]]%%dex:contact-id=${contact.id}%%`;
		}

		// Check if this is the first contact mention on this line (for sync button logic)
		const lineContent = editor.getLine(cursor.line);
		const isFirstContactOnLine = !this.hasExistingContactMentions(lineContent, replaceFrom);
		
		this.logger.logDebug(`Contact selected: ${displayName}`, {
			stripLastName: this.settings.stripLastName,
			includeAtInLink: this.settings.includeAtInLink,
			isFirstContactOnLine,
			lineContent: lineContent.substring(0, replaceFrom + 20), // Show context
			linkText
		});

		// Replace the plain text with link (selectSuggestion already replaced @query with displayName)
		// Now we need to replace the plain name with the formatted link
		if (this.settings.linkMode === 'dex-url' || this.settings.linkMode === 'vault-page') {
			// Add a space after the link+comment to separate from following text
			const linkWithSpace = linkText + ' ';
			
			editor.replaceRange(
				linkWithSpace,
				{ line: cursor.line, ch: replaceFrom }, // Start from where name begins
				{ line: cursor.line, ch: replaceTo }     // End where name ends
			);
			
			// Move cursor to after the Dex comment (and the space) so user can continue typing
			const newCursorPosition = replaceFrom + linkWithSpace.length;
			editor.setCursor({ line: cursor.line, ch: newCursorPosition });
		}

		// Sync notifications are now handled by inline CodeMirror sync buttons
	}

	hasExistingContactMentions(lineContent: string, currentPosition: number): boolean {
		// Look for existing contact patterns before the current position
		const beforeCurrent = lineContent.substring(0, currentPosition);
		
		// Look for patterns that suggest existing contact mentions:
		// 1. Dex URL links: [@Name](https://getdex.com/appv3/contacts/details/...)
		// 2. Vault links: [[Path|@Name]] or [[@Name]]
		// 3. Previous @ mentions that aren't part of the current trigger
		
		const dexUrlLinks = /\[[^\]]*@[^\]]*\]\(https:\/\/getdex\.com\/appv3\/contacts\/details\/[^)]+\)/g;
		const vaultLinks = /\[\[[^\]]*@[^\]]*(?:\|[^\]]*)??\]\]/g;
		
		let match;
		let hasExistingLinks = false;
		
		// Check for Dex URL links
		while ((match = dexUrlLinks.exec(beforeCurrent)) !== null) {
			hasExistingLinks = true;
			break;
		}
		
		// Check for vault links if no Dex links found
		if (!hasExistingLinks) {
			while ((match = vaultLinks.exec(beforeCurrent)) !== null) {
				hasExistingLinks = true;
				break;
			}
		}
		
		// Also check for any previous @ symbols that completed successfully
		// (basic heuristic: @ followed by word characters, then space or punctuation)
		if (!hasExistingLinks) {
			const previousAtMatches = /@\w+(?:\s+\w+)*(?=\s|$|[^\w@])/g;
			let atMatch;
			while ((atMatch = previousAtMatches.exec(beforeCurrent)) !== null) {
				// If we find a completed @ mention, this indicates a previous contact
				hasExistingLinks = true;
				break;
			}
		}
		
		return hasExistingLinks;
	}
}