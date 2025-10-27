import { MEMO_ID_CLEANUP_PATTERN } from '../constants';

/**
 * Simple hash function for content change detection
 * Generates a consistent hash for text content to detect changes
 */
export function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash).toString(36);
}

/**
 * Clean content of memo IDs for hashing
 * Removes all memo ID sup tags to get clean content for hash generation
 */
export function cleanContentForHashing(content: string): string {
	return content.replace(MEMO_ID_CLEANUP_PATTERN, '').trim();
}