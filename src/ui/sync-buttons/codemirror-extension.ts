import { 
	ViewPlugin, 
	EditorView, 
	Decoration, 
	DecorationSet, 
	WidgetType,
	ViewUpdate
} from '@codemirror/view';
import { Range, StateField, StateEffect, Text } from '@codemirror/state';
import { ProcessedContact } from '../../core/types';
import { MarkdownView, Notice } from 'obsidian';
import { simpleHash } from '../../utils/content-hash';
import { detectContentBlock } from '../../utils/content-block-detector';
import { 
	NOTIFICATION_ERROR_DURATION,
	MEMO_ID_PATTERN,
	MEMO_ID_CLEANUP_PATTERN,
	DEX_URL_PATTERN,
	VAULT_LINK_PATTERN
} from '../../constants';
import { getErrorMessage } from '../../utils/error-utils';
import type DexContactsPlugin from '../../../main';


// State effect for updating sync button states
const updateSyncButtonState = StateEffect.define<{line: number, state: 'syncing' | 'synced' | 'error' | 'idle'}>({
	map: (value, change) => ({line: change.mapPos(value.line), state: value.state})
});

interface ContactMentionInfo {
	line: number;
	contacts: ProcessedContact[];
	hasExistingSyncButton?: boolean;
	syncState: 'idle' | 'syncing' | 'synced' | 'error';
	hasExistingMemo: boolean; // Track if line has memo ID
	syncStatus: 'not-synced' | 'synced' | 'needs-resync'; // Content-based sync status
	contentHash: string; // Hash of the content block
}

class SyncButtonWidget extends WidgetType {
	constructor(
		private mentionInfo: ContactMentionInfo,
		private plugin: DexContactsPlugin
	) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		// Always use a single sync button regardless of memo status
		const button = document.createElement('button');
		button.className = 'dex-inline-sync-btn';
		button.setAttribute('data-line', this.mentionInfo.line.toString());
		
		this.updateButtonAppearance(button);
		
