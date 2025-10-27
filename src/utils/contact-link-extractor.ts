import { App, MarkdownView } from 'obsidian';
import { DebugLogger } from './debug-logger';
import { MEMO_ID_PATTERN } from '../constants';

/**
 * Interface for parsed contact name parts
 */
export interface ContactNameParts {
	firstName: string;
	lastName: string;
	fullName: string;
}

/**
 * Utility class for extracting contact information from DOM elements and markdown text
 * Handles extraction of contact IDs from Dex comments in markdown source
 */
export class ContactLinkExtractor {
	private app: App;
	private logger: DebugLogger | null;

	constructor(app: App, logger: DebugLogger | null = null) {
		this.app = app;
		this.logger = logger;
	}

	/**
	 * Extract contact ID from a DOM element by finding the associated Dex comment in markdown source
	 * Uses index-based matching: finds which instance (1st, 2nd, 3rd, etc.) of the link this is in the DOM,
	 * then matches it to the same instance in the markdown source.
	 * 
	 * @param element - The HTML element to extract contact ID from (usually a link)
	 * @returns The contact ID string, or null if not found
	 */
	extractContactIdFromElement(element: HTMLElement): string | null {
		// Only process anchor tags
		if (element.tagName !== 'A') {
			this.logger?.logDebug('Element is not an anchor tag');
			return null;
		}
		
		const href = element.getAttribute('href');
		const displayText = element.textContent || '';
		
		if (!displayText) {
			this.logger?.logDebug('Link has no display text');
			return null;
		}
		
		// If this is a direct Dex URL link, extract contact ID from the href
		// Format: https://getdex.com/appv3/contacts/details/{contactId}
		if (href && href.includes('getdex.com/appv3/contacts/details/')) {
			const match = href.match(/getdex\.com\/appv3\/contacts\/details\/([a-f0-9-]+)/i);
			if (match && match[1]) {
				const contactId = match[1];
				this.logger?.logDebug('Extracted contact ID from Dex URL href', { contactId, href });
				return contactId;
			}
		}
		
		// For vault links and other cases, we need to search the markdown source
		// Get the active view - works for both Live Preview and Reading View
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf) {
			this.logger?.logDebug('No active leaf');
			return null;
		}

		const view = activeLeaf.view;
		if (!(view instanceof MarkdownView)) {
			this.logger?.logDebug('Active view is not a MarkdownView', { viewType: view.getViewType() });
			return null;
		}

		// Get the markdown source content
		// view.data works in both Live Preview and Reading View
		const markdownContent = view.data;
		if (!markdownContent) {
			this.logger?.logDebug('No markdown content available');
			return null;
		}
		
		// Find all links in the DOM with the same display text
		// This gives us the index of the current link among similar links
		// Note: We only match by display text, NOT href, because the same name
		// can appear multiple times with different contact IDs
		// IMPORTANT: Only search within the content area to match our markdown search scope
		const container = view.containerEl;
		
		// Check which mode we're in based on the element's ancestors
		// In Reading View, links are inside .markdown-preview-sizer
		// In Live Preview, links are inside .cm-content
		const isInReadingView = element.closest('.markdown-preview-view') !== null;
		const isInLivePreview = element.closest('.cm-content') !== null;
		
		let contentArea: Element | null = null;
		
		if (isInReadingView) {
			contentArea = container.querySelector('.markdown-preview-sizer');
		} else if (isInLivePreview) {
			contentArea = container.querySelector('.cm-content');
		}
		
		if (!contentArea) {
			this.logger?.logDebug('Could not find content area', {
				isInReadingView,
				isInLivePreview
			});
			return null;
		}
		
		// Verify the element is within the content area we found
		if (!contentArea.contains(element)) {
			this.logger?.logDebug('Element is not within content area, skipping', {
				contentAreaClass: contentArea.className,
				elementParent: element.parentElement?.className,
				isInReadingView,
				isInLivePreview
			});
			return null;
		}
		
		const allLinks = Array.from(contentArea.querySelectorAll('a'));
		
		const similarLinks = allLinks.filter(link => {
			return link.textContent === displayText;
		});
		
		const linkIndex = similarLinks.indexOf(element as HTMLAnchorElement);
		
		if (linkIndex === -1) {
			this.logger?.logDebug('Could not find link index in DOM', {
				displayText,
				contentAreaClass: contentArea.className,
				elementParent: element.parentElement?.className
			});
			return null;
		}
		
