/**
 * Shared utility for converting Markdown to HTML
 * Used by MemoManager (for sync) and SettingsTab (for preview)
 */
export class MarkdownConverter {
	private vaultName: string;

	constructor(vaultName: string) {
		this.vaultName = vaultName;
	}

	/**
	 * Convert Markdown text to HTML, including Obsidian-specific syntax
	 * @param text The markdown text to convert
	 * @returns HTML string
	 */
	convertMarkdownToHtml(text: string): string {
		let result = text
			// Convert Obsidian [[page]] links to obsidian:// URIs
			.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, pagePath, displayText) => {
				const linkText = displayText || pagePath;
				const obsidianUri = `obsidian://open?vault=${encodeURIComponent(this.vaultName)}&file=${encodeURIComponent(pagePath)}`;
				return `<a href="${obsidianUri}">${linkText}</a>`;
			})
			// Convert markdown links [text](url) to HTML
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
			// Convert bold **text** or __text__ to HTML
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			.replace(/__(.*?)__/g, '<strong>$1</strong>')
			// Convert italic *text* or _text_ to HTML (but not if already inside bold)
			.replace(/\*((?!\*)[^*]+)\*/g, '<em>$1</em>')
			.replace(/_((?!_)[^_]+)_/g, '<em>$1</em>')
			// Convert strikethrough ~~text~~ to HTML
			.replace(/~~(.*?)~~/g, '<del>$1</del>')
			// Strip remaining markdown elements that shouldn't be converted
			.replace(/`([^`]+)`/g, '$1')         // Remove code backticks
			.replace(/^#+\s*/gm, '')             // Remove # headers
			.replace(/^>\s*/gm, '')              // Remove > blockquotes
			.trim();

		// Process lists separately to handle multi-line matching
		result = this.processListsToHtml(result);
		
		return result;
	}

	private processListsToHtml(text: string): string {
		const lines = text.split('\n');
		const processedLines: string[] = [];
		let currentList: {type: 'ul' | 'ol', items: string[]} | null = null;
		let nonListBuffer: string[] = []; // Buffer for non-list lines to join with <br />
		
		const flushNonListBuffer = () => {
			if (nonListBuffer.length > 0) {
				// Join non-list lines with <br /> tags
				processedLines.push(nonListBuffer.join('<br />'));
				nonListBuffer = [];
			}
		};
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const bulletMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
			const numberedMatch = line.match(/^(\s*)(\d+\.)\s+(.+)$/);
			
			if (bulletMatch) {
				const [, indent, , content] = bulletMatch;
				const indentLevel = this.calculateIndentLevel(indent);
				
				// Flush any non-list content before starting/continuing list
				flushNonListBuffer();
				
				if (!currentList || currentList.type !== 'ul') {
					if (currentList) {
						processedLines.push(`</${currentList.type}>`);
					}
					currentList = {type: 'ul', items: []};
					processedLines.push('<ul>');
				}
				
				// Create list item with appropriate indent class
				const listItem = indentLevel > 0 
					? `<li class="ql-indent-${indentLevel}">${content}</li>`
					: `<li>${content}</li>`;
				processedLines.push(listItem);
				
			} else if (numberedMatch) {
				const [, indent, , content] = numberedMatch;
				const indentLevel = this.calculateIndentLevel(indent);
				
				// Flush any non-list content before starting/continuing list
				flushNonListBuffer();
				
				if (!currentList || currentList.type !== 'ol') {
					if (currentList) {
						processedLines.push(`</${currentList.type}>`);
					}
					currentList = {type: 'ol', items: []};
					processedLines.push('<ol>');
				}
				
				// Create list item with appropriate indent class
				const listItem = indentLevel > 0 
					? `<li class="ql-indent-${indentLevel}">${content}</li>`
					: `<li>${content}</li>`;
				processedLines.push(listItem);
				
			} else {
				// Non-list line
				if (currentList) {
					// Close the current list before processing non-list content
					processedLines.push(`</${currentList.type}>`);
					currentList = null;
				}
				// Add to buffer - will be joined with <br /> when flushed
				nonListBuffer.push(line);
			}
		}
		
		// Close any remaining list
		if (currentList) {
			processedLines.push(`</${currentList.type}>`);
		}
		
		// Flush any remaining non-list content
		flushNonListBuffer();
		
		// Join list elements with newlines (they're already complete HTML elements)
		// but non-list content has already been joined with <br /> tags
		return processedLines.join('\n');
	}

	private calculateIndentLevel(indentString: string): number {
		// Count indentation level based on spaces/tabs
		// Assuming 2 spaces or 1 tab = 1 indent level
		const tabCount = (indentString.match(/\t/g) || []).length;
		const spaceCount = (indentString.match(/ /g) || []).length;
		
		// Each tab counts as 1 level, every 2 spaces count as 1 level
		const totalIndentLevel = tabCount + Math.floor(spaceCount / 2);
		
		// Cap at reasonable indent level (most rich text editors support up to 8-10 levels)
		return Math.min(totalIndentLevel, 8);
	}
}