		button.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			
			// If synced, open Dex profile instead of syncing
			if (this.mentionInfo.syncStatus === 'synced' && this.mentionInfo.syncState !== 'syncing' && this.mentionInfo.syncState !== 'error') {
				this.handleProfileClick(view, button);
			} else {
				this.handleSyncClick(view, button);
			}
		});

		return button;
	}

	private updateButtonAppearance(button: HTMLElement) {
		const { contacts, syncState, hasExistingMemo, syncStatus } = this.mentionInfo;
		const contactCount = contacts.length;
		
		let text = 'Dex';
		let icon = '';
		let className = 'dex-inline-sync-btn';
		
		// Override sync state behavior based on content-based sync status
		if (syncState === 'syncing') {
			icon = '●';
			className += ' is-syncing';
			button.setAttribute('disabled', 'true');
			button.setAttribute('title', hasExistingMemo ? 'Re-syncing memo to Dex...' : 'Syncing memo to Dex...');
		} else if (syncState === 'error') {
			icon = '✗';
			className += ' is-error';
			button.setAttribute('title', 'Error syncing memo to Dex - click to retry');
			button.removeAttribute('disabled');
		} else {
			// Use content-based sync status for appearance when not actively syncing or errored
			switch (syncStatus) {
				case 'synced':
					icon = '✓';
					className += ' is-synced is-minimal is-clickable';
					button.removeAttribute('disabled'); // Make clickable
					const contactName = contacts[0]?.name || 'Contact';
					button.setAttribute('title', `Go to ${contactName}'s Dex profile`);
					break;
				case 'needs-resync':
					icon = '↻';
					className += ' needs-resync';
					button.setAttribute('title', contactCount > 1 ? `Content changed - re-sync to Dex (${contactCount} contacts)` : 'Content changed - re-sync to Dex');
					button.removeAttribute('disabled');
					break;
				default: // not-synced
					icon = '↑';
					button.setAttribute('title', contactCount > 1 ? `Sync memo to Dex (${contactCount} contacts)` : 'Sync memo to Dex');
					button.removeAttribute('disabled');
					break;
			}
		}
		
		button.className = className;
		button.innerHTML = `<span class="dex-sync-icon">${icon}</span><span class="dex-sync-text">${text}</span>`;
	}

	/**
	 * Handle clicking a synced button to navigate to Dex profile
	 */
	private async handleProfileClick(view: EditorView, button: HTMLElement) {
		try {
			const contact = this.mentionInfo.contacts[0];
			if (!contact) {
				new Notice('Contact information not available');
				return;
			}

			const url = `https://getdex.com/appv3/contacts/details/${contact.id}`;
			window.open(url, '_blank');
			
		} catch (err) {
			console.error('[Dex] Error opening profile:', err);
			new Notice('Failed to open Dex profile');
		}
	}

	private async handleSyncClick(view: EditorView, button: HTMLElement) {
		const { line, contacts } = this.mentionInfo;
		
		// Update state to syncing
		view.dispatch({
			effects: updateSyncButtonState.of({line, state: 'syncing'})
		});

		try {
			// Get the current editor instance
			const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!markdownView) {
				throw new Error('No active markdown view');
			}

			const editor = markdownView.editor;
			
			// Sync the memo for the first contact (or all if multiple)
			const contact = contacts[0];
			
			// Validate that we have necessary data
			if (!contact || !contact.id) {
				throw new Error('Invalid contact data');
			}
			
			// Convert CodeMirror line (1-based) to Obsidian editor line (0-based)
			const memoId = await this.plugin.syncContactMemo(contact, line - 1, editor);
			
			if (memoId) {
				// Update state to synced
				view.dispatch({
					effects: updateSyncButtonState.of({line, state: 'synced'})
				});
			} else {
				throw new Error('Failed to sync memo - no memo ID returned');
			}
		} catch (error) {
			this.plugin.logger?.logError('Sync button failed', error);
			
			// Show user notification about the error
			const errorMessage = getErrorMessage(error);
			new Notice(`❌ Sync failed: ${errorMessage}`, NOTIFICATION_ERROR_DURATION);
			
			// Update state to error
			view.dispatch({
				effects: updateSyncButtonState.of({line, state: 'error'})
			});
		}
	}



	eq(other: SyncButtonWidget): boolean {
		return (
			this.mentionInfo.line === other.mentionInfo.line &&
			this.mentionInfo.contacts.length === other.mentionInfo.contacts.length &&
			this.mentionInfo.syncState === other.mentionInfo.syncState &&
			this.mentionInfo.hasExistingMemo === other.mentionInfo.hasExistingMemo &&
			this.mentionInfo.syncStatus === other.mentionInfo.syncStatus &&
			this.mentionInfo.contentHash === other.mentionInfo.contentHash
		);
	}
}

// State field to track sync button states
const syncButtonStates = StateField.define<{[line: number]: 'idle' | 'syncing' | 'synced' | 'error'}>({
	create: () => ({}),
	update: (states, tr) => {
		let newStates = states;
		
		// Reset sync states when document changes
		// Content-based sync detection via hashes will handle the actual sync status
		if (tr.docChanged) {
			const modifiedStates = {...newStates};
			// Reset temporary sync states (synced/error) on document changes
			// Keep syncing state as-is to avoid interrupting active syncs
			for (const [line, state] of Object.entries(modifiedStates)) {
				if (state === 'synced' || state === 'error') {
					modifiedStates[parseInt(line)] = 'idle';
				}
			}
			newStates = modifiedStates;
		}
		
		// Apply explicit state updates
		for (let effect of tr.effects) {
			if (effect.is(updateSyncButtonState)) {
				newStates = {...newStates, [effect.value.line]: effect.value.state};
			}
		}
		return newStates;
	}
});

