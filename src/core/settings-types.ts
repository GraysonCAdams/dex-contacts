export type ContactCardField = 
	| 'name'
	| 'title' 
	| 'email'
	| 'phone'
	| 'linkedin'
	| 'description'
	| 'birthday';

export interface DexContactsSettings {
	apiKey: string;
	linkMode: 'dex-url' | 'vault-page';
	vaultPath: 'vault' | 'path';
	customPath: string;
	includeAtSymbol: boolean;
	includeAtInLink: boolean;
	stripLastName: boolean;
	memoTemplate: string;
	dateFormat: string;
	showSyncButtons: boolean;
	syncButtonColor: string;
	syncedButtonColor: string;
	autoSyncOnSave: boolean;
	debugMode: boolean;
	showContactCards: boolean;
	showContactCardsInReader: boolean;
	contactCardFields: ContactCardField[];
	hideDexMetadata: boolean;
}

export const DEFAULT_SETTINGS: DexContactsSettings = {
	apiKey: '',
	linkMode: 'dex-url',
	vaultPath: 'vault',
	customPath: '',
	includeAtSymbol: true,
	includeAtInLink: true,
	stripLastName: false,
	memoTemplate: '{{content}}',
	dateFormat: 'YYYY-MM-DD',
	showSyncButtons: true,
	syncButtonColor: '#6366f1',
	syncedButtonColor: '#10b981',
	autoSyncOnSave: false,
	debugMode: false,
	showContactCards: true,
	showContactCardsInReader: true,
	contactCardFields: ['name', 'title', 'email', 'phone'],
	hideDexMetadata: true
};