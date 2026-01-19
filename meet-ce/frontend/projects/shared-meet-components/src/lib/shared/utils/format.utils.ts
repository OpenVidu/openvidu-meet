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

export const formatDurationToTime = (durationSeconds?: number): string => {
	if (!durationSeconds || durationSeconds === 0) return '-';

	const hours = Math.floor(durationSeconds / 3600);
	const minutes = Math.floor((durationSeconds % 3600) / 60);
	const seconds = Math.floor(durationSeconds % 60);

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}

	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatBytes = (bytes?: number): string => {
	if (!bytes || bytes === 0) return '-';

	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};