function findContentBlockEnd(doc: Text, startLineNum: number): { 
	endLine: number; 
	hasExistingMemo: boolean; 
	syncStatus: 'not-synced' | 'synced' | 'needs-resync';
	contentHash: string;
} {
	// Use shared content block detector
	const result = detectContentBlock(
		(lineNum) => doc.line(lineNum + 1).text, // detectContentBlock uses 0-indexed, CodeMirror uses 1-indexed
		doc.lines,
		startLineNum - 1 // Convert from 1-indexed to 0-indexed
	);
	
	// Build content string from the cleaned lines
	const blockContent = result.contentLines.join('\n');
	
	// Generate hash of current content
	const contentHash = simpleHash(blockContent.trim());
	
	// Determine sync status
	let syncStatus: 'not-synced' | 'synced' | 'needs-resync';
	if (!result.hasExistingMemo) {
		syncStatus = 'not-synced';
	} else if (!result.storedHash) {
		// Has memo ID but no hash - needs resync to establish baseline
		syncStatus = 'needs-resync';
	} else if (result.storedHash === contentHash) {
		// Hash matches - content is synced
		syncStatus = 'synced';
	} else {
		// Hash doesn't match - content has changed, needs resync
		syncStatus = 'needs-resync';
		console.log('[Dex Sync] Hash mismatch detected', {
			startLine: startLineNum,
			endLine: result.endLine + 1, // Convert back to 1-indexed
			storedHash: result.storedHash,
			contentHash,
			blockContentPreview: blockContent.substring(0, 200),
			blockContentLength: blockContent.length
		});
	}
	
	return { 
		endLine: result.endLine + 1, // Convert back to 1-indexed
		hasExistingMemo: result.hasExistingMemo, 
		syncStatus, 
		contentHash 
	};
}

