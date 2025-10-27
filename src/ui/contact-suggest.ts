import { ProcessedContact, DexContact } from '../core/types';
import { EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile, App, Editor } from 'obsidian';
import Fuse from 'fuse.js';
import { ContactCreationModal } from './contact-creation-modal';
import { DexApiClient } from '../api/client';
import { DexContactsSettings } from '../core/settings-types';
import { DebugLogger } from '../utils/debug-logger';
import {
	FUZZY_SEARCH_THRESHOLD,
	MIN_MATCH_CHAR_LENGTH,
	FUZZY_WEIGHT_FIRST_NAME,
	FUZZY_WEIGHT_LAST_NAME,
	FUZZY_WEIGHT_FULL_NAME,
	FUZZY_WEIGHT_COMPANY
} from '../constants';

export interface ContactSuggestion extends ProcessedContact {
	displayName: string;
	isAddToDex?: boolean; // Flag for "Add to Dex" option
}

export class ContactSuggestModal extends EditorSuggest<ContactSuggestion> {
	private contacts: ProcessedContact[] = [];
	private fuse: Fuse<ProcessedContact>;
	private settings: DexContactsSettings;
	private logger: DebugLogger;
	private apiClient?: DexApiClient;
	private onSelectCallback?: (contact: ProcessedContact, replaceFrom: number, replaceTo: number) => void;
	private onContactCreated?: (contact: ProcessedContact) => void;
	private lastTriggerPosition: { line: number; ch: number } | null = null;

	constructor(app: App, contacts: ProcessedContact[], settings: DexContactsSettings, logger: DebugLogger, apiClient?: DexApiClient) {
		super(app);
		this.settings = settings;
		this.logger = logger;
		this.apiClient = apiClient;
		this.setContacts(contacts);
	}

