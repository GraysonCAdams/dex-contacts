import { Notice } from 'obsidian';

export class NotificationManager {
	private plugin: any;

	constructor(plugin: any) {
		this.plugin = plugin;
	}

	showNotification(
		message: string, 
		type: 'success' | 'error' | 'info' = 'info', 
		duration = 5000
	) {
		// Create custom notice with colored border stripe
		const notice = new Notice('', duration);
		const noticeEl = notice.noticeEl;
		
		// Clear default content and add our custom content
		noticeEl.empty();
		noticeEl.addClass('dex-notice');
		
		// Add message
		noticeEl.createEl('span', { text: message });
		
		// Add colored border stripe based on type
		switch (type) {
			case 'success':
				noticeEl.style.borderLeft = '4px solid var(--color-green)';
				break;
			case 'error':
				noticeEl.style.borderLeft = '4px solid var(--color-red)';
				break;
			case 'info':
			default:
				noticeEl.style.borderLeft = '4px solid var(--interactive-accent)';
				break;
		}
		
		return notice;
	}

	showSyncSuccess(contactName: string, memoCount = 1) {
		const message = memoCount === 1 
			? `Memo synced to ${contactName}` 
			: `${memoCount} memos synced to ${contactName}`;
		
		this.showNotification(message, 'success');
	}

	showSyncError(contactName: string, error: string) {
		const message = `Failed to sync memo to ${contactName}: ${error}`;
		this.showNotification(message, 'error', 8000); // Show errors longer
	}

	showBatchSyncResult(successCount: number, errorCount: number) {
		if (errorCount === 0) {
			this.showNotification(`✅ Successfully synced ${successCount} memos`, 'success');
		} else if (successCount === 0) {
			this.showNotification(`❌ Failed to sync ${errorCount} memos`, 'error');
		} else {
			this.showNotification(
				`⚠️ Synced ${successCount} memos, ${errorCount} failed`, 
				'info', 
				7000
			);
		}
	}

	showApiConnectionTest(success: boolean, error?: string) {
		if (success) {
			this.showNotification('✅ Dex API connection successful', 'success');
		} else {
			this.showNotification(`❌ Dex API connection failed: ${error}`, 'error');
		}
	}

	showContactsLoaded(count: number) {
		this.showNotification(`📇 Loaded ${count} contacts from Dex`, 'info');
	}

	showContactsLoadError(error: string) {
		this.showNotification(`❌ Failed to load Dex contacts: ${error}`, 'error');
	}
}