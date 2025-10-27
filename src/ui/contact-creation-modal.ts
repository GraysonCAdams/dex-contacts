import { App, Modal, Setting, Notice } from 'obsidian';
import { DexApiClient } from '../api/client';
import { ProcessedContact } from '../core/types';
import { getErrorMessage } from '../utils/error-utils';

export class ContactCreationModal extends Modal {
	private apiClient: DexApiClient;
	private logger: any;
	private onSuccess?: (contact: ProcessedContact, fullContact?: any) => void;
	
	private firstName: string = '';
	private lastName: string = '';
	private email: string = '';
	private phone: string = '';
	private jobTitle: string = '';
	private company: string = '';
	private linkedinUrl: string = '';

	constructor(
		app: App, 
		apiClient: DexApiClient, 
		logger: any,
		suggestedName?: string,
		onSuccess?: (contact: ProcessedContact, fullContact?: any) => void
	) {
		super(app);
		this.apiClient = apiClient;
		this.logger = logger;
		this.onSuccess = onSuccess;
		
		// Pre-fill name if suggested
		if (suggestedName) {
			const nameParts = suggestedName.trim().split(' ');
			this.firstName = nameParts[0] || '';
			this.lastName = nameParts.slice(1).join(' ') || '';
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dex-contact-creation-modal');

		// Title
		contentEl.createEl('h2', { text: 'Add Contact to Dex' });

		// Form container
		const formContainer = contentEl.createDiv({ cls: 'dex-form-container' });

		// First Name (required)
		new Setting(formContainer)
			.setName('First Name')
			.setDesc('Required field')
			.addText(text => {
				text.setPlaceholder('Enter first name')
					.setValue(this.firstName)
					.onChange(value => {
						this.firstName = value;
					});
				// Focus the first input
				setTimeout(() => text.inputEl.focus(), 100);
			});

		// Last Name
		new Setting(formContainer)
			.setName('Last Name')
			.setDesc('Optional')
			.addText(text => text
				.setPlaceholder('Enter last name')
				.setValue(this.lastName)
				.onChange(value => {
					this.lastName = value;
				}));

		// Job Title
		new Setting(formContainer)
			.setName('Job Title')
			.setDesc('Optional')
			.addText(text => text
				.setPlaceholder('e.g. Software Engineer')
				.setValue(this.jobTitle)
				.onChange(value => {
					this.jobTitle = value;
				}));

		// Company
		new Setting(formContainer)
			.setName('Company')
			.setDesc('Optional')
			.addText(text => text
				.setPlaceholder('e.g. Google')
				.setValue(this.company)
				.onChange(value => {
					this.company = value;
				}));

		// Email
		new Setting(formContainer)
			.setName('Email')
			.setDesc('Optional')
			.addText(text => text
				.setPlaceholder('email@example.com')
				.setValue(this.email)
				.onChange(value => {
					this.email = value;
				}));

		// Phone
		new Setting(formContainer)
			.setName('Phone')
			.setDesc('Optional')
			.addText(text => text
				.setPlaceholder('+1 (555) 123-4567')
				.setValue(this.phone)
				.onChange(value => {
					this.phone = value;
				}));

		// LinkedIn URL
		new Setting(formContainer)
			.setName('LinkedIn Profile')
			.setDesc('Optional - full URL or username')
			.addText(text => text
				.setPlaceholder('https://linkedin.com/in/username or just username')
				.setValue(this.linkedinUrl)
				.onChange(value => {
					this.linkedinUrl = value;
				}));

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'dex-button-container' });
		buttonContainer.style.cssText = `
			display: flex;
			justify-content: flex-end;
			gap: 10px;
			margin-top: 20px;
			padding-top: 20px;
			border-top: 1px solid var(--background-modifier-border);
		`;

		// Cancel button
		const cancelBtn = buttonContainer.createEl('button', { 
			text: 'Cancel',
			cls: 'mod-cta'
		});
		cancelBtn.addEventListener('click', () => {
			this.close();
		});

		// Create button
		const createBtn = buttonContainer.createEl('button', { 
			text: 'Add to Dex',
			cls: 'mod-cta'
		});
		createBtn.addEventListener('click', () => {
			this.createContact();
		});

		// Handle Enter key
		contentEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.createContact();
			}
		});
	}

	private async createContact() {
		// Validation
		if (!this.firstName.trim()) {
			new Notice('First name is required', 3000);
			return;
		}

		// Prepare contact data
		const contactData: any = {
			first_name: this.firstName.trim()
		};

		if (this.lastName.trim()) {
			contactData.last_name = this.lastName.trim();
		}

		if (this.email.trim()) {
			// Basic email validation
			if (!this.email.includes('@')) {
				new Notice('Please enter a valid email address', 3000);
				return;
			}
			contactData.email = this.email.trim();
		}

		if (this.phone.trim()) {
			contactData.phone = this.phone.trim();
		}

		if (this.jobTitle.trim()) {
			contactData.job_title = this.jobTitle.trim();
		}

		if (this.company.trim()) {
			contactData.company = this.company.trim();
		}

		if (this.linkedinUrl.trim()) {
			let linkedinUrl = this.linkedinUrl.trim();
			// If it's just a username, convert to full URL
			if (!linkedinUrl.startsWith('http') && !linkedinUrl.includes('linkedin.com')) {
				linkedinUrl = `https://linkedin.com/in/${linkedinUrl}`;
			}
			contactData.linkedin_url = linkedinUrl;
		}

		try {
			// Show loading state
			const createBtn = this.contentEl.querySelector('button:last-child') as HTMLElement;
			const originalText = createBtn.textContent;
			createBtn.textContent = 'Creating...';
			createBtn.setAttribute('disabled', 'true');

			// Create the contact
			const newContact = await this.apiClient.createContact(contactData);
			
			// Convert to ProcessedContact format
			const processedContact = this.apiClient.processContacts([newContact])[0];
			
			this.logger?.logDebug('Contact created successfully', processedContact);
			
			// Success notification
			new Notice(`✅ Added ${processedContact.name} to Dex`, 3000);
			
			// Call success callback with both processed and full contact data
			if (this.onSuccess) {
				this.onSuccess(processedContact, newContact);
			}
			
			this.close();
			
		} catch (error) {
			this.logger?.logError('Failed to create contact', error);
			
			// Restore button state
			const createBtn = this.contentEl.querySelector('button:last-child') as HTMLElement;
			createBtn.textContent = 'Add to Dex';
			createBtn.removeAttribute('disabled');
			
			// Show error
			const errorMessage = getErrorMessage(error);
			new Notice(`❌ Failed to create contact: ${errorMessage}`, 5000);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}