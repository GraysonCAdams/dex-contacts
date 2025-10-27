import { Component, Notice, App, MarkdownView } from 'obsidian';
import { ProcessedContact, DexContact } from '../core/types';
import { DexApiClient } from '../api/client';
import { ContactCreationModal } from './contact-creation-modal';
import { CSSManager } from '../utils/css-manager';
import { DebugLogger } from '../utils/debug-logger';
import { ContactLinkExtractor } from '../utils/contact-link-extractor';
import { ContactLinkUpdater, LinkFormattingSettings } from '../utils/contact-link-updater';
import { HOVER_SHOW_DELAY, HOVER_HIDE_DELAY, STATUS_BAR_UPDATE_DELAY } from '../constants';
import { getErrorMessage } from '../utils/error-utils';
import { DexContactsSettings } from '../core/settings-types';
import { 
	Briefcase, 
	Mail, 
	Phone, 
	Cake, 
	Link as LinkIcon,
	FileText,
	Linkedin,
	type IconNode,
	createElement 
} from 'lucide';

export class ContactHoverCard {
	private app: App;
	private apiClient: DexApiClient;
	private logger: DebugLogger;
	private cssManager: CSSManager;
	private linkExtractor: ContactLinkExtractor;
	private linkUpdater: ContactLinkUpdater;
	private settings: DexContactsSettings;
	private hoverCard: HTMLElement | null = null;
	private hoverTimeout: NodeJS.Timeout | null = null;
	private hideTimeout: NodeJS.Timeout | null = null;
	private currentContactId: string | null = null;
	private pendingContactId: string | null = null;
	private currentTargetElement: HTMLElement | null = null;
	private originalLinkText: string | null = null;
	private boundHandleMouseOver: (event: MouseEvent) => void;
	private boundHandleMouseOut: (event: MouseEvent) => void;
	private popoverObserver: MutationObserver | null = null;

	constructor(app: App, apiClient: DexApiClient, logger: DebugLogger, cssManager: CSSManager, settings: DexContactsSettings) {
		this.app = app;
		this.apiClient = apiClient;
		this.logger = logger;
		this.cssManager = cssManager || new CSSManager(logger);
		this.linkExtractor = new ContactLinkExtractor(app, logger);
		this.linkUpdater = new ContactLinkUpdater(app, logger);
		this.settings = settings;
		
		// Bind event handlers once to maintain consistent references
		this.boundHandleMouseOver = this.handleMouseOver.bind(this);
		this.boundHandleMouseOut = this.handleMouseOut.bind(this);
	}

	/**
	 * Initialize hover card listeners on contact links
	 */
	initialize() {
		// Clean up any existing hover cards first
		this.cleanup();
		
		// Use event delegation to listen only for link hovers (better performance)
		document.addEventListener('mouseover', this.boundHandleMouseOver, true);
		document.addEventListener('mouseout', this.boundHandleMouseOut, true);
		
		// Set up MutationObserver to intercept default popovers in Reading View
		this.setupPopoverInterceptor();
		
		// Verify CSS is loaded, if not, inject it
		if (!this.cssManager.isCSSLoaded() || !this.cssManager.verifyHoverCardStyles()) {
			this.cssManager.refreshCSS();
		}
		
		this.logger?.logDebug('Contact hover card event listeners initialized');
	}

	/**
	 * Clean up event listeners and DOM elements
	 */
	cleanup() {
		// Remove event listeners using the same bound function references
		document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
		document.removeEventListener('mouseout', this.boundHandleMouseOut, true);
		
		// Disconnect MutationObserver
		if (this.popoverObserver) {
			this.popoverObserver.disconnect();
			this.popoverObserver = null;
		}
		
		// Clean up any active hover cards
		this.hideCard();
		
		// Clear any pending timeouts
		if (this.hoverTimeout) {
			clearTimeout(this.hoverTimeout);
			this.hoverTimeout = null;
		}
		
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}
		
		// Reset all state
		this.currentContactId = null;
		this.pendingContactId = null;
		
		// Clean up any orphaned hover cards in the DOM
		const allHoverCards = document.querySelectorAll('.dex-hover-card');
		allHoverCards.forEach(card => {
			card.remove();
		});
		
