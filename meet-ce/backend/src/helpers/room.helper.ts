import { MeetRoom, MeetRoomOptions } from '@openvidu-meet/typings';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import {
	MEET_ROOM_EXPANDABLE_FIELDS,
	MeetRoomCollapsibleProperties,
	MeetRoomExpandableProperties
} from '../models/room-request.js';

export class MeetRoomHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	/**
	 * Sanitizes a room name by normalizing format.
	 *
	 * @param val The string to sanitize
	 * @returns A sanitized string safe for use as a room name
	 */
	static sanitizeRoomName(val: string): string {
		return val
			.trim() // Remove leading/trailing spaces
			.replace(/\s+/g, ' '); // Replace multiple consecutive spaces with a single space
	}

	/**
	 * Sanitizes an identifier by removing invalid characters
	 *
	 * @param val The string to sanitize
	 * @returns A sanitized string safe for use as an identifier
	 */
	static sanitizeRoomId(val: string): string {
		return val.replace(/[^a-zA-Z0-9_-]/g, ''); // Allow only letters, numbers, hyphens and underscores
	}

	/**
	 * Creates a sanitized room ID prefix from the given room name.
	 *
	 * This method normalizes the room name by:
	 * - Decomposing combined characters (e.g., á -> a + ´)
	 * - Converting to lowercase
	 * - Replacing hyphens and spaces with underscores
	 * - Allowing only lowercase letters, numbers, and underscores
	 * - Replacing multiple consecutive underscores with a single underscore
	 * - Removing leading and trailing underscores
	 *
	 * @param roomName The original room name.
	 * @returns A sanitized string suitable for use as a room ID prefix.
	 */
	static createRoomIdPrefixFromRoomName(roomName: string): string {
		return roomName
			.normalize('NFD') // Decompose combined characters (e.g., á -> a + ´)
			.toLowerCase() // Convert to lowercase
			.replace(/[-\s]/g, '_') // Replace hyphens and spaces with underscores
			.replace(/[^a-z0-9_]/g, '') // Allow only lowercase letters, numbers and underscores
			.replace(/_+/g, '_') // Replace multiple consecutive underscores with a single underscore
			.replace(/_+$/, '') // Remove trailing underscores
			.replace(/^_+/, ''); // Remove leading underscores
	}

	/**
	 * Converts an MeetRoom object to an MeetRoomOptions object.
	 *
	 * @param room - The MeetRoom object to convert.
	 * @returns An MeetRoomOptions object containing the same properties as the input room.
	 */
	static toRoomOptions(room: MeetRoom): MeetRoomOptions {
		return {
			roomName: room.roomName,
			autoDeletionDate: room.autoDeletionDate,
			autoDeletionPolicy: room.autoDeletionPolicy,
			config: room.config,
			roles: room.roles,
			anonymous: {
				moderator: {
					enabled: room.anonymous.moderator.enabled
				},
				speaker: {
					enabled: room.anonymous.speaker.enabled
				}
			}
			// maxParticipants: room.maxParticipants
		};
	}

	/**
	 * Extracts speaker and moderator secrets from a MeetRoom object's URLs.
	 *
	 * This method parses the 'secret' query parameter from both speaker and moderator
	 * anonymous access URLs associated with the meeting room.
	 *
	 * @param room - The MeetRoom object containing speakerUrl and moderatorUrl properties
	 * @returns An object containing the extracted secrets with the following properties:
	 *   - speakerSecret: The secret extracted from the speaker anonymous access URL
	 *   - moderatorSecret: The secret extracted from the moderator anonymous access URL
	 */
	static extractSecretsFromRoom(room: MeetRoom): { speakerSecret: string; moderatorSecret: string } {
		const speakerUrl = room.anonymous.speaker.accessUrl;
		const moderatorUrl = room.anonymous.moderator.accessUrl;

		const parsedSpeakerUrl = new URL(speakerUrl);
		const speakerSecret = parsedSpeakerUrl.searchParams.get('secret') || '';
		const parsedModeratorUrl = new URL(moderatorUrl);
		const moderatorSecret = parsedModeratorUrl.searchParams.get('secret') || '';
		return { speakerSecret, moderatorSecret };
	}

	/**
	 * Safely parses JSON metadata and checks if createdBy matches NAME_ID.
	 * @returns true if metadata indicates OpenVidu Meet as creator, false otherwise
	 */
	static checkIfMeetingBelogsToOpenViduMeet(metadata?: string): boolean {
		if (!metadata) return false;

		try {
			const parsed = JSON.parse(metadata);
			const isOurs = parsed?.createdBy === MEET_ENV.NAME_ID;
			return isOurs;
		} catch (err: unknown) {
			return false;
		}
	}

	/**
	 *  Determines which properties of a MeetRoom should be collapsed into stubs based on the provided expandable properties.
	 *  By default, if no expandable properties are specified, the 'config' property will be collapsed.
	 * @param expandableProps
	 * @returns An array of MeetRoomCollapsibleProperties that should be collapsed into stubs when returning a MeetRoom object.
	 */
	static toCollapseProperties(expand?: MeetRoomExpandableProperties[]): MeetRoomCollapsibleProperties[] {
		// If not expand provided, collapse all collapsible properties by default
		if (!expand || expand.length === 0) {
			return [...MEET_ROOM_EXPANDABLE_FIELDS];
		}

		// Return the properties that are not included in the expand array, but only those that are actually expandable
		return MEET_ROOM_EXPANDABLE_FIELDS.filter((prop) => !expand.includes(prop));
	}

	/**
	 * Processes a room to collapse specified properties into stubs.
	 * By default, returns the full room object.
	 * Only collapses properties when explicitly specified in the collapse parameter.
	 *
	 * @param room - The room object to process
	 * @param props - Optional list of properties to collapse (e.g., ['config'])
	 * @example
	 * ```
	 * // Collapse config:
	 * 	{
	 * 		config: {
	 * 			_expandable: true,
	 * 			_href: '/api/rooms/123?expand=config'
	 * 		}
	 * 	}
	 * ```
	 */
	static applyCollapseProperties(room: MeetRoom, props?: MeetRoomCollapsibleProperties[]): MeetRoom {
		// If no collapse specified, return the full room
		if (!room || !props || props.length === 0) {
			return room;
		}

		// Filter the props to only those that exist in the room object and are not undefined
		const existingProps = props.filter(
			(prop) => Object.prototype.hasOwnProperty.call(room, prop) && room[prop] !== undefined
		);

		// If none of the specified props exist in the room, return the full room without modification
		if (existingProps.length === 0) {
			return room;
		}

		const collapsedRoom = { ...room };
		const { roomId } = room;
		const baseUrl = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`;

		existingProps.forEach((prop) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(collapsedRoom as any)[prop] = {
				_expandable: true,
				_href: `${baseUrl}?expand=${prop}`
			};
		});

		return collapsedRoom;
	}
}
