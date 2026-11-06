/**
 * The room that reaches its `autoDeletionDate` first.
 */
export interface MeetExpiringRoom {
	/**
	 * Unique identifier of the room
	 */
	roomId: string;
	/**
	 * Name of the room
	 */
	roomName: string;
	/**
	 * Timestamp in milliseconds when the room reaches its auto-deletion date
	 */
	autoDeletionDate: number;
}

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
	 * Number of rooms whose status is `open`
	 */
	openRooms: number;
	/**
	 * Number of rooms whose status is `closed`
	 */
	closedRooms: number;
	/**
	 * Number of recordings that currently exist
	 */
	totalRecordings: number;
	/**
	 * Number of existing recordings whose status is `complete`
	 */
	completeRecordings: number;
	/**
	 * Number of recordings whose status is `starting`, `active` or `ending`
	 */
	recordingsInProgress: number;
	/**
	 * Number of recordings whose status is `failed`, `aborted` or `limit_reached`
	 */
	failedRecordings: number;
	/**
	 * Number of rooms whose `autoDeletionDate` falls between now and 7 days ahead
	 */
	roomsExpiringSoon: number;
	/**
	 * The room with the earliest `autoDeletionDate` among those counted in `roomsExpiringSoon`.
	 * Absent when no room is expiring soon
	 */
	nextExpiringRoom?: MeetExpiringRoom;
}
