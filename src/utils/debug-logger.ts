import type DexContactsPlugin from '../../main';

export interface LogEntry {
	timestamp: string;
	level: 'info' | 'error' | 'debug' | 'api';
	message: string;
	details?: unknown;
}

export class DebugLogger {
	private logs: LogEntry[] = [];
	private plugin: DexContactsPlugin;
	private startTime: Date;

	constructor(plugin: DexContactsPlugin) {
		this.plugin = plugin;
		this.startTime = new Date();
		this.log('info', 'Dex Contacts plugin initialized');
	}

	log(level: LogEntry['level'], message: string, details?: unknown) {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			message,
			details
		};

		this.logs.push(entry);
		
		// Keep only last 1000 entries to prevent memory issues
		if (this.logs.length > 1000) {
			this.logs = this.logs.slice(-1000);
		}

		// Also log to console if debug mode is enabled
		if (this.plugin.settings?.debugMode) {
			const consoleMessage = `[Dex Contacts] ${level.toUpperCase()}: ${message}`;
			if (details) {
				console.log(consoleMessage, details);
			} else {
				console.log(consoleMessage);
			}
		}
	}

	logApiCall(endpoint: string, method: string = 'GET', success: boolean, details?: any) {
		const message = `API ${method} ${endpoint} - ${success ? 'SUCCESS' : 'FAILED'}`;
		this.log('api', message, details);
	}

	logContactsLoaded(count: number, timeTaken?: number) {
		const message = `Loaded ${count} contacts${timeTaken ? ` in ${timeTaken}ms` : ''}`;
		this.log('info', message);
	}

	logError(message: string, error?: Error) {
		this.log('error', message, error ? {
			name: error.name,
			message: error.message,
			stack: error.stack
		} : undefined);
	}

	logDebug(message: string, details?: any) {
		this.log('debug', message, details);
	}

	getLogs(): LogEntry[] {
		return [...this.logs]; // Return a copy
	}

	getLogsSince(timestamp: Date): LogEntry[] {
		return this.logs.filter(log => new Date(log.timestamp) >= timestamp);
	}

	clearLogs() {
		this.logs = [];
		this.log('info', 'Debug logs cleared');
	}

	getStartTime(): Date {
		return this.startTime;
	}

	exportLogs(): string {
		const header = `Dex Contacts Debug Log - Generated: ${new Date().toISOString()}\nPlugin Started: ${this.startTime.toISOString()}\n${'='.repeat(80)}\n\n`;
		
		const logLines = this.logs.map(log => {
			const timestamp = new Date(log.timestamp).toLocaleString();
			let line = `[${timestamp}] ${log.level.toUpperCase()}: ${log.message}`;
			
			if (log.details) {
				line += `\n  Details: ${JSON.stringify(log.details, null, 2)}`;
			}
			
			return line;
		}).join('\n\n');

		return header + logLines;
	}
}