	setContacts(contacts: ProcessedContact[]) {
		this.logger?.logDebug(`ContactSuggest setContacts called with: ${contacts.length} contacts`);
		this.contacts = contacts;
		this.fuse = new Fuse(contacts, {
			keys: [
				{ name: 'firstName', weight: FUZZY_WEIGHT_FIRST_NAME },
				{ name: 'lastName', weight: FUZZY_WEIGHT_LAST_NAME },
				{ name: 'name', weight: FUZZY_WEIGHT_FULL_NAME },
				{ name: 'company', weight: FUZZY_WEIGHT_COMPANY }
			],
			threshold: FUZZY_SEARCH_THRESHOLD,
			includeScore: true,
			minMatchCharLength: MIN_MATCH_CHAR_LENGTH,
			ignoreLocation: true,   // Don't penalize matches not at beginning
			findAllMatches: true,
			useExtendedSearch: false,
			shouldSort: true,
			getFn: (obj, path) => {
				// Custom getter for better matching
				const value = Fuse.config.getFn(obj, path);
				if (typeof value === 'string') {
					return value.toLowerCase();
				}
				return value;
			}
		});
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
		const currentLine = editor.getLine(cursor.line);
		const textBeforeCursor = currentLine.substring(0, cursor.ch);
		
		// Enhanced regex pattern to support multi-word names (including spaces)
		// Pattern: @ followed by letters, numbers, spaces, apostrophes, hyphens, and periods
		const match = textBeforeCursor.match(/@([a-zA-Z0-9\s'.-]*)$/);
		
		if (!match) {
			// No @ match found - return null to allow other plugins to suggest
			// (like Various Complements, Natural Language Dates, etc.)
			return null;
		}
		
		const query = match[1];
		const fullMatch = match[0]; // "@" + query
		const startCh = cursor.ch - fullMatch.length;
		
		// Basic validation
		if (startCh < 0 || currentLine.charAt(startCh) !== '@') {
			return null;
		}
		
		// Check if we have any contacts that could match this query
		// If no potential matches, return null to allow other plugins
		const hasMatches = this.wouldHaveSuggestions(query);
		if (!hasMatches) {
			return null;
		}
		
		return {
			start: { line: cursor.line, ch: startCh },
			end: cursor,
			query: query
		};
	}
	
	// Helper method to check if we would have suggestions without actually generating them
	private wouldHaveSuggestions(query: string): boolean {
		// Always suggest if query is empty (show recent contacts)
		if (!query || query.length === 0) {
			return this.contacts.length > 0;
		}
		
		const queryLower = query.trim().toLowerCase();
		if (queryLower.length === 0) {
			return this.contacts.length > 0;
		}
		
		// Always return true for valid queries - we can always offer "Add to Dex" option
		// This ensures the dropdown appears even when no existing contacts match
		return true;
	}

	getSuggestions(context: EditorSuggestContext): ContactSuggestion[] {
		const { query } = context;
		
		// Debug logging
		this.logger?.logDebug(`getSuggestions called with query: "${query}"`);
		
		// Handle empty query - show first 10 contacts
		if (!query || query.length === 0) {
			const results = this.contacts.slice(0, 10).map(contact => ({
				...contact,
				displayName: this.formatDisplayName(contact)
			}));
			this.logger?.logDebug(`Returning ${results.length} contacts for empty query`);
			return results;
		}

		const queryLower = query.toLowerCase().trim();
		
		// Get all potential matches with enhanced scoring for multi-word names
		const scoredMatches: Array<{ contact: ProcessedContact; score: number; matchType: string }> = [];
		
		this.contacts.forEach(contact => {
			const firstName = contact.firstName.toLowerCase();
			const lastName = contact.lastName.toLowerCase();
			const fullName = contact.name.toLowerCase();
			
			let bestScore = 0;
			let bestMatchType = '';
			
			// 1. FULL NAME PREFIX MATCHES (highest priority for multi-word queries)
			if (fullName.startsWith(queryLower)) {
				const completeness = queryLower.length / fullName.length;
				const score = 2.5 + completeness; // Highest priority for full name matches
				if (score > bestScore) {
					bestScore = score;
					bestMatchType = 'fullName-prefix';
				}
			}
			
			// 2. EXACT PREFIX MATCHES (high priority)
			if (firstName.startsWith(queryLower)) {
				const completeness = queryLower.length / firstName.length;
				const score = 2.0 + completeness;
				if (score > bestScore) {
					bestScore = score;
					bestMatchType = 'firstName-prefix';
				}
			}
			
			if (lastName.startsWith(queryLower)) {
				const completeness = queryLower.length / lastName.length;
				const score = 1.8 + completeness;
				if (score > bestScore) {
					bestScore = score;
					bestMatchType = 'lastName-prefix';
				}
			}
			
			// 3. MULTI-WORD MATCHING (for queries with spaces)
			if (queryLower.includes(' ')) {
				const queryWords = queryLower.split(/\s+/);
				const nameWords = fullName.split(/\s+/);
				
				// Check if query words match the beginning of name words in order
				let matchCount = 0;
				let queryWordIndex = 0;
				
				for (let nameWordIndex = 0; nameWordIndex < nameWords.length && queryWordIndex < queryWords.length; nameWordIndex++) {
					if (nameWords[nameWordIndex].startsWith(queryWords[queryWordIndex])) {
						matchCount++;
						queryWordIndex++;
					}
				}
				
				if (matchCount === queryWords.length) {
					// All query words matched in order
					const completeness = queryWords.length / nameWords.length;
					const score = 2.2 + completeness * 0.5; // High score for multi-word matches
					if (score > bestScore) {
						bestScore = score;
						bestMatchType = 'multiWord-ordered';
					}
				}
			}
			
			// 2. SUBSTRING MATCHES (medium priority)
			if (firstName.includes(queryLower) && !firstName.startsWith(queryLower)) {
				const position = firstName.indexOf(queryLower);
				const positionBonus = position === 0 ? 0.5 : Math.max(0, 0.3 - position * 0.05);
				const lengthRatio = queryLower.length / firstName.length;
				const score = 1.2 + lengthRatio + positionBonus;
				if (score > bestScore) {
					bestScore = score;
					bestMatchType = 'firstName-contains';
				}
			}
			
			if (lastName.includes(queryLower) && !lastName.startsWith(queryLower)) {
				const position = lastName.indexOf(queryLower);
				const positionBonus = position === 0 ? 0.5 : Math.max(0, 0.3 - position * 0.05);
				const lengthRatio = queryLower.length / lastName.length;
				const score = 1.1 + lengthRatio + positionBonus;
				if (score > bestScore) {
					bestScore = score;
					bestMatchType = 'lastName-contains';
				}
			}
			
			// 3. LEVENSHTEIN SIMILARITY (for typos and partial matches)
			const firstNameDistance = this.levenshteinDistance(queryLower, firstName.substring(0, queryLower.length + 2));
			const lastNameDistance = this.levenshteinDistance(queryLower, lastName.substring(0, queryLower.length + 2));
			
			// Calculate similarity scores (1.0 = perfect match, 0.0 = completely different)
			const maxLen = Math.max(queryLower.length, firstName.length);
			const firstNameSimilarity = 1 - (firstNameDistance / maxLen);
			const lastNameSimilarity = 1 - (lastNameDistance / Math.max(queryLower.length, lastName.length));
			
			if (firstNameSimilarity > 0.6) { // Only consider good matches
				const score = 0.8 + firstNameSimilarity * 0.4;
				if (score > bestScore) {
					bestScore = score;
					bestMatchType = 'firstName-fuzzy';
				}
			}
			
			if (lastNameSimilarity > 0.6) {
				const score = 0.7 + lastNameSimilarity * 0.3;
				if (score > bestScore) {
					bestScore = score;
					bestMatchType = 'lastName-fuzzy';
				}
			}
			
			// 4. INITIALS MATCHING (for single letter queries)
			if (queryLower.length === 1) {
				if (firstName.charAt(0).toLowerCase() === queryLower) {
					const score = 1.5;
					if (score > bestScore) {
						bestScore = score;
						bestMatchType = 'firstName-initial';
					}
				}
				if (lastName.charAt(0).toLowerCase() === queryLower) {
					const score = 1.3;
					if (score > bestScore) {
						bestScore = score;
						bestMatchType = 'lastName-initial';
					}
				}
			}
			
			// Add the contact if any match found
			if (bestScore > 0) {
				scoredMatches.push({ contact, score: bestScore, matchType: bestMatchType });
			}
		});
		
		// Fallback to Fuse.js for very poor matches (keep as backup)
		if (scoredMatches.length < 3) {
			const fuzzyResults = this.fuse.search(query);
			fuzzyResults.forEach(result => {
				// Only add if not already matched with exact logic
				const alreadyMatched = scoredMatches.some(match => match.contact.id === result.item.id);
				if (!alreadyMatched && result.score < 0.7) { // Only decent fuzzy matches
					const fuzzyScore = (1 - result.score) * 0.3; // Lower priority for Fuse.js
					scoredMatches.push({ contact: result.item, score: fuzzyScore, matchType: 'fuse-fuzzy' });
				}
			});
		}
		
		// Sort by score (highest first) and return top 10
		scoredMatches.sort((a, b) => b.score - a.score);
		
		const results = scoredMatches.slice(0, 9).map(match => ({
			...match.contact,
			displayName: this.formatDisplayName(match.contact)
		}));
		
		// Add "Add to Dex" option if we have query text and few matches
		if (queryLower.length > 0 && results.length < 5) {
			const queryCapitalized = query.split(' ')
				.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
				.join(' ');
				
			const addToDexSuggestion: ContactSuggestion = {
				id: 'ADD_TO_DEX',
				name: queryCapitalized,
				firstName: queryCapitalized.split(' ')[0] || '',
				lastName: queryCapitalized.split(' ').slice(1).join(' ') || '',
				company: '',
				imageUrl: null,
				dexUrl: '',
				displayName: `Add "${queryCapitalized}" to Dex`,
				isAddToDex: true
			};
			
			results.push(addToDexSuggestion);
		}
		
		this.logger?.logDebug(`Returning ${results.length} suggestions for query "${query}"`, {
			topMatches: results.slice(0, 3).map(r => r.name),
			hasAddToDex: results.some(r => (r as ContactSuggestion).isAddToDex)
		});
		
		return results;
	}

	private formatDisplayName(contact: ProcessedContact): string {
		let display = contact.name;
		if (contact.company) {
			display += ` (${contact.company})`;
		}
		return display;
	}

	private levenshteinDistance(str1: string, str2: string): number {
		const matrix: number[][] = [];
		
		// Initialize matrix
		for (let i = 0; i <= str2.length; i++) {
			matrix[i] = [i];
		}
		for (let j = 0; j <= str1.length; j++) {
			matrix[0][j] = j;
		}
		
		// Fill matrix
		for (let i = 1; i <= str2.length; i++) {
			for (let j = 1; j <= str1.length; j++) {
				if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1, // substitution
						matrix[i][j - 1] + 1,     // insertion
						matrix[i - 1][j] + 1      // deletion
					);
				}
			}
		}
		
		return matrix[str2.length][str1.length];
	}

	renderSuggestion(suggestion: ContactSuggestion, el: HTMLElement): void {
		const container = el.createDiv({ cls: 'dex-contact-suggestion' });
		
		if (suggestion.isAddToDex) {
			// Special rendering for "Add to Dex" option
			container.addClass('dex-add-to-dex-suggestion');
			
			// Plus icon container
			const iconContainer = container.createDiv({ cls: 'dex-avatar-container' });
			const plusIcon = iconContainer.createDiv({ cls: 'dex-plus-icon' });
			plusIcon.innerHTML = '+';
			plusIcon.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: center;
				width: 32px;
				height: 32px;
				background: var(--interactive-accent);
				color: white;
				border-radius: 50%;
				font-size: 18px;
				font-weight: bold;
			`;
			
			// Text content
			const textContainer = container.createDiv({ cls: 'dex-text-container' });
			textContainer.createDiv({ cls: 'dex-contact-name dex-add-to-dex-text' }).setText(suggestion.displayName);
			textContainer.createDiv({ cls: 'dex-contact-company' }).setText('Create new contact in Dex');
			
		} else {
			// Normal contact rendering
			// Avatar container
			const avatarContainer = container.createDiv({ cls: 'dex-avatar-container' });
			const avatar = avatarContainer.createEl('img', { cls: 'dex-avatar' });
			
			if (suggestion.imageUrl) {
				avatar.src = suggestion.imageUrl;
				avatar.onerror = () => {
					avatar.style.display = 'none';
					avatarContainer.createDiv({ cls: 'dex-avatar-placeholder' }).setText(
						suggestion.firstName.charAt(0).toUpperCase() + 
						suggestion.lastName.charAt(0).toUpperCase()
					);
				};
			} else {
				avatar.style.display = 'none';
				avatarContainer.createDiv({ cls: 'dex-avatar-placeholder' }).setText(
					suggestion.firstName.charAt(0).toUpperCase() + 
					suggestion.lastName.charAt(0).toUpperCase()
				);
			}

			// Text content
			const textContainer = container.createDiv({ cls: 'dex-text-container' });
			textContainer.createDiv({ cls: 'dex-contact-name' }).setText(suggestion.name);
			
			if (suggestion.company) {
				textContainer.createDiv({ cls: 'dex-contact-company' }).setText(suggestion.company);
			}
		}
	}

	selectSuggestion(suggestion: ContactSuggestion, evt: MouseEvent | KeyboardEvent): void {
		const context = this.context;
		if (!context) return;

		if (suggestion.isAddToDex) {
			// Handle "Add to Dex" option
			if (!this.apiClient) {
				this.logger?.logError('API client not available for contact creation');
				return;
			}

			const modal = new ContactCreationModal(
				this.app,
				this.apiClient,
				this.logger,
				suggestion.name, // Pre-fill with the query text
				(processedContact: ProcessedContact, fullContact?: DexContact) => {
					// Contact was created successfully
					this.logger?.logDebug('New contact created, processing selection', { 
						processedContact,
						hasFullContact: !!fullContact,
						fullContactStructure: fullContact ? {
							hasEmails: Array.isArray(fullContact.emails),
							emailCount: fullContact.emails?.length || 0,
							hasPhones: Array.isArray(fullContact.phones),
							phoneCount: fullContact.phones?.length || 0,
							jobTitle: fullContact.job_title
						} : null
					});
					
					// Add to contacts cache
					this.contacts.push(processedContact);
					this.setContacts(this.contacts); // Refresh fuse index
					
					// Also cache the full contact data if available
					const plugin = (this.app as any).plugins?.plugins?.['dex-contacts'];
					if (plugin?.contactManager && fullContact) {
						this.logger?.logDebug('ContactSuggest: Adding full contact to cache', {
							contactId: fullContact.id,
							hasEmails: Array.isArray(fullContact.emails),
							emailCount: fullContact.emails?.length || 0
						});
						plugin.contactManager.addContactToCache(processedContact, fullContact);
					}
					
					// Notify parent about new contact
					if (this.onContactCreated) {
						this.onContactCreated(processedContact);
					}
					
					// Process the selection with the new contact
					this.processContactSelection(processedContact, context);
				}
			);
			
			modal.open();
			return;
		}

		// Normal contact selection
		this.processContactSelection(suggestion, context);
	}
	
	private processContactSelection(contact: ProcessedContact, context: EditorSuggestContext): void {
		const { editor } = context;
		const { start, end } = context;

		// Determine what text to insert based on settings
		const insertText = this.settings.stripLastName ? contact.firstName : contact.name;

		// Replace the entire @query with just the contact name (no @ symbol)
		// start.ch points to the @ symbol, end.ch points to end of query
		editor.replaceRange(
			insertText,
			{ line: start.line, ch: start.ch },     // Replace from @ symbol
			{ line: end.line, ch: end.ch }         // To end of query
		);

		// Calculate the new end position after replacement
		const newEndPos = start.ch + insertText.length;

		// Call the callback if set
		if (this.onSelectCallback) {
			this.onSelectCallback(
				contact, 
				start.ch,  // start.ch points to where @ symbol was
				newEndPos  // end position after replacement
			);
		}
	}

	setOnSelectCallback(callback: (contact: ProcessedContact, replaceFrom: number, replaceTo: number) => void) {
		this.onSelectCallback = callback;
	}

	setOnContactCreatedCallback(callback: (contact: ProcessedContact) => void) {
		this.onContactCreated = callback;
	}
}