		this.logger?.logDebug('Contact hover card fully cleaned up');
	}

	/**
	 * Set up a MutationObserver to intercept and hide default page popovers in Reading View
	 * when the setting is enabled
	 */
	private setupPopoverInterceptor() {
		// Always set up the observer, but check the setting in the callback
		this.popoverObserver = new MutationObserver((mutations) => {
			// Check setting on each mutation - allows dynamic setting changes
			if (!this.settings.showContactCardsInReader) {
				return; // Setting is disabled, let default popovers show
			}

			for (const mutation of mutations) {
				mutation.addedNodes.forEach((node) => {
					if (node instanceof HTMLElement) {
						// Check if this is a default page popover
						if (node.classList.contains('popover') && node.classList.contains('hover-popover')) {
							// Check if we're hovering over a contact link
							if (this.currentTargetElement) {
								const contactId = this.extractContactIdFromElement(this.currentTargetElement);
								if (contactId) {
									// This is a contact link, hide the default popover
									node.style.display = 'none';
									this.logger?.logDebug('Intercepted and hid default page popover for contact link');
								}
							}
						}
					}
				});
			}
		});

		// Observe the entire document body for added nodes
		this.popoverObserver.observe(document.body, {
			childList: true,
			subtree: true
		});

		this.logger?.logDebug('Popover interceptor MutationObserver set up');
	}

	private ensureBaseStyles(card: HTMLElement) {
		// Ensure essential positioning styles (CSS injection handles appearance)
		card.style.position = 'absolute';
		card.style.zIndex = '10000';
		card.style.display = 'block';
		card.style.visibility = 'visible';
		card.style.opacity = '1';
		
		// Ensure CSS class is set
		if (!card.classList.contains('dex-hover-card')) {
			card.className = 'dex-hover-card';
		}
		
		this.logger?.logDebug('Applied positioning styles to hover card', {
			className: card.className,
			position: card.style.position,
			zIndex: card.style.zIndex
		});
	}

	private handleMouseOver(event: MouseEvent) {
		const target = event.target as HTMLElement;
		
		// Only process if this is a link element (performance optimization)
		if (target.tagName !== 'A') {
			return;
		}

		// Check if contact cards are enabled at all
		if (!this.settings.showContactCards) {
			this.logger?.logDebug('Contact cards disabled in settings');
			return;
		}
		
		// Check if we're in preview/reading mode
		const leafContent = target.closest('.workspace-leaf-content');
		const dataMode = leafContent?.getAttribute('data-mode');
		const isPreviewMode = dataMode === 'preview';
		
		this.logger?.logDebug('Checking view mode', {
			dataMode,
			isPreviewMode,
			showContactCardsInReader: this.settings.showContactCardsInReader,
			leafContent: !!leafContent
		});
		
		// If in preview mode and setting is disabled, don't show contact cards
		if (isPreviewMode && !this.settings.showContactCardsInReader) {
			this.logger?.logDebug('Skipping hover card in preview mode (setting disabled)');
			return;
		}
		
		this.logger?.logDebug('Hover card mouseover on link', {
			tagName: target.tagName,
			textContent: target.textContent?.substring(0, 50),
			isPreviewMode,
			showContactCardsInReader: this.settings.showContactCardsInReader
		});
		
		// Check if this is a Dex contact link by extracting the contact ID from nearby Dex comment
		const contactId = this.extractContactIdFromElement(target);
		
		this.logger?.logDebug('Contact ID extracted', { contactId });
		
		if (contactId) {
			// Clear any existing hide timeout
			if (this.hideTimeout) {
				clearTimeout(this.hideTimeout);
				this.hideTimeout = null;
			}

			// If we're already showing this contact, don't restart
			if (this.currentContactId === contactId && this.hoverCard) {
				return;
			}

			// Set a delay before showing the card (to prevent flickering)
			if (this.hoverTimeout) {
				clearTimeout(this.hoverTimeout);
			}

			this.hoverTimeout = setTimeout(() => {
				this.showCard(contactId, target, event);
			}, HOVER_SHOW_DELAY);
		}
	}

	private handleMouseOut(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const relatedTarget = event.relatedTarget as HTMLElement;

		// Check if we're moving to the hover card itself
		if (relatedTarget && (
			relatedTarget === this.hoverCard || 
			this.hoverCard?.contains(relatedTarget)
		)) {
			return; // Don't hide if moving to hover card
		}

		// Clear show timeout
		if (this.hoverTimeout) {
			clearTimeout(this.hoverTimeout);
			this.hoverTimeout = null;
		}

		// Set a delay before hiding (allows moving to hover card)
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
		}

		this.hideTimeout = setTimeout(() => {
			this.hideCard();
		}, HOVER_HIDE_DELAY);
	}

	private extractContactIdFromElement(element: HTMLElement): string | null {
		return this.linkExtractor.extractContactIdFromElement(element);
	}

	private async showCard(contactId: string, targetElement: HTMLElement, event: MouseEvent) {
		// Don't show the same card twice
		if (this.currentContactId === contactId && this.hoverCard) {
			return;
		}

		try {
			// Hide existing card first
			this.hideCard();

			// Set pending contact ID and store target element to handle race conditions
			this.pendingContactId = contactId;
			this.currentTargetElement = targetElement;
			
			// Store original link text for potential contact creation
			// Get it from the target element if available
			const linkText = this.currentTargetElement?.textContent?.trim() || '';
			if (linkText) {
				this.originalLinkText = linkText;
				this.logger?.logDebug('Stored original link text from element', { linkText });
			} else if (contactId.startsWith('potential:')) {
				this.originalLinkText = contactId.substring('potential:'.length);
				this.logger?.logDebug('Stored original link text from potential ID', { linkText: this.originalLinkText });
			}

			// Handle "potential" contact IDs (vault links without contact IDs)
			if (contactId.startsWith('potential:')) {
				const linkText = contactId.replace('potential:', '');
				this.logger?.logDebug('Showing fallback card for potential contact', { linkText });
				this.hoverCard = this.createFallbackHoverCard(linkText);
			} else {
				// Get contact details for real contact IDs
				const contact = await this.getContactDetails(contactId);
				
				// Check if this is still the contact we want to show (prevent race conditions)
				if (this.pendingContactId !== contactId) {
					this.logger?.logDebug('Contact ID changed during async fetch, ignoring result', { 
						requested: contactId, 
						current: this.pendingContactId 
					});
					return;
				}

				if (!contact) {
					this.logger?.logDebug('Contact not found for hover card, creating fallback', { contactId });
					// Create a fallback card for unknown contacts
					// Use stored original link text if available, otherwise use contactId
					const fallbackText = this.originalLinkText || contactId;
					this.hoverCard = this.createFallbackHoverCard(fallbackText);
				} else {
					// Create the normal hover card - convert DexContact to ProcessedContact for display
					const processedContact = 'first_name' in contact ? this.dexContactToProcessed(contact) : contact;
					const fullContactData = 'first_name' in contact ? contact : undefined;
					this.hoverCard = this.createHoverCardElement(processedContact, fullContactData);
				}
			}
			
			this.hoverCard.style.position = 'absolute';
			this.hoverCard.style.zIndex = '1000';
			
			document.body.appendChild(this.hoverCard);
			
			// Apply base styles after adding to DOM (now mainly for positioning)
			this.ensureBaseStyles(this.hoverCard);
			
			this.currentContactId = contactId;
			this.pendingContactId = null;

			// Position the card
			this.positionCard(targetElement, event);

			// Add event listeners to the card itself
			this.hoverCard.addEventListener('mouseover', () => {
				if (this.hideTimeout) {
					clearTimeout(this.hideTimeout);
					this.hideTimeout = null;
				}
		});

		this.hoverCard.addEventListener('mouseleave', () => {
			this.hideTimeout = setTimeout(() => {
				this.hideCard();
			}, HOVER_HIDE_DELAY);
		});		} catch (error) {
			this.logger?.logError('Failed to show contact hover card', error);
		}
	}

	private formatLinkTextForContact(contact: ProcessedContact): string {
		// Get plugin settings
		const plugin = (this.app as any).plugins?.plugins?.['dex-contacts'];
		const settings: LinkFormattingSettings = plugin?.settings || {
			includeAtSymbol: true,
			stripLastName: false,
			includeAtInLink: true
		};

		return this.linkUpdater.formatLinkTextForContact(contact, settings);
	}

	private async getContactDetails(contactId: string): Promise<DexContact | ProcessedContact | null> {
		// First try to get full contact data from the enhanced cache
		const plugin = (this.app as any).plugins?.plugins?.['dex-contacts'];
		if (plugin?.contactManager) {
			const fullContact = plugin.contactManager.getFullContact(contactId);
			this.logger?.logDebug('Full contact cache lookup', { 
				contactId,
				foundFullContact: !!fullContact,
				fullCacheSize: plugin.contactManager.getAllFullContacts().size,
				fullCacheKeys: Array.from(plugin.contactManager.getAllFullContacts().keys()).slice(0, 5) // First 5 keys for debugging
			});
			
			if (fullContact) {
				this.logger?.logDebug('Found full contact in cache', { 
					contactId, 
					name: `${fullContact.first_name} ${fullContact.last_name || ''}`.trim(),
					hasEmails: fullContact.emails?.length > 0,
					emailCount: fullContact.emails?.length || 0,
					hasPhones: fullContact.phones?.length > 0,
					phoneCount: fullContact.phones?.length || 0,
					hasCompany: !!fullContact.company,
					company: fullContact.company,
					hasBirthday: !!fullContact.birthday_current_year,
					birthday: fullContact.birthday_current_year,
					hasTitle: !!fullContact.job_title,
					jobTitle: fullContact.job_title,
					hasDescription: !!fullContact.description,
					description: fullContact.description,
					hasLinkedIn: !!fullContact.linkedin,
					linkedin: fullContact.linkedin,
					rawEmailsArray: fullContact.emails,
					rawPhonesArray: fullContact.phones,
					fullContactObject: fullContact
				});
				return fullContact;
			}
		}

		// Fall back to basic contact data if available
		const contacts = await this.getCachedContacts();
		const cachedContact = contacts.find(c => c.id === contactId);
		
		this.logger?.logDebug('Basic contact cache lookup', { 
			contactId,
			foundBasicContact: !!cachedContact,
			basicCacheSize: contacts.length,
			recentBasicContacts: contacts.slice(-3).map(c => ({ id: c.id, name: c.name })) // Last 3 contacts
		});
		
		if (cachedContact) {
			this.logger?.logDebug('Found basic contact in cache, converting to DexContact', { 
				contactId, 
				name: cachedContact.name,
				company: cachedContact.company,
				fullCachedContact: cachedContact
			});
			return this.processedContactToDexContact(cachedContact);
		}

		// Log available contacts for debugging
		this.logger?.logDebug('Contact not found in cache', { 
			requestedId: contactId,
			availableContacts: contacts.map(c => ({ id: c.id, name: c.name })),
			totalCachedContacts: contacts.length
		});

		return null;
	}

	private processedContactToDexContact(processed: ProcessedContact): DexContact {
		return {
			id: processed.id,
			first_name: processed.firstName || '',
			last_name: processed.lastName || '',
			job_title: null,
			description: null,
			emails: [],
			phones: [],
			education: null,
			image_url: processed.imageUrl || null,
			linkedin: null,
			facebook: null,
			twitter: null,
			instagram: null,
			telegram: null,
			birthday_current_year: null,
			last_seen_at: null,
			next_reminder_at: null,
			company: processed.company || null
		};
	}

	private dexContactToProcessed(dex: DexContact): ProcessedContact {
		// Extract company name from company field or job_title  
		let company = '';
		if (dex.company) {
			company = dex.company;
		} else if (dex.job_title && dex.job_title.includes(' at ')) {
			// Try to extract company from job title like "Engineer at Google"
			const parts = dex.job_title.split(' at ');
			if (parts.length > 1) {
				company = parts[parts.length - 1];
			}
		}

		return {
			id: dex.id,
			name: `${dex.first_name || ''} ${dex.last_name || ''}`.trim(),
			firstName: dex.first_name || '',
			lastName: dex.last_name || '',
			company: company || undefined,
			imageUrl: dex.image_url || undefined,
			dexUrl: `https://getdex.com/appv3/contacts/details/${dex.id}`
		};
	}

	private formatPhoneNumber(phoneNumber: string): string {
		// Remove all non-digit characters
		const digits = phoneNumber.replace(/\D/g, '');
		
		// Handle different country codes and formats
		if (digits.length === 10) {
			// US/Canada format: (555) 123-4567
			return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
		} else if (digits.length === 11 && digits.startsWith('1')) {
			// US/Canada with country code: +1 (555) 123-4567
			return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
		} else if (digits.length >= 10) {
			// International format: +XX XXX XXX XXXX
			if (digits.length === 11) {
				// Likely country code + 10 digits
				return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
			} else if (digits.length === 12) {
				// Likely 2-digit country code + 10 digits
				return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
			} else if (digits.length === 13) {
				// Likely 3-digit country code + 10 digits
				return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
			}
		}
		
		// Fall back to original if we can't format it
		return phoneNumber;
	}

	private formatBirthday(birthday: string): string {
		// Birthday format from API is YYYY-MM-DD (e.g., "2100-06-04")
		// Format as a readable date with full year
		try {
			const date = new Date(birthday);
			const month = date.toLocaleString('default', { month: 'long' });
			const day = date.getDate();
			const year = date.getFullYear();
			
			return `${month} ${day}, ${year}`;
		} catch (error) {
			// If parsing fails, return original
			return birthday;
		}
	}

	/**
	 * Create a Lucide icon SVG element
	 * @param iconNode - The Lucide icon node
	 * @param className - Optional CSS class to add
	 * @returns SVG element
	 */
	private createIcon(iconNode: IconNode, className?: string): SVGElement {
		const svgElement = createElement(iconNode, {
			width: '16',
			height: '16',
			'stroke-width': '2',
			class: className || 'dex-hover-detail-icon'
		});
		
		return svgElement;
	}

	private async getCachedContacts(): Promise<ProcessedContact[]> {
		// Get contacts from the contact manager via the main plugin
		// This is a simplified approach - in production we'd have better DI
		const plugin = (this.app as any).plugins?.plugins?.['dex-contacts'];
		if (plugin?.contactManager) {
			return plugin.contactManager.getContacts();
		}
		return [];
	}

	private createFallbackHoverCard(contactId: string): HTMLElement {
		const card = document.createElement('div');
		card.className = 'dex-hover-card dex-hover-card-fallback';
		
		// Header
		const header = card.createDiv({ cls: 'dex-hover-header' });
		
		// Unknown contact indicator
		const avatarContainer = header.createDiv({ cls: 'dex-hover-avatar-container' });
		avatarContainer.createDiv({ cls: 'dex-hover-avatar-placeholder dex-hover-avatar-unknown' })
			.setText('?');

		// Info
		const info = header.createDiv({ cls: 'dex-hover-info' });
		info.createDiv({ cls: 'dex-hover-name' }).setText('Contact Not Found');
		info.createDiv({ cls: 'dex-hover-company' }).setText('This contact isn\'t in your Dex');

		// Details
		const details = card.createDiv({ cls: 'dex-hover-details' });
		
		const helpNote = details.createDiv({ cls: 'dex-hover-info-note' });
		helpNote.setText('This contact doesn\'t exist in your Dex contacts yet. You can refresh your contacts or add them as a new contact.');

		// Actions
		const actions = card.createDiv({ cls: 'dex-hover-actions' });
		
		// Create a button container for proper spacing
		const buttonContainer = actions.createDiv({ cls: 'dex-hover-button-container' });
		
		const refreshBtn = buttonContainer.createEl('button', { 
			cls: 'dex-hover-action-btn dex-hover-refresh-btn',
			text: 'Refresh Contacts'
		});
		refreshBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.hideCard();
			// Trigger contact refresh through the plugin
			const plugin = (this.app as any).plugins?.plugins?.['dex-contacts'];
			if (plugin?.contactManager) {
				plugin.contactManager.forceRefreshContacts();
			}
		});

		const addContactBtn = buttonContainer.createEl('button', { 
			cls: 'dex-hover-action-btn dex-hover-add-contact-btn',
			text: 'Add Contact'
		});
		addContactBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.logger?.logDebug('Add Contact button clicked', { contactId });
			this.hideCard();
			// Try to extract contact name from the link context and open contact creation modal
			this.openContactCreationModal(contactId);
		});

		return card;
	}

	private updateLinkWithContactId(newContact: ProcessedContact) {
		this.logger?.logDebug('Updating link with contact ID', { 
			contact: newContact.name, 
			id: newContact.id 
		});
		
		try {
			// Get plugin reference and suppress auto-sync for this programmatic change
			const plugin = (this.app as any).plugins?.plugins?.['dex-contacts'];
			if (plugin?.suppressNextAutoSync) {
				plugin.suppressNextAutoSync();
			}

			// Get the active editor - use activeLeaf approach instead of getActiveViewOfType
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!activeLeaf || !activeLeaf.view || activeLeaf.view.getViewType() !== 'markdown') {
				this.logger?.logDebug('No active markdown view found for link update');
				return;
			}
			
			const activeView = activeLeaf.view as MarkdownView;
			if (!activeView.editor) {
				this.logger?.logDebug('No editor found in active markdown view');
				return;
			}

			const editor = activeView.editor;
			
			// Get the original link text that was clicked for line searching
			const originalLinkText = this.originalLinkText || this.currentTargetElement?.textContent?.trim() || newContact.name;
			this.logger?.logDebug('Original link text for search', { originalLinkText });

			// Get plugin settings for link formatting
			const settings: LinkFormattingSettings = plugin?.settings || {
				includeAtSymbol: true,
				stripLastName: false,
				includeAtInLink: true
			};

			// Use the link updater utility
			this.linkUpdater.updateLinkWithContactId(
				editor,
				newContact,
				originalLinkText,
				settings,
				this.currentTargetElement
			);
		} catch (error) {
			this.logger?.logError('Failed to update link with contact ID', error);
		}
	}

	private openContactCreationModal(contactId: string) {
	this.logger?.logDebug('Opening contact creation modal', { contactId });
	
	// Try to extract contact name from the current document context
	const contactName = this.extractContactNameFromContext(contactId);
	this.logger?.logDebug('Extracted contact name', contactName);
	
	// Get the plugin instance to access necessary components
	const plugin = (this.app as any).plugins?.plugins?.['dex-contacts'];
	if (!plugin) {
		this.logger?.logError('Plugin instance not available');
		return;
	}

	this.logger?.logDebug('Plugin found', { hasApiClient: !!plugin.apiClient });

	// Check if API client is available
	if (!plugin.apiClient) {
		this.logger?.logError('API client not available');
		new Notice('Please configure your Dex API key in settings before adding contacts.');
		return;
	}

	// Create the ContactCreationModal with pre-populated data
	
	try {
		this.logger?.logDebug('Creating ContactCreationModal', { name: contactName.fullName });
		const modal = new ContactCreationModal(
			this.app,
			plugin.apiClient,
			this.logger,
			contactName.fullName, // Pre-fill with extracted name
			(processedContact: ProcessedContact, fullContact: DexContact) => {
				// Contact was created successfully
				this.logger?.logDebug('New contact created from hover card', fullContact);					// processedContact is already provided by the modal
					
					// Add to the plugin's contact cache
					if (plugin.contactManager) {
						this.logger?.logDebug('About to cache new contact', {
							contactId: fullContact.id,
							processedContact: processedContact,
							dexContact: fullContact,
							dexContactStructure: {
								hasEmails: Array.isArray(fullContact.emails),
								emailCount: fullContact.emails?.length || 0,
								emails: fullContact.emails,
								hasPhones: Array.isArray(fullContact.phones),
								phoneCount: fullContact.phones?.length || 0,
								phones: fullContact.phones,
								jobTitle: fullContact.job_title,
								company: fullContact.company
							}
						});
						
					
					// Add to both caches: basic ProcessedContact and full DexContact
					plugin.contactManager.addContactToCache(processedContact, fullContact);
					
					this.logger?.logDebug('Added new contact to cache', { 
						contactId: fullContact.id, 
						dexContactName: `${fullContact.first_name} ${fullContact.last_name || ''}`.trim(),
						processedContactName: processedContact.name,
						rawContactData: {
							hasEmails: Array.isArray(fullContact.emails) && fullContact.emails.length > 0,
							emailCount: fullContact.emails?.length || 0,
							hasPhones: Array.isArray(fullContact.phones) && fullContact.phones.length > 0,
							phoneCount: fullContact.phones?.length || 0,
							jobTitle: fullContact.job_title,
							companyName: fullContact.company,
							description: fullContact.description,
							imageUrl: fullContact.image_url
						},
						cacheSize: plugin.contactManager.getContacts().length
					});						// Force refresh of contact suggest and other components
						if (plugin.contactSuggest) {
							const allContacts = plugin.contactManager.getContacts();
							plugin.contactSuggest.setContacts(allContacts);
							this.logger?.logDebug('Refreshed contact suggest with updated contacts', { 
								totalContacts: allContacts.length 
							});
						}
						
						// Verify both formats were added correctly
						const retrievedFullContact = plugin.contactManager.getFullContact(fullContact.id);
						const basicContacts = plugin.contactManager.getContacts();
						const retrievedBasicContact = basicContacts.find(c => c.id === fullContact.id);
						
						this.logger?.logDebug('Verification: Retrieved contacts from cache', { 
							fullContactFound: !!retrievedFullContact,
							basicContactFound: !!retrievedBasicContact,
							contactId: fullContact.id,
							fullContactDetails: retrievedFullContact ? {
								name: `${retrievedFullContact.first_name} ${retrievedFullContact.last_name || ''}`.trim(),
								hasEmails: retrievedFullContact.emails?.length > 0,
								hasPhones: retrievedFullContact.phones?.length > 0,
								jobTitle: retrievedFullContact.job_title,
								company: retrievedFullContact.company?.name
							} : 'not found',
							basicContactName: retrievedBasicContact ? retrievedBasicContact.name : 'not found',
							totalBasicContacts: basicContacts.length
						});
					}
					
				
				// Update the current link in the document to include the contact ID  
				this.updateLinkWithContactId(processedContact);
				
				this.logger?.logDebug('Contact successfully added and link updated');
				
				// Force a refresh of hover detection for this element
				setTimeout(() => {
					this.refreshHoverForCurrentElement(fullContact.id);
				}, 100); // Small delay to ensure DOM is updated
			}
		);
		
		this.logger?.logDebug('Modal created, opening');
		modal.open();
		this.logger?.logDebug('Modal opened successfully');
	} catch (error) {
		this.logger?.logError('Error creating/opening contact creation modal', error);
		
		// Show a notice as fallback
		new Notice(`Failed to open contact creation modal. Error: ${getErrorMessage(error)}`);
	}
}