function createSyncButtonDecorations(view: EditorView, plugin: DexContactsPlugin): DecorationSet {
	const decorations: Range<Decoration>[] = [];
	const doc = view.state.doc;
	const syncStates = view.state.field(syncButtonStates);
	
	// Get the line where the cursor is currently positioned
	// Hide sync buttons on this line to allow iOS double-space autocorrect to work
	const cursorPos = view.state.selection.main.head;
	const cursorLine = doc.lineAt(cursorPos).number;
	
	// Regex patterns for contact mentions and memo IDs imported from constants
	const processedLines = new Set<number>(); // Track lines we've already processed
	const decorationPositions = new Set<number>(); // Track decoration positions to prevent duplicates
	
	const logger = plugin.logger;
	
	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		// Skip if we've already processed this line as part of a content block
		if (processedLines.has(lineNum)) {
			logger?.logDebug('Skipping already processed line', { lineNum });
			continue;
		}
		
		const line = doc.line(lineNum);
		const lineText = line.text;
		
		// Extract contact ID from the FIRST Dex comment on this line
		// Only the first contact on a line has a memo attached
		// Format: %%dex:contact-id=X,memo-id=Y,hash=Z%%
		const dexCommentMatch = lineText.match(MEMO_ID_PATTERN);
		const contactIdFromComment = dexCommentMatch && dexCommentMatch[1] ? dexCommentMatch[1].trim() : null;
		
		// Skip this line if there's no Dex comment at all
		if (!contactIdFromComment) {
			continue;
		}
		
		logger?.logDebug('Found Dex comment on line', { 
			lineNum, 
			contactId: contactIdFromComment,
			linePreview: lineText.substring(0, 100)
		});
		
		// Find the FIRST contact link on this line (which is the one that owns the memo)
		const contacts: ProcessedContact[] = [];
		
		// Check for Dex contact URLs
		let match;
		DEX_URL_PATTERN.lastIndex = 0; // Reset regex
		match = DEX_URL_PATTERN.exec(lineText); // Get only the FIRST match
		if (match) {
			const linkText = match[1];
			const dexUrl = match[2];
			const fullName = linkText.replace(/^@/, '');
			
			if (/\w/.test(fullName)) {
				const nameParts = fullName.split(' ');
				contacts.push({
					id: contactIdFromComment,
					name: fullName,
					firstName: nameParts[0] || '',
					lastName: nameParts.slice(1).join(' ') || '',
					company: '',
					imageUrl: null,
					dexUrl: dexUrl
				});
			}
		}
		
		// Check for vault links if no Dex URL was found
		if (contacts.length === 0) {
			VAULT_LINK_PATTERN.lastIndex = 0;
			match = VAULT_LINK_PATTERN.exec(lineText); // Get only the FIRST match
			if (match) {
				const linkPath = match[1];
				const displayText = match[2] || match[1];
				const fullName = displayText.replace(/^@/, '');
				
				if (/\w/.test(fullName)) {
					const nameParts = fullName.split(' ');
					contacts.push({
						id: contactIdFromComment,
						name: fullName,
						firstName: nameParts[0] || '',
						lastName: nameParts.slice(1).join(' ') || '',
						company: '',
						imageUrl: null,
						dexUrl: `https://getdex.com/appv3/contacts/details/${contactIdFromComment}`
					});
				}
			}
		}
		
		// All contacts in the array should now be valid (have contact IDs and Dex URLs)
		const validContacts = contacts.filter(contact => 
			contact.id && 
			contact.id.trim() && 
			contact.dexUrl // Must have a real Dex URL
		);
		
		// Only show sync button if we have actual linked contacts
		if (validContacts.length > 0) {
			const contentBlock = findContentBlockEnd(doc, lineNum);
			const syncState = syncStates[lineNum] || 'idle';
			
			// Check if the cursor is within this content block
			// If so, skip the decoration to allow iOS double-space autocorrect to work
			const cursorInContentBlock = cursorLine >= lineNum && cursorLine <= contentBlock.endLine;
			
			if (cursorInContentBlock) {
				logger?.logDebug('Skipping sync button (cursor in content block)', {
					lineNum,
					contentBlockStart: lineNum,
					contentBlockEnd: contentBlock.endLine,
					cursorLine
				});
				
				// Mark all lines in this content block as processed
				for (let i = lineNum; i <= contentBlock.endLine; i++) {
					processedLines.add(i);
				}
				
				continue; // Skip creating decoration for this content block
			}
			
			logger?.logDebug('Creating sync button decoration', {
				lineNum,
				contentBlockStart: lineNum,
				contentBlockEnd: contentBlock.endLine,
				decorationPos: doc.line(contentBlock.endLine).to,
				contact: validContacts[0].name
			});
			
			// Mark all lines in this content block as processed
			for (let i = lineNum; i <= contentBlock.endLine; i++) {
				processedLines.add(i);
			}
			
			const mentionInfo: ContactMentionInfo = {
				line: lineNum,
				contacts: validContacts,
				syncState,
				hasExistingMemo: contentBlock.hasExistingMemo,
				syncStatus: contentBlock.syncStatus,
				contentHash: contentBlock.contentHash
			};
			
			const widget = new SyncButtonWidget(mentionInfo, plugin);
			const decoration = Decoration.widget({
				widget,
				side: 1
			});
			
			// Place the button at the end of the content block, not just the first line
			const endLine = doc.line(contentBlock.endLine);
			const decorationPos = endLine.to;
			
			// Only add this decoration if we haven't already placed one at this position
			if (!decorationPositions.has(decorationPos)) {
				decorations.push(decoration.range(decorationPos));
				decorationPositions.add(decorationPos);
				logger?.logDebug('Added decoration at position', { decorationPos, lineNum: contentBlock.endLine });
			} else {
				logger?.logDebug('DUPLICATE: Skipping decoration at position (already exists)', { 
					decorationPos, 
					lineNum: contentBlock.endLine,
					attemptedFromLine: lineNum 
				});
			}
		}
	}
	
	return Decoration.set(decorations);
}

export const createSyncButtonExtension = (plugin: DexContactsPlugin) => [
	syncButtonStates,
	ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = createSyncButtonDecorations(view, plugin);
			}

			update(update: ViewUpdate) {
				// Recreate decorations if:
				// 1. Document changed
				// 2. Viewport changed
				// 3. Sync button states changed
				// 4. Selection changed (cursor moved) - for iOS double-space support
				if (update.docChanged || 
					update.viewportChanged || 
					update.selectionSet ||
					update.state.field(syncButtonStates) !== update.startState.field(syncButtonStates)) {
					this.decorations = createSyncButtonDecorations(update.view, plugin);
				}
			}
		},
		{
			decorations: v => v.decorations
		}
	)
];