import {
	MEET_ROOM_EXTRA_FIELDS,
	MEET_ROOM_FIELDS,
	MeetRoom,
	MeetRoomExtraField,
	MeetRoomField,
	MeetRoomMemberPermissions,
	MeetRoomOptions,
	SENSITIVE_ROOM_FIELDS_ENTRIES
} from '@openvidu-meet/typings';
import { MEET_ENV } from '../environment.js';
import { getBasePath } from '../utils/html-dynamic-base-path.utils.js';
import { addHttpResponseMetadata, applyHttpFieldFiltering, buildFieldsForDbQuery } from './field-filter.helper.js';

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
	 * Calculates optimal fields to request from database for Room queries.
	 * Minimizes data transfer by excluding unnecessary extra fields.
	 *
	 * @param fields - Explicitly requested fields
	 * @param extraFields - Extra fields to include
	 * @returns Array of fields to request from database
	 */
	static computeFieldsForRoomQuery(
		fields?: MeetRoomField[],
		extraFields?: MeetRoomExtraField[]
	): MeetRoomField[] | undefined {
		return buildFieldsForDbQuery(fields, extraFields, MEET_ROOM_FIELDS, MEET_ROOM_EXTRA_FIELDS);
	}

	/**
	 * Applies HTTP-level field filtering to a MeetRoom object.
	 * This is the final transformation before sending the response to the client.
	 *
	 * The logic follows the union principle: final allowed fields = fields ∪ extraFields
	 *
	 * @param room - The room object to process
	 * @param fields - Optional array of field names to include (e.g., ['roomId', 'roomName'])
	 * @param extraFields - Optional array of extra field names to include (e.g., ['config'])
	 * @returns A MeetRoom object with fields filtered according to the union of both parameters
	 * @example
	 * ```
	 * // No filters - removes extra fields only:
	 * const room = applyFieldFilters(fullRoom);
	 * // Result: room without 'config' property
	 *
	 * // Only fields specified - includes only those fields:
	 * const room = applyFieldFilters(fullRoom, ['roomId', 'roomName']);
	 * // Result: { roomId: '123', roomName: 'My Room' }
	 *
	 * // Only extraFields specified - includes base fields + extra fields:
	 * const room = applyFieldFilters(fullRoom, undefined, ['config']);
	 * // Result: room with all base fields and 'config' property
	 *
	 * // Both specified - includes union of both:
	 * const room = applyFieldFilters(fullRoom, ['roomId'], ['config']);
	 * // Result: { roomId: '123', config: {...} }
	 * ```
	 */
	static applyFieldFilters(room: MeetRoom, fields?: MeetRoomField[], extraFields?: MeetRoomExtraField[]): MeetRoom {
		return applyHttpFieldFiltering(room, fields, extraFields, MEET_ROOM_EXTRA_FIELDS);
	}

	/**
	 *  Applies permission filtering to a MeetRoom object by removing sensitive fields based on the provided permissions.
	 * @param room
	 * @param permissions
	 * @returns
	 */
	static applyPermissionFiltering(room: MeetRoom, permissions: MeetRoomMemberPermissions): MeetRoom {
		if (!room || !permissions || SENSITIVE_ROOM_FIELDS_ENTRIES.length === 0) {
			return room;
		}

		let filteredRoom: MeetRoom | undefined;

		for (const [permissionKey, fields] of SENSITIVE_ROOM_FIELDS_ENTRIES as [
			keyof MeetRoomMemberPermissions,
			(keyof MeetRoom)[]
		][]) {
			if (!fields?.length) {
				continue;
			}

			if (permissions[permissionKey]) {
				continue;
			}

			filteredRoom ??= { ...room };
			fields.forEach((field) => {
				delete (filteredRoom as Partial<MeetRoom>)[field];
			});
		}

		return filteredRoom ?? room;
	}

	/**
	 * Adds metadata to the room response indicating which extra fields are available.
	 * This allows API consumers to discover available extra fields without consulting documentation.
	 *
	 * @param obj - The object to enhance with metadata
	 * @returns The object with _extraFields metadata added
	 */
	static addResponseMetadata<T>(obj: T): T & { _extraFields: MeetRoomExtraField[] } {
		return addHttpResponseMetadata(obj, MEET_ROOM_EXTRA_FIELDS);
	}
}
