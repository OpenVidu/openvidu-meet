import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { formatBytes, formatDurationToHMS } from '../../../shared/utils/format.utils';

/**
 * Utility functions for Recording-related UI operations.
 * These are pure functions that can be used across components and pages.
 */
export class RecordingUiUtils {
	// ===== STATUS UTILITIES =====

	/**
	 * Gets the human-readable label for a recording status
	 */
	static getStatusLabel(status?: MeetRecordingStatus): string {
		switch (status) {
			case MeetRecordingStatus.COMPLETE:
				return 'Complete';
			case MeetRecordingStatus.ACTIVE:
				return 'Recording';
			case MeetRecordingStatus.STARTING:
				return 'Starting';
			case MeetRecordingStatus.ENDING:
				return 'Ending';
			case MeetRecordingStatus.FAILED:
				return 'Failed';
			case MeetRecordingStatus.ABORTED:
				return 'Aborted';
			case MeetRecordingStatus.LIMIT_REACHED:
				return 'Limit Reached';
			default:
				return status ?? 'Unknown';
		}
	}

	/**
	 * Gets the Material icon name for a recording status
	 */
	static getStatusIcon(status?: MeetRecordingStatus): string {
		switch (status) {
			case MeetRecordingStatus.COMPLETE:
				return 'check_circle';
			case MeetRecordingStatus.ACTIVE:
				return 'radio_button_checked';
			case MeetRecordingStatus.STARTING:
				return 'hourglass_top';
			case MeetRecordingStatus.ENDING:
				return 'hourglass_bottom';
			case MeetRecordingStatus.FAILED:
				return 'error';
			case MeetRecordingStatus.ABORTED:
				return 'cancel';
			case MeetRecordingStatus.LIMIT_REACHED:
				return 'warning';
			default:
				return 'help_outline';
		}
	}

	/**
	 * Gets the Material icon name for a recording status in a player context
	 * (simplified variant used in the video player overlay)
	 */
	static getPlayerStatusIcon(status?: MeetRecordingStatus): string {
		switch (status) {
			case MeetRecordingStatus.STARTING:
			case MeetRecordingStatus.ACTIVE:
			case MeetRecordingStatus.ENDING:
				return 'hourglass_empty';
			case MeetRecordingStatus.COMPLETE:
				return 'check_circle';
			default:
				return 'error_outline';
		}
	}

	/**
	 * Gets the CSS color variable for a recording status
	 */
	static getStatusColor(status?: MeetRecordingStatus): string {
		switch (status) {
			case MeetRecordingStatus.COMPLETE:
				return 'var(--ov-meet-color-success)';
			case MeetRecordingStatus.ACTIVE:
				return 'var(--ov-meet-color-primary)';
			case MeetRecordingStatus.STARTING:
			case MeetRecordingStatus.ENDING:
				return 'var(--ov-meet-color-warning)';
			case MeetRecordingStatus.FAILED:
			case MeetRecordingStatus.ABORTED:
			case MeetRecordingStatus.LIMIT_REACHED:
				return 'var(--ov-meet-color-error)';
			default:
				return 'var(--ov-meet-text-secondary)';
		}
	}

	/**
	 * Gets the tooltip text for a recording status
	 */
	static getStatusTooltip(status?: MeetRecordingStatus): string {
		switch (status) {
			case MeetRecordingStatus.COMPLETE:
				return 'Recording completed successfully and is ready to play';
			case MeetRecordingStatus.ACTIVE:
				return 'Recording is currently in progress';
			case MeetRecordingStatus.STARTING:
				return 'Recording is being initialized';
			case MeetRecordingStatus.ENDING:
				return 'Recording is being finalized';
			case MeetRecordingStatus.FAILED:
				return 'Recording failed due to an error';
			case MeetRecordingStatus.ABORTED:
				return 'Recording was aborted';
			case MeetRecordingStatus.LIMIT_REACHED:
				return 'Recording stopped because a limit was reached';
			default:
				return 'Unknown recording status';
		}
	}

	/**
	 * Gets the player status message for a recording
	 */
	static getPlayerStatusMessage(status?: MeetRecordingStatus): string {
		switch (status) {
			case MeetRecordingStatus.STARTING:
				return 'Recording is starting...';
			case MeetRecordingStatus.ACTIVE:
				return 'Recording is in progress...';
			case MeetRecordingStatus.ENDING:
				return 'Recording is finalizing...';
			case MeetRecordingStatus.COMPLETE:
				return 'Recording is ready to watch';
			default:
				return 'Recording has failed';
		}
	}

	/**
	 * Checks if a recording is in a terminal error state
	 */
	static isErrorState(status?: MeetRecordingStatus): boolean {
		return (
			status === MeetRecordingStatus.FAILED ||
			status === MeetRecordingStatus.ABORTED ||
			status === MeetRecordingStatus.LIMIT_REACHED
		);
	}

	/**
	 * Checks if a recording is playable / downloadable
	 */
	static isComplete(status?: MeetRecordingStatus): boolean {
		return status === MeetRecordingStatus.COMPLETE;
	}

	/**
	 * Checks if a recording is currently being recorded
	 */
	static isInProgress(status?: MeetRecordingStatus): boolean {
		return (
			status === MeetRecordingStatus.ACTIVE ||
			status === MeetRecordingStatus.STARTING ||
			status === MeetRecordingStatus.ENDING
		);
	}

	// ===== FORMATTING UTILITIES =====

	/**
	 * Formats a duration in seconds to a human-readable string (HH:MM:SS)
	 */
	static formatDuration(seconds?: number): string {
		return formatDurationToHMS(seconds);
	}

	/**
	 * Formats a file size in bytes to a human-readable string
	 */
	static formatFileSize(bytes?: number): string {
		return formatBytes(bytes);
	}

	/**
	 * Returns the display name for a recording (filename or recordingId fallback)
	 */
	static getDisplayName(recording: MeetRecordingInfo): string {
		return recording.filename ?? recording.recordingId;
	}
}
