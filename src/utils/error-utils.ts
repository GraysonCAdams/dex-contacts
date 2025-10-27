/**
 * Unified error handling utilities
 * Provides type-safe error extraction and handling patterns
 */

/**
 * Safely extract an error message from an unknown error type
 * Handles Error objects, strings, and unknown types
 * 
 * @param error - The error to extract a message from
 * @returns A string error message, never null or undefined
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	
	if (typeof error === 'string') {
		return error;
	}
	
	// Handle objects with a message property
	if (error && typeof error === 'object' && 'message' in error) {
		const msg = (error as { message: unknown }).message;
		if (typeof msg === 'string') {
			return msg;
		}
	}
	
	// Last resort: stringify the error
	try {
		return JSON.stringify(error);
	} catch {
		return 'Unknown error occurred';
	}
}

/**
 * Extract a user-friendly error message with optional default
 * 
 * @param error - The error to extract a message from
 * @param defaultMessage - Optional default message if extraction fails
 * @returns A user-friendly error message
 */
export function getUserFriendlyError(error: unknown, defaultMessage = 'An unexpected error occurred'): string {
	const message = getErrorMessage(error);
	
	// If we got a generic message, use the default
	if (message === 'Unknown error occurred') {
		return defaultMessage;
	}
	
	return message;
}

/**
 * Type guard to check if an error is an Error instance
 * 
 * @param error - The value to check
 * @returns True if error is an Error instance
 */
export function isError(error: unknown): error is Error {
	return error instanceof Error;
}

/**
 * Type guard to check if an error has a specific property
 * Useful for checking custom error types
 * 
 * @param error - The error to check
 * @param property - The property name to check for
 * @returns True if error has the specified property
 */
export function hasErrorProperty<K extends string>(
	error: unknown,
	property: K
): error is Error & Record<K, unknown> {
	return error instanceof Error && property in error;
}

/**
 * Format an error for logging with stack trace
 * 
 * @param error - The error to format
 * @returns Formatted error string with stack trace if available
 */
export function formatErrorForLogging(error: unknown): string {
	if (error instanceof Error) {
		return `${error.message}${error.stack ? `\n${error.stack}` : ''}`;
	}
	
	return getErrorMessage(error);
}

/**
 * Wrap a function call in try-catch and return result or error
 * 
 * @param fn - The function to execute
 * @returns Result object with either data or error
 */
export async function tryCatch<T>(
	fn: () => Promise<T>
): Promise<{ data: T; error: null } | { data: null; error: unknown }> {
	try {
		const data = await fn();
		return { data, error: null };
	} catch (error) {
		return { data: null, error };
	}
}

/**
 * Wrap a synchronous function call in try-catch
 * 
 * @param fn - The synchronous function to execute
 * @returns Result object with either data or error
 */
export function tryCatchSync<T>(
	fn: () => T
): { data: T; error: null } | { data: null; error: unknown } {
	try {
		const data = fn();
		return { data, error: null };
	} catch (error) {
		return { data: null, error };
	}
}
