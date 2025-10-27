import { Notice, App, Editor } from 'obsidian';
import { DexApiClient } from '../api/client';
import { ProcessedContact, PluginContext } from './types';
import { DexContactsSettings } from './settings-types';
import { DebugLogger } from '../utils/debug-logger';
import { ContentProcessor } from '../utils/content-processor';
import { simpleHash } from '../utils/content-hash';
import { MarkdownConverter } from '../utils/markdown-converter';
import { MEMO_ID_CLEANUP_PATTERN } from '../constants';

export class MemoManager {
	private context: PluginContext;
	private contentProcessor: ContentProcessor;
	private markdownConverter: MarkdownConverter;

	constructor(context: PluginContext, contentProcessor: ContentProcessor) {
		this.context = context;
		this.contentProcessor = contentProcessor;
		this.markdownConverter = new MarkdownConverter(context.app.vault.getName());
	}

	setApiClient(apiClient: DexApiClient) {
		this.context.apiClient = apiClient;
	}

	updateSettings(settings: DexContactsSettings) {
		this.context.settings = settings;
	}

	async syncContactMemo(contact: ProcessedContact, lineNumber: number, editor: Editor, silent = false): Promise<string> {
		if (!this.context.apiClient) {
			throw new Error('API client not initialized');
		}

		// Get the complete content block including indented lines
		const contentBlock = this.contentProcessor.getContentBlock(editor, lineNumber);
		const { content: fullContent, endLine, hasExistingMemo, memoId: existingMemoId } = contentBlock;
		
		// Debug: Log what content we detected
		this.context.logger?.logDebug(`Sync content detected`, {
			lineNumber,
			endLine,
			fullContent: `"${fullContent}"`,
			contentLength: fullContent.length,
			hasExistingMemo,
			existingMemoId
		});
		
		// Check if content has changed by comparing hashes
		if (hasExistingMemo && existingMemoId) {
			const lastLine = editor.getLine(endLine);
			const hashMatch = lastLine.match(/data-hash="([^"]*)"/);
			const storedHash = hashMatch ? hashMatch[1] : null;
			
			// Calculate current content hash (without memo IDs)
			const contentForHash = fullContent.replace(MEMO_ID_CLEANUP_PATTERN, '').trim();
			const currentHash = simpleHash(contentForHash);
			
			if (storedHash && storedHash === currentHash) {
				this.context.logger?.logDebug(`Skipping sync - content unchanged`, {
					contactName: contact.name,
					memoId: existingMemoId,
					hash: currentHash
				});
				// Content hasn't changed, skip sync silently
				return existingMemoId;
			}
		}
		
		// Check if the existing ID is a fake/fallback ID (starts with "memo_")
		const isFakeMemoId = existingMemoId && existingMemoId.startsWith('memo_');
		
		// Generate memo content using the template
		const activeFile = this.context.app.workspace.getActiveFile();
		let memoContent = this.context.settings.memoTemplate;
		
		// Use the full content block for the memo
		const contentForMemo = fullContent;
			
		memoContent = memoContent.replace('{{date}}', this.contentProcessor.formatDate(new Date(), this.context.settings.dateFormat || 'YYYY-MM-DD'));
		memoContent = memoContent.replace('{{title}}', activeFile?.basename || 'Untitled');
		memoContent = memoContent.replace('{{content}}', this.convertMarkdownToHtml(contentForMemo));
		memoContent = memoContent.replace('{{header}}', ''); // No header for inline content
		