private extractContactNameFromContext(contactId: string): { firstName: string; lastName: string; fullName: string } {
	// First, try to get the text from the current hovered element
	if (this.currentTargetElement) {
		const linkText = this.currentTargetElement.textContent?.trim() || '';
		if (linkText) {
			this.logger?.logDebug('Extracted name from hovered element', { linkText });
			return this.linkExtractor.parseContactName(linkText);
		}
	}

	// Fallback: Get from line text if no element available
	const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView || !activeView.editor) {
		return { firstName: '', lastName: '', fullName: '' };
	}

	const editor = activeView.editor;
	const cursor = editor.getCursor();
	const lineText = editor.getLine(cursor.line);
	
	// Try to find a link with the matching contact ID in the Dex comment
	// Format: [text](url)%%dex:contact-id=X%% or [[text]]%%dex:contact-id=X%%
	const dexUrlPattern = new RegExp(`\\[([^\\]]*)\\]\\([^)]+\\)%%dex:contact-id=${contactId}`, 'i');
	const vaultLinkPattern = new RegExp(`\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]%%dex:contact-id=${contactId}`, 'i');
	
	const dexUrlMatch = lineText.match(dexUrlPattern);
	const vaultLinkMatch = lineText.match(vaultLinkPattern);
	
	let linkText = '';
	if (dexUrlMatch) {
		linkText = dexUrlMatch[1];
	} else if (vaultLinkMatch) {
		linkText = vaultLinkMatch[2] || vaultLinkMatch[1]; // Use display text if available
	}
	
	this.logger?.logDebug('Extracted name from line with contact ID', { linkText, contactId });
	return this.linkExtractor.parseContactName(linkText);
}

	private createHoverCardElement(contact: ProcessedContact, fullContact?: DexContact): HTMLElement {
		const card = document.createElement('div');
		card.className = 'dex-hover-card';
		
		// Debug: Check if styles are being applied and company data
		this.logger?.logDebug('Creating hover card', { 
			className: card.className,
			contactName: contact.name,
			contactCompany: contact.company,
			fullContactCompany: fullContact?.company,
			hasFullContact: !!fullContact,
			visibleFields: this.settings.contactCardFields
		});
		
		// Header with avatar and name
		const header = card.createDiv({ cls: 'dex-hover-header' });
		
		// Avatar
		const avatarContainer = header.createDiv({ cls: 'dex-hover-avatar-container' });
		if (contact.imageUrl) {
			const avatar = avatarContainer.createEl('img', { 
				cls: 'dex-hover-avatar',
				attr: { src: contact.imageUrl, alt: contact.name }
			});
			avatar.onerror = () => {
				avatar.style.display = 'none';
			avatarContainer.createDiv({ cls: 'dex-hover-avatar-placeholder' })
				.setText((contact.firstName || '').charAt(0) + (contact.lastName || '').charAt(0));
		};
	} else {
		avatarContainer.createDiv({ cls: 'dex-hover-avatar-placeholder' })
			.setText((contact.firstName || '').charAt(0) + (contact.lastName || '').charAt(0));
	}		
		// Name in header (only field shown here now)
		const info = header.createDiv({ cls: 'dex-hover-info' });
		
		// Always show full name in header
		if (this.settings.contactCardFields.includes('name')) {
			info.createDiv({ cls: 'dex-hover-name' }).setText(contact.name);
		}

		// Contact details - show fields based on configuration
		const details = card.createDiv({ cls: 'dex-hover-details' });
		
		// Show rich contact information if full contact data is available
		if (fullContact) {
			// Debug log to see what data we have
			this.logger?.logDebug('Rendering contact card fields', {
				configuredFields: this.settings.contactCardFields,
				hasCompany: !!fullContact.company,
				company: fullContact.company,
				hasBirthday: !!(fullContact.birthday || fullContact.birthday_current_year),
				birthday: fullContact.birthday,
				birthdayCurrentYear: fullContact.birthday_current_year,
				hasTitle: !!fullContact.job_title,
				title: fullContact.job_title
			});

			// Iterate through configured fields in order
			for (const field of this.settings.contactCardFields) {
				switch (field) {
					case 'name':
						// Name is always shown in header, skip
						break;
					
					case 'title':
						if (fullContact.job_title) {
							const jobRow = details.createDiv({ cls: 'dex-hover-detail-row' });
							jobRow.appendChild(this.createIcon(Briefcase));
							jobRow.createSpan({ cls: 'dex-hover-detail-value' }).setText(fullContact.job_title);
						}
						break;
					
					case 'email':
						if (fullContact.emails?.length > 0) {
							const emailRow = details.createDiv({ cls: 'dex-hover-detail-row' });
							emailRow.appendChild(this.createIcon(Mail));
							const emailLink = emailRow.createEl('a', { 
								cls: 'dex-hover-detail-value dex-hover-email-link',
								attr: { href: `mailto:${fullContact.emails[0].email}` }
							});
							emailLink.setText(fullContact.emails[0].email);
						}
						break;
					
					case 'phone':
						if (fullContact.phones?.length > 0) {
							const phoneRow = details.createDiv({ cls: 'dex-hover-detail-row' });
							phoneRow.appendChild(this.createIcon(Phone));
							const phoneLink = phoneRow.createEl('a', { 
								cls: 'dex-hover-detail-value dex-hover-phone-link',
								attr: { href: `tel:${fullContact.phones[0].phone_number}` }
							});
							phoneLink.setText(this.formatPhoneNumber(fullContact.phones[0].phone_number));
						}
						break;
					
					case 'linkedin':
						if (fullContact.linkedin) {
							const linkedinRow = details.createDiv({ cls: 'dex-hover-detail-row' });
							linkedinRow.appendChild(this.createIcon(Linkedin));
							
							// Build full LinkedIn URL from username
							let linkedinUrl = fullContact.linkedin;
							let displayText = fullContact.linkedin;
							
							if (!linkedinUrl.startsWith('http')) {
								// If it's just a username, construct the full URL
								linkedinUrl = `https://linkedin.com/in/${linkedinUrl}`;
								displayText = `linkedin.com/in/${fullContact.linkedin}`;
							} else {
								// Strip https:// from display
								displayText = linkedinUrl.replace(/^https?:\/\//, '');
							}
							
							const linkedinLink = linkedinRow.createEl('a', { 
								cls: 'dex-hover-detail-value dex-hover-social-link',
								attr: { href: linkedinUrl, target: '_blank' }
							});
							linkedinLink.setText(displayText);
						}
						break;
					
					case 'description':
						if (fullContact.description) {
							const descRow = details.createDiv({ cls: 'dex-hover-detail-row' });
							descRow.appendChild(this.createIcon(FileText));
							descRow.createSpan({ cls: 'dex-hover-detail-value' }).setText(fullContact.description);
						}
						break;
					
					case 'birthday':
						const birthdayValue = fullContact.birthday || fullContact.birthday_current_year;
						if (birthdayValue) {
							const bdayRow = details.createDiv({ cls: 'dex-hover-detail-row' });
							bdayRow.appendChild(this.createIcon(Cake));
							// Format the birthday nicely (assuming format is YYYY-MM-DD)
							const formattedBirthday = this.formatBirthday(birthdayValue);
							bdayRow.createSpan({ cls: 'dex-hover-detail-value' }).setText(formattedBirthday);
						}
						break;
				}
			}
		}
		
		// Note about limited contact info only if we don't have full data
		if (!fullContact && details.children.length === 0) {
			const infoNote = details.createDiv({ cls: 'dex-hover-info-note' });
			infoNote.setText('Limited contact info available in cache');
		}

		// Actions
		const actions = card.createDiv({ cls: 'dex-hover-actions' });
		
		// View Profile button
		const viewProfileBtn = actions.createEl('button', { 
			cls: 'dex-hover-action-btn dex-hover-view-profile',
			text: 'View Profile'
		});
		viewProfileBtn.addEventListener('click', (e) => {
			e.preventDefault();
			window.open(contact.dexUrl, '_blank');
			this.hideCard();
		});

		return card;
	}

	private positionCard(targetElement: HTMLElement, event: MouseEvent) {
		if (!this.hoverCard) return;

		const rect = targetElement.getBoundingClientRect();
		const cardRect = this.hoverCard.getBoundingClientRect();
		
		let left = rect.left + rect.width / 2 - cardRect.width / 2;
		let top = rect.bottom + 8; // 8px below the target

		// Adjust if card would go off screen
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// Horizontal adjustment
		if (left < 8) {
			left = 8;
		} else if (left + cardRect.width > viewportWidth - 8) {
			left = viewportWidth - cardRect.width - 8;
		}

		// Vertical adjustment - show above if not enough space below
		if (top + cardRect.height > viewportHeight - 8) {
			top = rect.top - cardRect.height - 8;
		}

		// Final bounds check
		if (top < 8) {
			top = 8;
		}

		this.hoverCard.style.left = `${left}px`;
		this.hoverCard.style.top = `${top}px`;
	}

	private hideCard() {
		if (this.hoverCard) {
			// Remove from DOM
			this.hoverCard.remove();
			this.hoverCard = null;
			this.currentContactId = null;
		}
		
		// Also clean up any orphaned hover cards that might exist
		const orphanedCards = document.querySelectorAll('.dex-hover-card');
		orphanedCards.forEach(card => card.remove());
		
		// Reset pending contact ID to prevent race conditions
		this.pendingContactId = null;

		if (this.hoverTimeout) {
			clearTimeout(this.hoverTimeout);
			this.hoverTimeout = null;
		}

		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}
	}

	private refreshHoverForCurrentElement(newContactId: string) {
		if (!this.currentTargetElement) {
			this.logger?.logDebug('No current target element to refresh hover for');
			return;
		}

		this.logger?.logDebug('Refreshing hover detection for updated element', { 
			newContactId,
			elementText: this.currentTargetElement.textContent 
		});

		// Hide current card
		this.hideCard();

		// Clear any pending state to force a fresh lookup
		this.pendingContactId = null;
		this.originalLinkText = null;

		// Re-extract contact ID from the element to see if it now finds the new ID
		const extractedContactId = this.extractContactIdFromElement(this.currentTargetElement);
		this.logger?.logDebug('Re-extracted contact ID after refresh', { 
			extractedContactId,
			expectedContactId: newContactId 
		});

		// If we now find the correct contact ID, show the real contact card
		if (extractedContactId && extractedContactId === newContactId) {
			this.logger?.logDebug('Successfully detected updated contact ID, showing real contact card');
			// Create a fake mouse event to trigger the hover
			const fakeEvent = new MouseEvent('mouseover', {
				bubbles: true,
				cancelable: true,
				clientX: 0,
				clientY: 0
			});
			this.showCard(newContactId, this.currentTargetElement, fakeEvent);
		} else {
			this.logger?.logDebug('Contact ID still not detected after refresh', { 
				extractedContactId,
				expectedContactId: newContactId,
				willRetryIn: '500ms'
			});
			
			// Retry after a longer delay to allow DOM to fully update
			setTimeout(() => {
				const retryExtractedId = this.extractContactIdFromElement(this.currentTargetElement);
				this.logger?.logDebug('Retry: Re-extracted contact ID', { 
					retryExtractedId,
					expectedContactId: newContactId 
				});
				
				if (retryExtractedId && retryExtractedId === newContactId) {
					const fakeEvent = new MouseEvent('mouseover', {
						bubbles: true,
						cancelable: true,
						clientX: 0,
						clientY: 0
					});
					this.showCard(newContactId, this.currentTargetElement, fakeEvent);
				}
			}, 500);
		}
	}
}