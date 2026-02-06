import { MeetRoomExpandableProperties, MeetRoomField } from '@openvidu-meet/typings';

/**
 * Options for configuring the response MeetRoom REST API object
 */
export interface MeetRoomClientResponseOptions {
	/**
	 * Array of fields to include in the response.
	 * If not specified, all fields are included.
	 */
	fields?: MeetRoomField[];
	/**
	 * Array of expandable properties to expand in the response.
	 * If not specified, expandable properties will not be expanded.
	 */
	expand?: MeetRoomExpandableProperties[];
}
