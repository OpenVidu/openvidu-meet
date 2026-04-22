import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { formatBytes, formatDurationToHMS } from '../../../shared/utils/format.utils';

/**
 * Utility functions for Recording-related UI operations.
 * These are pure functions that can be used across components and pages.
 */
export class RecordingUiUtils {
	// Recording status sets for different states and action capabilities
	private static readonly STATUS_GROUPS = {
		IN_PROGRESS: [
			MeetRecordingStatus.STARTING,
			MeetRecordingStatus.ACTIVE,
			MeetRecordingStatus.ENDING
		] as readonly MeetRecordingStatus[],
		PLAYABLE: [MeetRecordingStatus.COMPLETE] as readonly MeetRecordingStatus[],
		ERROR: [
			MeetRecordingStatus.FAILED,
			MeetRecordingStatus.ABORTED,
			MeetRecordingStatus.LIMIT_REACHED
		] as readonly MeetRecordingStatus[],
		DELETABLE: [
			MeetRecordingStatus.COMPLETE,
			MeetRecordingStatus.FAILED,
			MeetRecordingStatus.ABORTED,
			MeetRecordingStatus.LIMIT_REACHED
		] as readonly MeetRecordingStatus[]
	} as const;

	/**
	 * Checks whether a recording status belongs to a specific status group.
	 */
	private static isStatusInGroup(status: MeetRecordingStatus, group: readonly MeetRecordingStatus[]): boolean {
		return group.includes(status);
	}

	// ===== STATUS UTILITIES =====

	/**
	 * Gets the human-readable label for a recording status
	 */
	static getStatusLabel(status: MeetRecordingStatus): string {
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
	static getStatusIcon(status: MeetRecordingStatus): string {
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
	static getPlayerStatusIcon(status: MeetRecordingStatus): string {
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
	static getStatusColor(status: MeetRecordingStatus): string {
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
	static getStatusTooltip(status: MeetRecordingStatus): string {
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
	static getPlayerStatusMessage(status: MeetRecordingStatus): string {
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
	 * Checks if a recording is currently being recorded
	 */
	static isInProgress(status: MeetRecordingStatus): boolean {
		return this.isStatusInGroup(status, this.STATUS_GROUPS.IN_PROGRESS);
	}

	/**
	 * Checks whether a recording can be played.
	 */
	static isPlayable(status: MeetRecordingStatus): boolean {
		return this.isStatusInGroup(status, this.STATUS_GROUPS.PLAYABLE);
	}

	/**
	 * Checks whether a recording can be downloaded.
	 */
	static isDownloadable(status: MeetRecordingStatus): boolean {
		return this.isPlayable(status);
	}

	/**
	 * Checks whether a share link can be generated for a recording.
	 */
	static isShareable(status: MeetRecordingStatus): boolean {
		return (
			this.isStatusInGroup(status, this.STATUS_GROUPS.IN_PROGRESS) ||
			this.isStatusInGroup(status, this.STATUS_GROUPS.PLAYABLE)
		);
	}

	/**
	 * Checks whether a recording can be deleted.
	 */
	static isDeletable(status: MeetRecordingStatus): boolean {
		return this.isStatusInGroup(status, this.STATUS_GROUPS.DELETABLE);
	}

	/**
	 * Checks whether a recording can be selected for bulk actions.
	 */
	static isSelectable(status: MeetRecordingStatus): boolean {
		return this.isStatusInGroup(status, this.STATUS_GROUPS.DELETABLE);
	}

	/**
	 * Checks if a recording is in a terminal error state
	 */
	static isErrorState(status: MeetRecordingStatus): boolean {
		return this.isStatusInGroup(status, this.STATUS_GROUPS.ERROR);
	}

	// ===== TOOLTIP UTILITIES =====

	/**
	 * Gets the tooltip text for the play action based on recording status.
	 */
	static getPlayRecordingTooltip(status: MeetRecordingStatus): string {
		if (this.isPlayable(status)) {
			return 'Play recording';
		}

		return 'Only completed recordings can be played';
	}

	/**
	 * Gets the tooltip text for the download action based on recording status.
	 */
	static getDownloadRecordingTooltip(status: MeetRecordingStatus): string {
		if (this.isDownloadable(status)) {
			return 'Download recording';
		}

		return 'Only completed recordings can be downloaded';
	}

	/**
	 * Gets the tooltip text for the share action based on recording status.
	 */
	static getShareRecordingTooltip(status: MeetRecordingStatus): string {
		if (this.isShareable(status)) {
			return 'Share link';
		}

		return 'Only in-progress or completed recordings can be shared';
	}

	/**
	 * Gets the tooltip text for the delete action based on recording status.
	 */
	static getDeleteRecordingTooltip(status: MeetRecordingStatus): string {
		if (this.isDeletable(status)) {
			return 'Delete recording';
		}

		return 'Only completed or failed recordings can be deleted';
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
