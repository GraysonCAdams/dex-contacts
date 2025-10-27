import { requestUrl } from 'obsidian';
import { DexContact, DexContactsResponse, DexTimelineItem, ProcessedContact } from '../core/types';
import { CONTACTS_PAGE_SIZE, API_BATCH_DELAY } from '../constants';
import { DebugLogger } from '../utils/debug-logger';
import { getErrorMessage } from '../utils/error-utils';

// Define interfaces for clean architecture like Todoist plugin
export interface DexFetcher {
	fetch(params: DexRequestParams): Promise<DexResponse>;
}

export type DexRequestParams = {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
};

export type DexResponse = {
	statusCode: number;
	body: string;
};

// Obsidian-specific fetcher using requestUrl (bypasses CORS)
export class ObsidianDexFetcher implements DexFetcher {
	public async fetch(params: DexRequestParams): Promise<DexResponse> {
		const response = await requestUrl({
			url: params.url,
			method: params.method,
			body: params.body,
			headers: params.headers,
			throw: false, // Don't throw on HTTP errors - we'll handle them
		});

		return {
			statusCode: response.status,
			body: response.text,
		};
	}
}

// Custom error class for better error handling
export class DexApiError extends Error {
	public statusCode: number;

	constructor(request: DexRequestParams, response: DexResponse) {
		const message = `[${request.method}] ${request.url} returned '${response.statusCode}: ${response.body}'`;
		super(message);
		this.statusCode = response.statusCode;
	}
}

export class DexApiClient {
	private apiKey: string;
	private baseUrl = 'https://api.getdex.com/api/rest';
	private logger?: any;
	private fetcher: DexFetcher;

	constructor(apiKey: string, fetcher?: DexFetcher, logger?: any) {
		this.apiKey = apiKey;
		this.fetcher = fetcher || new ObsidianDexFetcher();
		this.logger = logger;
	}

