import { MeetRoomCollapsibleProperties, MeetRoomField } from '@openvidu-meet/typings';

/**
 * Options for configuring the response MeetRoom REST API object
 */
export interface MeetRoomServerResponseOptions {
	/**
	 * Array of fields to include in the response.
	 * If not specified, all fields are included.
	 */
	fields?: MeetRoomField[];
	/**
	 * Array of collapsed properties to expand in the response.
	 * If not specified, no collapsed properties are expanded.
	 *
	 */
	collapse?: MeetRoomCollapsibleProperties[];
	/**
	 * Whether to check permissions for the room.
	 * If true, sensitive properties will be removed from the response if the requester does not have permission to view them.
	 */
	applyPermissionFiltering?: boolean;
}
