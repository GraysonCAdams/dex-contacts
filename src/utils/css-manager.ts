/**
 * CSS Manager - Centralized CSS injection and management
 * Handles all plugin-specific CSS to avoid duplication and ensure consistency
 */

import { DebugLogger } from './debug-logger';

export class CSSManager {
	private logger?: DebugLogger;
	private injectedStyleId = 'dex-contacts-essential-css';

	constructor(logger?: DebugLogger) {
		this.logger = logger;
	}

	/**
	 * Inject essential CSS for the plugin
	 * Can be called multiple times safely - will replace existing styles
	 * NOTE: CSS is now managed in styles.css, this method is kept for compatibility
	 */
	injectEssentialCSS(): void {
		// CSS is now fully managed in styles.css
		// This method is kept for backwards compatibility but does nothing
		this.logger?.logDebug('CSS Manager: CSS is managed in styles.css, skipping injection');
	}

	/**
	 * Remove all injected CSS from the document
	 * NOTE: CSS is now managed in styles.css, this is kept for cleaning up old injections
	 */
	removeCSS(): void {
		const existing = document.getElementById(this.injectedStyleId);
		if (existing) {
			existing.remove();
			this.logger?.logDebug('CSS Manager: Removed legacy injected CSS');
		}
	}

	/**
	 * Refresh CSS - useful after plugin re-enable or theme changes
	 * Also cleans up any orphaned hover cards
	 */
	refreshCSS(): void {
		this.logger?.logDebug('CSS Manager: Force refreshing CSS and cleaning up stale elements');
		
		// Re-inject CSS
		this.injectEssentialCSS();
		
		// Clean up any existing hover cards to prevent stale cards
		const existingCards = document.querySelectorAll('.dex-hover-card');
		existingCards.forEach(card => card.remove());
		
		if (existingCards.length > 0) {
			this.logger?.logDebug(`CSS Manager: Cleaned up ${existingCards.length} orphaned hover cards`);
		}
	}

	/**
	 * Verify that CSS is properly loaded
	 * @returns true if CSS is loaded, false otherwise
	 */
	isCSSLoaded(): boolean {
		const styleElement = document.getElementById(this.injectedStyleId);
		return styleElement !== null;
	}

	/**
	 * Check if hover card styles are being applied correctly
	 * @returns true if styles are applied, false otherwise
	 */
	verifyHoverCardStyles(): boolean {
		// Create a test element to check if styles are applied
		const testElement = document.createElement('div');
		testElement.className = 'dex-hover-card';
		testElement.style.visibility = 'hidden';
		testElement.style.position = 'absolute';
		testElement.style.top = '-9999px';
		document.body.appendChild(testElement);
		
		const computedStyle = getComputedStyle(testElement);
		const hasCSS = computedStyle.borderRadius === '8px'; // Check for our specific style
		
		testElement.remove();
		
		if (!hasCSS) {
			this.logger?.logDebug('CSS Manager: Hover card CSS not properly applied, may need refresh');
		}
		
		return hasCSS;
	}
}