	private getHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'Obsidian-Dex-Plugin/1.0.0'
		};

		// Only add API key if it exists and is valid
		if (this.apiKey && this.apiKey.trim()) {
			headers['x-hasura-dex-api-key'] = this.apiKey.trim();
		}

		return headers;
	}





	private async makeRequest<T>(endpoint: string, options?: { method?: string; body?: string }): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const method = options?.method || 'GET';
		const startTime = Date.now();
		
		this.logger?.logDebug(`Starting API request: ${method} ${endpoint}`, {
			url,
			headers: this.getHeaders(),
			hasApiKey: !!this.apiKey,
			apiKeyLength: this.apiKey?.length || 0
		});
		
		try {
			// Use Obsidian's requestUrl via our fetcher interface (like Todoist plugin)
			const params: DexRequestParams = {
				url,
				method,
				headers: this.getHeaders(),
				body: options?.body
			};

			// Log the exact request configuration
			this.logger?.logDebug('Request configuration', {
				url: params.url,
				method: params.method,
				headers: params.headers,
				hasBody: !!params.body
			});

			const response = await this.fetcher.fetch(params);
			const duration = Date.now() - startTime;

			// Log the raw response body for POST requests (especially timeline_items)
			if (method === 'POST' && endpoint.includes('timeline_items')) {
				this.logger?.logDebug('Raw POST response body:', {
					statusCode: response.statusCode,
					rawBody: response.body,
					bodyLength: response.body?.length || 0
				});
			}

			// Check for HTTP errors (like Todoist plugin)
			if (response.statusCode >= 400) {
				const error = new DexApiError(params, response);
				
				this.logger?.logApiCall(endpoint, method, false, {
					status: response.statusCode,
					error: response.body,
					duration
				});
				
				throw error;
			}

			const data = JSON.parse(response.body);
			
			// Log parsed data for POST requests to timeline_items
			if (method === 'POST' && endpoint.includes('timeline_items')) {
				this.logger?.logDebug('Parsed POST response data:', {
					parsedData: JSON.stringify(data, null, 2),
					dataKeys: Object.keys(data || {}),
					dataType: typeof data
				});
			}
			
			this.logger?.logApiCall(endpoint, method, true, {
				status: response.statusCode,
				duration,
				dataSize: response.body.length
			});

			return data;
		} catch (error) {
			const duration = Date.now() - startTime;
			
			// Enhanced error logging
			const errorDetails = {
				error: error.message,
				duration,
				errorType: error.constructor.name,
				url,
				method,
				timestamp: new Date().toISOString()
			};
			
			// Add status code if it's a DexApiError
			if (error instanceof DexApiError) {
				errorDetails['statusCode'] = error.statusCode;
			}
			
			this.logger?.logApiCall(endpoint, method, false, errorDetails);
			this.logger?.logError(`API request failed for ${method} ${endpoint}`, error);
			
			throw error;
		}
	}

	async testConnection(): Promise<{ success: boolean; error?: string }> {
		try {
			// Test by fetching a small number of contacts
			await this.fetchContacts(1, 0);
			return { success: true };
		} catch (error) {
			let errorMessage = getErrorMessage(error);
			
			// Provide helpful error messages for common issues
			if (error && typeof error === 'object' && error instanceof DexApiError) {
				switch (error.statusCode) {
					case 401:
						errorMessage = 'Authentication failed: Invalid API key. Please check your API key in the Dex settings.';
						break;
					case 403:
						errorMessage = 'Access denied: Your API key does not have the required permissions.';
						break;
					case 404:
						errorMessage = 'API endpoint not found: The Dex API may be unavailable or the endpoint has changed.';
						break;
					case 429:
						errorMessage = 'Rate limit exceeded: Too many requests. Please wait a moment and try again.';
						break;
					case 500:
					case 502:
					case 503:
					case 504:
						errorMessage = 'Server error: The Dex API is experiencing issues. Please try again later.';
						break;
					default:
						errorMessage = `API error: ${error.statusCode} - ${error.message}`;
				}
			} else {
				// Handle network or parsing errors
				errorMessage = `Network or parsing error: ${errorMessage}`;
			}
			
			return { 
				success: false, 
				error: errorMessage 
			};
		}
	}

	async fetchContacts(limit = CONTACTS_PAGE_SIZE, offset = 0): Promise<DexContact[]> {
		const response = await this.makeRequest<DexContactsResponse>(
			`/contacts?limit=${limit}&offset=${offset}`
		);
		return response.contacts;
	}

	async fetchAllContacts(): Promise<DexContact[]> {
		const allContacts: DexContact[] = [];
		let offset = 0;
		const limit = CONTACTS_PAGE_SIZE;
		let hasMore = true;

		while (hasMore) {
			try {
				const contacts = await this.fetchContacts(limit, offset);
				allContacts.push(...contacts);
				
				// If we got fewer contacts than the limit, we've reached the end
				hasMore = contacts.length === limit;
				offset += limit;

				// Add a small delay to be respectful to the API
				if (hasMore) {
					await new Promise(resolve => setTimeout(resolve, API_BATCH_DELAY));
				}
			} catch (error) {
				this.logger?.logDebug('Failed to fetch contacts batch', { error });
				throw error;
			}
		}

		return allContacts;
	}

	async createNote(contactId: string, noteContent: string): Promise<{ id: string; success: boolean; wasUpdated: boolean }> {
		const timelineItem: DexTimelineItem = {
			timeline_event: {
				note: noteContent,
				event_time: new Date().toISOString(),
				meeting_type: "note",
				timeline_items_contacts: {
					data: [{ contact_id: contactId }]
				}
			}
		};

		// Log the request body for debugging
		this.logger?.logDebug('CreateNote request body:', JSON.stringify(timelineItem, null, 2));

		const response = await this.makeRequest<any>('/timeline_items', {
			method: 'POST',
			body: JSON.stringify(timelineItem)
		});

		// Log the complete response body for debugging
		this.logger?.logDebug('CreateNote response received:', {
			fullResponse: JSON.stringify(response, null, 2),
			responseKeys: Object.keys(response || {}),
			responseType: typeof response
		});

		// Parse the response to get the created timeline item ID
		try {
			// Based on actual Dex API response, the ID is at insert_timeline_items_one.id
			const timelineItemId = response?.insert_timeline_items_one?.id;
			
			if (timelineItemId) {
				this.logger?.logDebug('Successfully extracted timeline item ID from insert_timeline_items_one:', { timelineItemId });
				return { id: timelineItemId, success: true, wasUpdated: false };
			} else {
				// Fail-fast: if the expected path doesn't work, throw an error
				const errorMsg = 'Dex API response structure changed - expected insert_timeline_items_one.id';
				this.logger?.logDebug(errorMsg, { 
					responseStructure: JSON.stringify(response, null, 2) 
				});
				throw new Error(errorMsg);
			}
		} catch (error) {
			this.logger?.logDebug('Failed to parse createNote response', { 
				error: error.message,
				responseData: JSON.stringify(response, null, 2)
			});
			throw error;
		}
	}

	async updateNote(noteId: string, contactId: string, noteContent: string): Promise<{ id: string; success: boolean; wasUpdated: boolean }> {
		// Use the correct Dex API format from their documentation
		const updateData = {
			changes: {
				note: noteContent,
				event_time: new Date().toISOString(),
				meeting_type: "note"
			},
			timeline_items_contacts: [
				{
					timeline_item_id: noteId,
					contact_id: contactId
				}
			],
			update_contacts: true
		};

		try {
			const response = await this.makeRequest(`/timeline_items/${noteId}`, {
				method: 'PUT',
				body: JSON.stringify(updateData)
			});
			
			this.logger?.logDebug(`Successfully updated note ${noteId}`, { response });
			return { id: noteId, success: true, wasUpdated: true };
		} catch (error) {
			// If update fails, create a new note instead
			this.logger?.logDebug(`Failed to update note ${noteId}, creating new note instead`, { 
				error: error.message,
				statusCode: error instanceof DexApiError ? error.statusCode : 'unknown'
			});
			const newResult = await this.createNote(contactId, noteContent);
			return { ...newResult, wasUpdated: false };
		}
	}

	async createContact(contactData: {
		first_name: string;
		last_name?: string;
		email?: string;
		phone?: string;
		job_title?: string;
		company?: string;
		linkedin_url?: string;
	}): Promise<DexContact> {
		// Transform data to match Dex API expected structure
		const payload: any = {
			contact: {
				first_name: contactData.first_name,
				last_name: contactData.last_name || null,
				job_title: contactData.job_title || null,
				company: contactData.company || null,
				description: null,
				education: null,
				image_url: null,
				linkedin: contactData.linkedin_url || null,
				twitter: null,
				instagram: null,
				telegram: null,
				birthday_year: null,
				last_seen_at: null,
				next_reminder_at: null,
				website: null
			}
		};

		// Add email if provided
		if (contactData.email) {
			payload.contact.contact_emails = { data: { email: contactData.email } };
		}

		// Add phone if provided
		if (contactData.phone) {
			payload.contact.contact_phone_numbers = { 
				data: { 
					phone_number: contactData.phone, 
					label: "Work" 
				} 
			};
		}

		const body = JSON.stringify(payload);
		
		this.logger?.logDebug('Creating new contact', { 
			originalData: contactData, 
			transformedPayload: payload,
			payloadString: body,
			hasCompany: !!contactData.company,
			companyValue: contactData.company
		});
		
		try {
			const response = await this.makeRequest<any>('/contacts', {
				method: 'POST',
				body
			});
			
			// Debug: Log the complete API response structure
			this.logger?.logDebug('Dex API create contact response', { 
				response,
				type: typeof response,
				keys: Object.keys(response || {})
			});
			
			// Extract the actual contact data from the nested response
			const contactData = response?.insert_contacts_one;
			
			if (!contactData) {
				throw new Error('No contact data found in API response');
			}
			
			// Transform the response to match our DexContact interface
			const dexContact: DexContact = {
				id: contactData.id,
				first_name: contactData.first_name,
				last_name: contactData.last_name,
				job_title: contactData.job_title,
				description: contactData.description,
				emails: contactData.emails || [],
				phones: contactData.phones || [],
				education: contactData.education,
				image_url: contactData.image_url,
				linkedin: contactData.linkedin,
				facebook: contactData.facebook,
				twitter: contactData.twitter,
				instagram: contactData.instagram,
				telegram: contactData.telegram,
				birthday_current_year: contactData.birthday,
				last_seen_at: contactData.last_seen_at,
				next_reminder_at: contactData.next_reminder_at,
				company: null // This might be in a separate field or not included in creation response
			};
			
			this.logger?.logDebug('Contact created successfully', { 
				contactId: dexContact.id, 
				name: `${dexContact.first_name} ${dexContact.last_name}` 
			});
			this.logger?.logDebug('Full API response structure', { 
				response: JSON.stringify(response, null, 2),
				responseKeys: Object.keys(response || {}),
				responseType: typeof response,
				extractedContact: dexContact
			});
			
			return dexContact;
		} catch (error) {
			this.logger?.logError('Failed to create contact', error);
			throw error;
		}
	}

	processContacts(dexContacts: DexContact[]): ProcessedContact[] {
		return dexContacts.map(contact => {
			const firstName = contact.first_name || '';
			const lastName = contact.last_name || '';
			const name = `${firstName} ${lastName}`.trim() || 'Unknown Contact';
			
			// Extract company name from company field or job_title
			let company = '';
			if (contact.company) {
				company = contact.company;
			} else if (contact.job_title && contact.job_title.includes(' at ')) {
				// Try to extract company from job title like "Engineer at Google"
				const parts = contact.job_title.split(' at ');
				if (parts.length > 1) {
					company = parts[parts.length - 1];
				}
			}

			return {
				id: contact.id,
				name,
				firstName,
				lastName,
				company: company || undefined,
				imageUrl: contact.image_url || undefined,
				dexUrl: `https://getdex.com/appv3/contacts/details/${contact.id}`
			};
		});
	}
}