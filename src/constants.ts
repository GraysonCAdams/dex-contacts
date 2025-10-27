/**
 * Application-wide constants for Dex Contacts plugin
 * Centralized configuration for magic numbers, timing, and thresholds
 */

// ============================================================================
// FUZZY SEARCH CONFIGURATION
// ============================================================================

/** Fuzzy search threshold - lower is stricter (0 = perfect match, 1 = match anything) */
export const FUZZY_SEARCH_THRESHOLD = 0.4;

/** Minimum characters required to match in fuzzy search */
export const MIN_MATCH_CHAR_LENGTH = 1;

/** Maximum number of suggestions to show in autocomplete */
export const MAX_SUGGESTIONS = 10;

/** Limit for contact suggestions displayed to user */
export const CONTACT_SUGGESTION_LIMIT = 9;

// ============================================================================
// TIMING CONSTANTS (milliseconds)
// ============================================================================

/** Delay before showing hover card (milliseconds) */
export const HOVER_SHOW_DELAY = 300;

/** Delay before hiding hover card (milliseconds) */
export const HOVER_HIDE_DELAY = 200;

/** Debounce delay for status bar updates (milliseconds) */
export const STATUS_BAR_UPDATE_DELAY = 200;

/** Delay between API request batches to avoid rate limiting (milliseconds) */
export const API_BATCH_DELAY = 100;

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

/** Maximum age for contact cache before refresh (1 hour in milliseconds) */
export const CONTACT_CACHE_MAX_AGE = 60 * 60 * 1000;

/** Interval for background contact refresh (10 minutes in milliseconds) */
export const BACKGROUND_REFRESH_INTERVAL = 10 * 60 * 1000;

// ============================================================================
// UI CONFIGURATION
// ============================================================================

/** Maximum number of debug log entries to display */
export const DEBUG_LOG_DISPLAY_LIMIT = 50;

/** Number of lines to search above/below cursor when finding links */
export const LINK_SEARCH_RADIUS = 3;

/** Page size for contact API pagination */
export const CONTACTS_PAGE_SIZE = 100;

// ============================================================================
// NOTIFICATION DURATIONS (milliseconds)
// ============================================================================

/** Duration for success notifications */
export const NOTIFICATION_SUCCESS_DURATION = 4000;

/** Duration for error notifications */
export const NOTIFICATION_ERROR_DURATION = 5000;

/** Duration for info notifications */
export const NOTIFICATION_INFO_DURATION = 3000;

// ============================================================================
// FUZZY SEARCH WEIGHTS
// ============================================================================

/** Weight for first name matches in fuzzy search */
export const FUZZY_WEIGHT_FIRST_NAME = 1.0;

/** Weight for last name matches in fuzzy search */
export const FUZZY_WEIGHT_LAST_NAME = 0.8;

/** Weight for full name matches in fuzzy search */
export const FUZZY_WEIGHT_FULL_NAME = 0.6;

/** Weight for company name matches in fuzzy search */
export const FUZZY_WEIGHT_COMPANY = 0.2;

// ============================================================================
// REGEX PATTERNS
// ============================================================================

/** Pattern to match and extract memo data from Dex comment: %%dex:contact-id=X,memo-id=Y,hash=Z%% */
export const MEMO_ID_PATTERN = /%%dex:(?:contact-id=([^,%)]+))?(?:,memo-id=([^,%)]+))?(?:,hash=([^,%)]+))?%%/;

/** Pattern to match Dex URL contact links */
export const DEX_URL_PATTERN = /\[([^\]]*)\]\((https:\/\/getdex\.com\/appv3\/contacts\/details\/[^)]+)\)/g;

/** Pattern to match vault links */
export const VAULT_LINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Pattern to clean/remove Dex comments (for content sent to Dex API) */
export const MEMO_ID_CLEANUP_PATTERN = /%%dex:[^%]*%%/g;
