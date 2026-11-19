export const formatDurationToHMS = (durationSeconds?: number): string => {
	if (!durationSeconds || durationSeconds === 0) return '-';

	const hours = Math.floor(durationSeconds / 3600);
	const minutes = Math.floor((durationSeconds % 3600) / 60);
	const seconds = Math.floor(durationSeconds % 60);

	if (hours > 0) {
		return `${hours}h ${minutes}m ${seconds}s`;
	} else if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	} else {
		return `${seconds}s`;
	}
};

export const formatBytes = (bytes?: number): string => {
	if (!bytes || bytes === 0) return '-';

	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Calendar days from `from` to `date`: 0 for the same day, negative for a day before it. */
export const daysUntil = (date: number | Date, from: Date): number =>
	Math.round((startOfDay(new Date(date)) - startOfDay(from)) / DAY_MS);
