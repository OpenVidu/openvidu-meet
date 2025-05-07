/**
 * Common utility functions used across the application
 */

/**
 * Format a date to a human-readable string
 * @param timestamp - Unix timestamp in milliseconds
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Generate a human-readable relative time string (e.g., "5 minutes ago")
 * @param timestamp - Unix timestamp in milliseconds
 */
export function getRelativeTimeString(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
}

/**
 * Convert a string to title case (e.g., "hello world" -> "Hello World")
 * @param str - String to convert
 */
export function toTitleCase(str: string): string {
  return str.replace(
    /\w\S*/g,
    txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

/**
 * Safely parse JSON without throwing an exception
 * @param jsonString - JSON string to parse
 * @param fallback - Default value if parsing fails
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (e) {
    console.warn('Failed to parse JSON:', e);
    return fallback;
  }
}

/**
 * Truncate a string to a maximum length with ellipsis
 * @param str - String to truncate
 * @param maxLength - Maximum length
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}