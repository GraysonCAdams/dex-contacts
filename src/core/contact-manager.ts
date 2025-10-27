import { Notice } from 'obsidian';
import { DexApiClient } from '../api/client';
import { ProcessedContact, DexContact, PluginContext } from './types';
import { DebugLogger } from '../utils/debug-logger';
import { ContactSuggestModal } from '../ui/contact-suggest';
import { CONTACT_CACHE_MAX_AGE, BACKGROUND_REFRESH_INTERVAL } from '../constants';

export class ContactManager {
	private context: PluginContext;
	private contactSuggest: ContactSuggestModal | null = null;
	
	private contacts: ProcessedContact[] = [];
	private contactCache: ProcessedContact[] = [];
	private fullContactCache: Map<string, DexContact> = new Map(); // Cache full contact data by ID
	private contactCacheTimestamp: number = 0;
	private loadContactsPromise: Promise<void> | null = null;
	private lastBackgroundRefresh = 0;

	constructor(context: PluginContext) {
		this.context = context;
	}

	setContactSuggest(contactSuggest: ContactSuggestModal): void {
		this.contactSuggest = contactSuggest;
	}

	getContacts(): ProcessedContact[] {
		return this.contacts;
	}

	getFullContact(contactId: string): DexContact | null {
		return this.fullContactCache.get(contactId) || null;
	}

	getAllFullContacts(): Map<string, DexContact> {
		return this.fullContactCache;
	}

	setApiClient(apiClient: DexApiClient) {
		this.context.apiClient = apiClient;
	}

	async loadContacts() {
		// If a load is already in progress, wait for it instead of starting a new one
		if (this.loadContactsPromise) {
			this.context.logger.logDebug('Load contacts already in progress, waiting for existing request');
			return this.loadContactsPromise;
		}

		if (!this.context.apiClient) {
			const message = 'Please configure your Dex API key in settings';
			this.context.logger.logError(message);
			new Notice(message);
			return;
		}

		// Start the load process and track it
		this.loadContactsPromise = this.doLoadContacts();
		
		try {
			await this.loadContactsPromise;
		} finally {
			this.loadContactsPromise = null;
		}
	}

	private async doLoadContacts() {
		// Check if we have recent cached contacts (within 1 hour)
		const cacheMaxAge = CONTACT_CACHE_MAX_AGE;
		const now = Date.now();
		
		if (this.contactCache.length > 0 && 
			this.contactCacheTimestamp > 0 && 
			(now - this.contactCacheTimestamp) < cacheMaxAge) {
			
			this.contacts = [...this.contactCache]; // Use cached contacts
			if (this.contactSuggest) {
				this.contactSuggest.setContacts(this.contacts);
			}
			
			this.context.logger.logDebug(`Using cached contacts (${this.contacts.length} contacts, cached ${Math.round((now - this.contactCacheTimestamp) / 1000 / 60)} minutes ago)`);
			new Notice(`Loaded ${this.contacts.length} contacts from cache`);
			
			// Optionally refresh in background (don't await to avoid blocking)
			this.refreshContactsInBackground();
			return;
		}

		const startTime = Date.now();
		this.context.logger.logDebug('Starting to load contacts from Dex API');

		try {
			new Notice('Loading Dex contacts...');
			const dexContacts = await this.context.apiClient.fetchAllContacts();
			this.contacts = this.context.apiClient.processContacts(dexContacts);
			if (this.contactSuggest) {
				this.contactSuggest.setContacts(this.contacts);
			}
			
			// Update cache
			this.contactCache = [...this.contacts];
			
			// Update full contact cache
			this.fullContactCache.clear();
			for (const dexContact of dexContacts) {
				this.fullContactCache.set(dexContact.id, dexContact);
			}
			
			this.contactCacheTimestamp = now;
			
			const duration = Date.now() - startTime;
			this.context.logger.logContactsLoaded(this.contacts.length, duration);
			
			new Notice(`Loaded ${this.contacts.length} contacts from Dex`);
		} catch (error) {
			const duration = Date.now() - startTime;
			this.context.logger.logError(`Failed to load contacts after ${duration}ms`, error);
			
			// Fall back to cached contacts if available
			if (this.contactCache.length > 0) {
				this.contacts = [...this.contactCache];
				if (this.contactSuggest) {
					this.contactSuggest.setContacts(this.contacts);
				}
				new Notice(`Using cached contacts (${this.contacts.length}) - failed to refresh from API`);
			} else {
				new Notice('Failed to load Dex contacts. Check your API key and connection.');
			}
		}
	}