		if (activeFile) {
			const vaultName = this.context.app.vault.getName();
			const obsidianUri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(activeFile.path)}`;
			memoContent = memoContent.replace('{{obsidian_uri}}', obsidianUri);
		}

		// Debug: Log the final memo content before sending
		this.context.logger?.logDebug(`Final memo content for sync`, {
			template: this.context.settings.memoTemplate,
			processedContent: `"${this.convertMarkdownToHtml(contentForMemo)}"`,
			finalMemoContent: `"${memoContent}"`,
			memoLength: memoContent.length
		});

		// Create or update the note in Dex
		let result;
		if (existingMemoId && !isFakeMemoId) {
			// Only attempt update if we have a real UUID from Dex
			this.context.logger.logDebug(`Attempting to update existing memo ${existingMemoId} for ${contact.name}`);
			result = await this.context.apiClient.updateNote(existingMemoId, contact.id, memoContent);
			
			// Check if it was actually updated or if a new memo was created as fallback
			if (result.wasUpdated) {
				this.context.logger.logDebug(`Successfully updated memo ${existingMemoId} for ${contact.name}`);
			} else {
				this.context.logger.logDebug(`Update failed, created new memo ${result.id} for ${contact.name} (original ID: ${existingMemoId})`);
			}
		} else {
			// Create new memo if no ID exists or if we have a fake ID
			result = await this.context.apiClient.createNote(contact.id, memoContent);
			this.context.logger.logDebug(`Successfully created new memo ${result.id} for ${contact.name}${isFakeMemoId ? ' (replacing fake ID)' : ''}`);
		}
		
		// Generate hash of the entire content block (without any memo comments)
		const contentForHash = fullContent.replace(MEMO_ID_CLEANUP_PATTERN, '').trim();
		const contentHash = simpleHash(contentForHash);
		
		// Add or update the Dex comment on the START line (where the link is)
		// Format: %%dex:contact-id=X,memo-id=Y,hash=Z%%
		const startLine = editor.getLine(lineNumber);
		
		// Remove any existing Dex comment from the line (but preserve other spacing)
		// Only remove the comment for THIS specific contact to avoid affecting other contacts on the same line
		let updatedLine = startLine;
		
		// Build a pattern that matches this contact's link + comment specifically
		// Capture any whitespace after the comment to preserve it
		const dexUrlWithComment = new RegExp(`(\\[[^\\]]*\\]\\(https:\\/\\/getdex\\.com\\/appv3\\/contacts\\/details\\/${contact.id}\\))\\s*%%dex:[^%]*%%(\\s*)`, 'i');
		const vaultLinkWithComment = new RegExp(`(\\[\\[[^\\]]+\\]\\])\\s*%%dex:contact-id=${contact.id}(?:,[^%]*)?%%(\\s*)`, 'i');
		
		// Try to replace existing comment for this specific contact
		if (dexUrlWithComment.test(updatedLine)) {
			updatedLine = updatedLine.replace(
				dexUrlWithComment,
				`$1%%dex:contact-id=${contact.id},memo-id=${result.id},hash=${contentHash}%%$2`
			);
		} else if (vaultLinkWithComment.test(updatedLine)) {
			updatedLine = updatedLine.replace(
				vaultLinkWithComment,
				`$1%%dex:contact-id=${contact.id},memo-id=${result.id},hash=${contentHash}%%$2`
			);
		} else {
			// No existing comment found, try to add one after the link
			const dexUrlPattern = new RegExp(`(\\[[^\\]]*\\]\\(https:\\/\\/getdex\\.com\\/appv3\\/contacts\\/details\\/${contact.id}\\))`, 'i');
			const vaultLinkPattern = new RegExp(`(\\[\\[[^\\]]+\\]\\])`, 'i');
			
			if (dexUrlPattern.test(updatedLine)) {
				updatedLine = updatedLine.replace(
					dexUrlPattern,
					`$1%%dex:contact-id=${contact.id},memo-id=${result.id},hash=${contentHash}%% `
				);
			} else if (vaultLinkPattern.test(updatedLine)) {
				// For vault links, only update the FIRST one (since we can't identify by contact ID in the link)
				updatedLine = updatedLine.replace(
					vaultLinkPattern,
					`$1%%dex:contact-id=${contact.id},memo-id=${result.id},hash=${contentHash}%% `
				);
			} else {
				this.context.logger.logDebug(`Could not find contact link on line ${lineNumber} to add comment`);
			}
		}
		
		if (updatedLine !== startLine) {
			editor.setLine(lineNumber, updatedLine);
			this.context.logger.logDebug(`Added Dex comment with memo ID ${result.id} and hash ${contentHash}`);
		}
		
		this.context.logger.logDebug(`Memo sync completed for ${contact.name}`, {
			contactId: contact.id,
			memoId: result.id,
			isUpdate: !!existingMemoId,
			memoLength: memoContent.length
		});
		
		// Show notification based on whether memo was created or updated (unless silent)
		if (!silent) {
			const wasCreated = !existingMemoId || isFakeMemoId || (existingMemoId && !result.wasUpdated);
			if (wasCreated) {
				new Notice(`✅ Created memo for ${contact.name}`, 3000);
			} else {
				new Notice(`🔄 Updated memo for ${contact.name}`, 3000);
			}
		}
		
		return result.id;
	}





	private convertMarkdownToHtml(text: string): string {
		return this.markdownConverter.convertMarkdownToHtml(text);
	}
}