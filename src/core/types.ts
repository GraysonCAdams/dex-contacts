import { App } from 'obsidian';
import type { DexApiClient } from '../api/client';
import type { DexContactsSettings } from './settings-types';
import type { DebugLogger } from '../utils/debug-logger';
import type { NotificationManager } from '../ui/notifications';
import type { CSSManager } from '../utils/css-manager';

// Plugin Context - centralized dependency container
export interface PluginContext {
	app: App;
	apiClient: DexApiClient;
	settings: DexContactsSettings;
	logger: DebugLogger;
	notifications: NotificationManager;
	cssManager: CSSManager;
}

// Types based on GetDex API documentation
export interface DexContact {
	id: string;
	first_name: string;
	last_name: string;
	job_title?: string | null;
	description?: string | null;
	emails: Array<{ email: string }>;
	phones: Array<{ phone_number: string; label?: string | null }>;
	education?: string | null;
	website?: string | null;
	image_url?: string | null;
	linkedin?: string | null;
	facebook?: string | null;
	twitter?: string | null;
	instagram?: string | null;
	telegram?: string | null;
	birthday?: string | null;
	birthday_current_year?: string | null; // Keep for backward compatibility
	last_seen_at?: string | null;
	next_reminder_at?: string | null;
	company?: string | null;
	is_archived?: boolean;
	created_at?: string;
	updated_at?: string;
}

export interface DexContactsResponse {
	contacts: DexContact[];
	pagination: {
		total: {
			count: number;
		};
	};
}

export interface DexTimelineItem {
	timeline_event: {
		note: string;
		event_time: string;
		meeting_type: "note";
		timeline_items_contacts: {
			data: Array<{ contact_id: string }>;
		};
	};
}

// Internal plugin types
export interface ProcessedContact {
	id: string;
	name: string;
	firstName: string;
	lastName: string;
	company?: string;
	imageUrl?: string;
	dexUrl: string;
}

export interface ContactMention {
	contactId: string;
	contactName: string;
	startPos: number;
	endPos: number;
	lineNumber: number;
	paragraphStart: number;
	paragraphEnd: number;
	headerText?: string;
	isInHeader: boolean;
	syncTag?: string;
	isSynced: boolean;
}

export interface MemoTemplate {
	template: string;
	variables: {
		date?: string;
		dateFormat?: string;
		title?: string;
		obsidianUri?: string;
		content?: string;
		header?: string;
	};
}