	private async refreshContactsInBackground() {
		if (!this.context.apiClient) return;
		
		// Prevent background refresh more than once per 10 minutes
		const backgroundRefreshInterval = BACKGROUND_REFRESH_INTERVAL;
		const now = Date.now();
		if (now - this.lastBackgroundRefresh < backgroundRefreshInterval) {
			this.context.logger.logDebug(`Skipping background refresh - last refresh was ${Math.round((now - this.lastBackgroundRefresh) / 1000 / 60)} minutes ago`);
			return;
		}
		
		this.lastBackgroundRefresh = now;
		
		try {
			this.context.logger.logDebug('Background refresh of contacts started');
			const dexContacts = await this.context.apiClient.fetchAllContacts();
			const processedContacts = this.context.apiClient.processContacts(dexContacts);
			
			// Update cache and current contacts
			this.contactCache = processedContacts;
			
			// Update full contact cache
			this.fullContactCache.clear();
			for (const dexContact of dexContacts) {
				this.fullContactCache.set(dexContact.id, dexContact);
			}
			
			this.contactCacheTimestamp = Date.now();
			this.contacts = processedContacts;
			if (this.contactSuggest) {
				this.contactSuggest.setContacts(this.contacts);
			}
			
			this.context.logger.logDebug(`Background refresh completed - updated to ${processedContacts.length} contacts`);
		} catch (error) {
			this.context.logger.logError('Background refresh failed', error);
		}
	}

	async forceRefreshContacts() {
		// Clear cache to force fresh load
		this.contactCache = [];
		this.contactCacheTimestamp = 0;
		this.lastBackgroundRefresh = 0;
		
		await this.loadContacts();
	}

	clearCache() {
		this.contactCache = [];
		this.fullContactCache.clear();
		this.contactCacheTimestamp = 0;
	}

	addContactToCache(contact: ProcessedContact, fullContact?: DexContact) {
		this.context.logger.logDebug('addContactToCache called', {
			contactId: contact.id,
			contactName: contact.name,
			hasFullContact: !!fullContact,
			fullContactStructure: fullContact ? {
				id: fullContact.id,
				hasEmails: Array.isArray(fullContact.emails),
				emailCount: fullContact.emails?.length || 0,
				hasPhones: Array.isArray(fullContact.phones),
				phoneCount: fullContact.phones?.length || 0,
				jobTitle: fullContact.job_title,
				company: fullContact.company
			} : null,
			currentFullCacheSize: this.fullContactCache.size,
			currentBasicCacheSize: this.contacts.length
		});
		
		// Add to current contacts array
		this.contacts.push(contact);
		
		// Add to cache
		this.contactCache.push(contact);
		
		// Add to full contact cache if full data is provided
		if (fullContact) {
			this.fullContactCache.set(contact.id, fullContact);
			
			// Verify it was added
			const retrievedFullContact = this.fullContactCache.get(contact.id);
			this.context.logger.logDebug(`Added new contact with full data to cache`, {
				contactName: contact.name,
				contactId: contact.id,
				addedSuccessfully: !!retrievedFullContact,
				newFullCacheSize: this.fullContactCache.size,
				retrievedContactStructure: retrievedFullContact ? {
					hasEmails: Array.isArray(retrievedFullContact.emails),
					emailCount: retrievedFullContact.emails?.length || 0
				} : null
			});
		} else {
			this.context.logger.logDebug(`Added new contact to cache without full data: ${contact.name} (${contact.id})`);
		}
		
		// Update the contact suggest modal with new contacts
		if (this.contactSuggest) {
			this.contactSuggest.setContacts(this.contacts);
		}
	}
}