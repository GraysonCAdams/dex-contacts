import { Editor } from 'obsidian';
import { ContactManager } from '../core/contact-manager';
import { ProcessedContact, PluginContext } from '../core/types';
import { MEMO_ID_PATTERN } from '../constants';
import { DebugLogger } from './debug-logger';
import { detectContentBlock } from './content-block-detector';

export class ContentProcessor {
	private context: PluginContext;
	private contactManager: ContactManager | null;

	constructor(context: PluginContext, contactManager: ContactManager | null) {
		this.context = context;
		this.contactManager = contactManager;
	}

	getContentBlock(editor: Editor, startLineNumber: number): { content: string; endLine: number; hasExistingMemo: boolean; memoId: string | null } {
		const totalLines = editor.lineCount();
		
		// Use shared content block detector
		const result = detectContentBlock(
			(lineNum) => editor.getLine(lineNum),
			totalLines,
			startLineNumber
		);
		
		// Debug logging
		this.context.logger?.logDebug(`Content block detection complete`, {
			startLineNumber,
			endLine: result.endLine,
			contentLinesCount: result.contentLines.length,
			finalContent: result.contentLines.join('\n'),
			hasExistingMemo: result.hasExistingMemo,
			existingMemoId: result.memoId
		});
		
		return {
			content: result.contentLines.join('\n'),
			endLine: result.endLine,
			hasExistingMemo: result.hasExistingMemo,
			memoId: result.memoId || null
		};
	}

	findContactsInLine(lineContent: string): ProcessedContact[] {
		const mentionedContacts: ProcessedContact[] = [];
		
		// Look for Dex URL links: [@Name](https://getdex.com/appv3/contacts/details/...)
		const dexUrlMatches = lineContent.matchAll(/\[([^\]]*@[^\]]*)\]\(https:\/\/getdex\.com\/appv3\/contacts\/details\/([^)]+)\)/g);
		for (const match of dexUrlMatches) {
			const contactId = match[2];
			const contact = this.contactManager?.getContacts().find(c => c.id === contactId);
			if (contact && !mentionedContacts.includes(contact)) {
				mentionedContacts.push(contact);
			}
		}
		
		// Look for vault links: [[Path|@Name]] or [[@Name]]  
		const vaultMatches = lineContent.matchAll(/\[\[([^\]|]*@[^\]|]*)[|\]]([^\]]*)\]\]/g);
		for (const match of vaultMatches) {
			const name = match[2] || match[1]; // Use display text if available, otherwise link text
			const cleanName = name.replace('@', '').trim();
			const contact = this.contactManager?.getContacts().find(c => 
				c.name.toLowerCase().includes(cleanName.toLowerCase()) ||
				c.firstName.toLowerCase().includes(cleanName.toLowerCase())
			);
			if (contact && !mentionedContacts.includes(contact)) {
				mentionedContacts.push(contact);
			}
		}
		
		return mentionedContacts;
	}

	formatDate(date: Date, format: string): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		
		return format
			.replace('YYYY', year.toString())
			.replace('MM', month)
			.replace('DD', day);
	}
}