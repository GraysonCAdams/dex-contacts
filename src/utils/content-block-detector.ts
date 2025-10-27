import { MEMO_ID_CLEANUP_PATTERN, MEMO_ID_PATTERN } from '../constants';

/**
 * Result of content block detection
 */
export interface ContentBlockResult {
	/** The last line number included in the content block (0-indexed for Editor, 1-indexed for EditorView) */
	endLine: number;
	/** Array of content lines (cleaned of Dex comments) */
	contentLines: string[];
	/** Whether this block has an existing memo */
	hasExistingMemo: boolean;
	/** The existing memo ID if present */
	memoId?: string;
	/** The stored content hash if present */
	storedHash?: string;
}

/**
 * Shared content block detection logic used by both sync button decorations and memo manager.
 * 
 * A content block includes:
 * - The starting line
 * - Any lines with MORE indentation than the start
 * - Stops at:
 *   - Empty lines (natural paragraph boundary)
 *   - List items at the SAME indentation level (new sibling item)
 *   - Headers at same or less indentation
 *   - Content at same/less indentation that's not a list item
 * 
 * @param getLine - Function to get a line by number (returns text)
 * @param totalLines - Total number of lines in the document
 * @param startLineNum - The line number to start from (0-indexed)
 * @returns Content block result with end line and cleaned content
 */
export function detectContentBlock(
	getLine: (lineNum: number) => string,
	totalLines: number,
	startLineNum: number
): ContentBlockResult {
	const startLine = getLine(startLineNum);
	const startText = startLine.trim();
	const startIndent = startLine.search(/\S/); // Find first non-whitespace character
	
	// Check if the start line is a list item
	const startIsListItem = /^(\*|-|\+|\d+\.|\d+\))\s/.test(startText);
	
	// Extract memo info from the start line
	let hasExistingMemo = false;
	let memoId: string | undefined;
	let storedHash: string | undefined;
	
	const memoMatch = startLine.match(MEMO_ID_PATTERN);
	if (memoMatch) {
		hasExistingMemo = !!memoMatch[2]; // Group 2 contains memo ID
		memoId = memoMatch[2] || undefined;
		storedHash = memoMatch[3] || undefined;
	}
	
	// Start with the first line (cleaned)
	const contentLines: string[] = [];
	const cleanStartLine = startLine.replace(MEMO_ID_CLEANUP_PATTERN, '').trim();
	contentLines.push(cleanStartLine);
	
	let endLine = startLineNum;
	
	// Look for indented content and list items on subsequent lines
	for (let i = startLineNum + 1; i < totalLines; i++) {
		const currentLine = getLine(i);
		
		// Empty line = natural paragraph boundary
		if (!currentLine.trim()) {
			break;
		}
		
		const currentIndent = currentLine.search(/\S/);
		const trimmedLine = currentLine.trim();
		
		// Check if this line is a list item
		const isListItem = /^(\*|-|\+|\d+\.|\d+\))\s/.test(trimmedLine);
		const isBlockquote = /^>\s/.test(trimmedLine);
		const isHeader = /^#{1,6}\s/.test(trimmedLine);
		
		// If we started with a list item and hit another list item at the same level, STOP
		if (startIsListItem && isListItem && currentIndent === startIndent) {
			break;
		}
		
		// If we hit a header at same or less indentation, STOP
		if (isHeader && currentIndent <= startIndent) {
			break;
		}
		
		// Simple rule: ANY indentation MORE than start means continuation
		const isIndented = currentIndent > startIndent;
		
		// Include line if it's MORE indented, OR it's a continuation of content
		if (isIndented || (isBlockquote && currentIndent >= startIndent)) {
			endLine = i;
			const cleanLine = currentLine.replace(MEMO_ID_CLEANUP_PATTERN, '');
			contentLines.push(cleanLine);
		} else if (currentIndent === startIndent && !isListItem && !isHeader) {
			// Same indentation, not a list item or header = continuation
			endLine = i;
			const cleanLine = currentLine.replace(MEMO_ID_CLEANUP_PATTERN, '');
			contentLines.push(cleanLine);
		} else {
			// Stop when we reach something at same/less indentation that's a new structure
			break;
		}
	}
	
	// Remove trailing empty lines
	while (contentLines.length > 1 && !contentLines[contentLines.length - 1].trim()) {
		contentLines.pop();
	}
	
	return {
		endLine,
		contentLines,
		hasExistingMemo,
		memoId,
		storedHash
	};
}
