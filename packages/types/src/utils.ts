/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 *
 * @example
 * formatDuration(250) // "250ms"
 * formatDuration(12000) // "12s"
 * formatDuration(272000) // "4m 32s"
 * formatDuration(3900000) // "1h 5m"
 */
export function formatDuration(ms: number): string {
  // Under 1 second: display as milliseconds
  if (ms < 1000) {
    return `${Math.floor(ms)}ms`;
  }

  // Under 1 minute: display as seconds
  if (ms < 60000) {
    return `${Math.floor(ms / 1000)}s`;
  }

  // Under 1 hour: display as minutes and seconds
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  // 1 hour or more: display as hours and minutes
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}