		this.logger?.logDebug('Found link in DOM', {
			displayText,
			href,
			linkIndex,
			totalSimilarLinks: similarLinks.length
		});
		
		// Now find the same index of this link pattern in the markdown source
		// Build search patterns based on link type
		// Note: In preview mode, external links show href="#", so we need to check markdown source
		// Try to find if this display text appears as a Dex URL or vault link in the markdown
		
		const escapedText = displayText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		let searchPattern: RegExp;
		
		// Check if the link appears as a Dex URL in the markdown by looking for the pattern
		const isDexUrl = markdownContent.includes(`[${displayText}](https://getdex.com/`);
		
		if (isDexUrl) {
			// Dex URL: [displayText](url)%%dex:
			// We don't know the exact URL, so match any getdex.com URL with this text
			searchPattern = new RegExp(`\\[${escapedText}\\]\\(https:\\/\\/getdex\\.com\\/[^)]+\\)\\s*%%dex:`, 'g');
		} else {
			// Vault link - search for |displayText]]%%dex: pattern
			// Allow optional whitespace between link and comment
			// Use global flag to find all occurrences
			searchPattern = new RegExp(`\\|${escapedText}\\]\\]\\s*%%dex:|\\[\\[${escapedText}\\]\\]\\s*%%dex:`, 'g');
		}
		
		this.logger?.logDebug('Searching markdown with pattern', { 
			pattern: searchPattern.source,
			displayText,
			linkIndex
		});
		
		// Find all occurrences of this pattern across ALL lines in the document
		// This handles multiple contacts with the same display text
		const allMatches: { match: RegExpExecArray; lineNumber: number; lineText: string }[] = [];
		const lines = markdownContent.split('\n');
		
		for (let i = 0; i < lines.length; i++) {
			const lineText = lines[i];
			searchPattern.lastIndex = 0; // Reset regex for each line
			
			let match;
			while ((match = searchPattern.exec(lineText)) !== null) {
				allMatches.push({ 
					match, 
					lineNumber: i, 
					lineText 
				});
			}
		}
		
		if (allMatches.length === 0) {
			this.logger?.logDebug('No matching links found in markdown source');
			return null;
		}
		
		this.logger?.logDebug('Found matches in markdown', {
			totalMatches: allMatches.length,
			linkIndex,
			matches: allMatches.map(m => ({
				line: m.lineNumber,
				position: m.match.index,
				text: m.lineText.substring(m.match.index, m.match.index + 50)
			}))
		});
		
		// Get the match at the same index as in DOM
		if (linkIndex >= allMatches.length) {
			this.logger?.logDebug('Link index exceeds markdown matches', {
				linkIndex,
				markdownMatches: allMatches.length
			});
			return null;
		}
		
		const targetMatch = allMatches[linkIndex];
		
		// Extract contact ID from Dex comment
		// The match already found the link pattern position, so we know where to look
		// The match.index is where the pattern starts, and match[0].length is the length
		const linkEndPosition = targetMatch.match.index + targetMatch.match[0].length;
		
		// Now look for the Dex comment that starts at or near this position
		// The comment should be immediately after the link (already includes %%dex: in our pattern)
		// So we just need to extract the contact-id from the text starting at linkEndPosition
		const textFromLinkEnd = targetMatch.lineText.substring(linkEndPosition - 6); // Go back 6 chars to include %%dex:
		
		const dexMatch = textFromLinkEnd.match(MEMO_ID_PATTERN);
		
		if (dexMatch && dexMatch[1]) {
			const contactId = dexMatch[1].trim();
			this.logger?.logDebug('Found contact ID in Dex comment', { 
				contactId,
				lineNumber: targetMatch.lineNumber,
				position: linkEndPosition
			});
			return contactId;
		}
		
		this.logger?.logDebug('No Dex comment found after the link');
		return null;
	}

	/**
	 * Parse contact name from link text
	 * 
	 * @param linkText - The text from the link to parse
	 * @returns Parsed name parts (first, last, full)
	 */
	parseContactName(linkText: string): ContactNameParts {
		// Remove @ symbol if present
		const cleanName = linkText.replace(/^@/, '').trim();
		
		const nameParts = cleanName.split(' ');
		const firstName = nameParts[0] || '';
		const lastName = nameParts.slice(1).join(' ') || '';
		
		return {
			firstName,
			lastName,
			fullName: cleanName
		};
	}
}
