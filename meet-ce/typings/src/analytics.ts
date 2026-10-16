/**
 * Interface representing analytics data for OpenVidu Meet usage.
 */
export interface MeetAnalytics {
	/**
	 * Number of rooms that currently exist
	 */
	totalRooms: number;
	/**
	 * Number of rooms that currently have an active meeting
	 */
	activeRooms: number;
	/**
	 * Number of recordings that currently exist
	 */
	totalRecordings: number;
	/**
	 * Number of existing recordings whose status is `complete`
	 */
	completeRecordings: number;
}
