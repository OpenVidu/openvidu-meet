import type {
	MeetRoom,
	MeetRoomAccess,
	MeetRoomAnonymousUsers,
	MeetRoomConfigOptions,
	MeetRoomExtraField,
	MeetRoomField,
	MeetRoomMemberPermissions,
	MeetRoomOptions,
	MeetRoomRoles
} from '@openvidu-meet/typings';
import { MEET_ROOM_EXTRA_FIELDS, MEET_ROOM_FIELDS, MeetRecordingAutoStartMode } from '@openvidu-meet/typings';
import type { Room } from 'livekit-server-sdk';
import { MEET_ENV } from '../environment.js';
import { addHttpResponseMetadata, applyHttpFieldFiltering, buildFieldsForDbQuery } from './field-filter.helper.js';
import { RecordingHelper } from './recording.helper.js';
import { MeetRoomMemberHelper } from './room-member.helper.js';

type MeetRoomAnonymousLink = keyof MeetRoomAnonymousUsers;

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
	 * Milliseconds left until the meeting running in `room` reaches its room's duration limit (zero
	 * or negative once the limit is exceeded). The deadline is the `endDate` in the room's metadata;
	 * a room LiveKit auto-created, or one created before Meet wrote that key, falls back to the limit
	 * counted from the LiveKit room creation time (in seconds, as LiveKit reports it).
	 */
	static meetingRemainingMs(room: Room, maxDurationMinutes: number, nowMs: number): number {
		const deadlineMs =
			this.extractMeetingEndDateFromMetadata(room.metadata) ??
			Number(room.creationTime) * 1000 + maxDurationMinutes * 60_000;
		return deadlineMs - nowMs;
	}

	/**
	 * Name of the scheduled task that ends the meeting running in `roomId` at its duration limit.
	 * One name per room, so arming it replaces the timer of an earlier meeting in the same room.
	 */
	static durationLimitTimerName(roomId: string): string {
		return `durationLimitTimer_${roomId}`;
	}

	/**
	 * Participants a room must be able to hold for the recording auto-start `mode` to ever fire, so
	 * that a `maxParticipants` limit below it can be rejected instead of stored as a recording that
	 * never starts.
	 *
	 * Reads `RecordingHelper`'s auto-start presets rather than keeping its own numbers, so this and
	 * the live auto-start evaluation can't drift apart.
	 */
	static minParticipantsForAutoStart(mode: MeetRecordingAutoStartMode): number {
		return RecordingHelper.getAutoStartConfig(mode).minParticipants;
	}

	/**
	 * Turns off the features end-to-end encryption excludes: recording, live broadcast and live
	 * captions need the server to read the media, which an encrypted room never lets it do.
	 *
	 * @param config - The room config, changed in place
	 */
	static disableFeaturesExcludedByE2EE(config: MeetRoomConfigOptions): void {
		if (!config.e2ee?.enabled) return;

		if (config.recording?.enabled) {
			config.recording = { ...config.recording, enabled: false };
		}

		if (config.broadcast?.enabled) {
			config.broadcast = { ...config.broadcast, enabled: false };
		}

		if (config.captions?.enabled) {
			config.captions = { ...config.captions, enabled: false };
		}
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
			access: {
				anonymous: {
					moderator: {
						enabled: room.access.anonymous.moderator.enabled
					},
					speaker: {
						enabled: room.access.anonymous.speaker.enabled
					},
					recording: {
						enabled: room.access.anonymous.recording.enabled
					}
				},
				user: {
					enabled: room.access.user.enabled
				}
			}
			// maxParticipants: room.maxParticipants
		};
	}

	/**
	 * Extracts speaker, moderator, and recording secrets from MeetRoom anonymous access URLs.
	 *
	 * This method parses the 'secret' query parameter from speaker, moderator, and recording
	 * anonymous access URLs associated with the meeting room.
	 *
	 * @param roomAccess - The access configuration of the MeetRoom from which to extract secrets.
	 * @returns An object containing the extracted secrets with the following properties:
	 *   - speakerSecret: The secret extracted from the speaker anonymous access URL
	 *   - moderatorSecret: The secret extracted from the moderator anonymous access URL
	 *   - recordingSecret: The secret extracted from the recording anonymous access URL
	 */
	static extractSecretsFromRoom(roomAccess: MeetRoomAccess): {
		speakerSecret: string;
		moderatorSecret: string;
		recordingSecret: string;
	} {
		const speakerUrl = roomAccess.anonymous.speaker.url;
		const moderatorUrl = roomAccess.anonymous.moderator.url;
		const recordingUrl = roomAccess.anonymous.recording.url;

		const parsedSpeakerUrl = new URL(speakerUrl);
		const speakerSecret = parsedSpeakerUrl.searchParams.get('secret') || '';
		const parsedModeratorUrl = new URL(moderatorUrl);
		const moderatorSecret = parsedModeratorUrl.searchParams.get('secret') || '';
		const parsedRecordingUrl = new URL(recordingUrl);
		const recordingSecret = parsedRecordingUrl.searchParams.get('secret') || '';
		return { speakerSecret, moderatorSecret, recordingSecret };
	}

	/**
	 * Builds the metadata OpenVidu Meet embeds in a LiveKit room when it creates it: the creator
	 * mark, the room options, the start of the meeting that starts with that very creation, `nowMs`,
	 * and, for a room that declares a duration limit, that meeting's deadline.
	 */
	static toLivekitRoomMetadata(room: MeetRoom, nowMs: number): string {
		const { maxDurationMinutes } = room.config;
		return JSON.stringify({
			createdBy: MEET_ENV.NAME_ID,
			startDate: nowMs,
			endDate: maxDurationMinutes ? nowMs + maxDurationMinutes * 60_000 : undefined,
			roomOptions: this.toRoomOptions(room)
		});
	}

	/**
	 * Safely parses JSON metadata and checks if createdBy matches NAME_ID.
	 * @returns true if metadata indicates OpenVidu Meet as creator, false otherwise
	 */
	static checkIfMeetingBelogsToOpenViduMeet(metadata?: string): boolean {
		return this.parseMetadata(metadata)?.createdBy === MEET_ENV.NAME_ID;
	}

	/**
	 * Extracts the room options OpenVidu Meet embeds in a LiveKit room's metadata when it creates the
	 * room (see `RoomService.createLivekitRoom`). Lets callers read room properties straight off a
	 * LiveKit webhook payload instead of querying the database.
	 *
	 * @param metadata - The raw LiveKit room metadata.
	 * @returns The embedded room options, or undefined if the metadata is absent, malformed or was
	 * not written by OpenVidu Meet.
	 */
	static extractRoomOptionsFromMetadata(metadata?: string): MeetRoomOptions | undefined {
		const roomOptions = this.parseMetadata(metadata)?.roomOptions;

		if (typeof roomOptions !== 'object' || roomOptions === null) {
			return undefined;
		}

		return roomOptions;
	}

	/**
	 * Extracts the instant the running meeting started, which OpenVidu Meet embeds in a LiveKit
	 * room's metadata when it creates the room (see `RoomService.createLivekitRoom`). Being shared
	 * state, it is the one start every participant counts the meeting's time from.
	 *
	 * @param metadata - The raw LiveKit room metadata.
	 * @returns The start in milliseconds since the epoch, or undefined if the metadata is absent,
	 * malformed or was not written by OpenVidu Meet.
	 */
	static extractMeetingStartDateFromMetadata(metadata?: string): number | undefined {
		return this.extractTimestampFromMetadata(metadata, 'startDate');
	}

	/**
	 * Extracts the instant at which the running meeting reaches its room's duration limit, which
	 * OpenVidu Meet embeds in a LiveKit room's metadata when it creates the room for a room that
	 * declares a limit (see `RoomService.createLivekitRoom`). Being shared state, it is the one
	 * deadline the backend enforces and every participant counts down to.
	 *
	 * @param metadata - The raw LiveKit room metadata.
	 * @returns The deadline in milliseconds since the epoch, or undefined if the metadata is absent,
	 * malformed, was not written by OpenVidu Meet or declares no deadline.
	 */
	static extractMeetingEndDateFromMetadata(metadata?: string): number | undefined {
		return this.extractTimestampFromMetadata(metadata, 'endDate');
	}

	private static extractTimestampFromMetadata(
		metadata: string | undefined,
		key: 'startDate' | 'endDate'
	): number | undefined {
		const timestamp = this.parseMetadata(metadata)?.[key];
		return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : undefined;
	}

	private static parseMetadata(metadata?: string): Record<string, unknown> | undefined {
		if (!metadata) return undefined;

		try {
			const parsed: unknown = JSON.parse(metadata);
			return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
		} catch {
			return undefined;
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
		fields?: readonly MeetRoomField[],
		extraFields?: readonly MeetRoomExtraField[]
	): MeetRoomField[] {
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
	static applyFieldFilters<TRoom extends Partial<MeetRoom>>(
		room: TRoom,
		fields?: readonly MeetRoomField[],
		extraFields?: readonly MeetRoomExtraField[]
	): TRoom {
		return applyHttpFieldFiltering(room, fields, extraFields, MEET_ROOM_EXTRA_FIELDS);
	}

	/**
	 * Removes from a room the anonymous link URLs the caller may not read: each one is kept only when
	 * the caller holds `roomShareAccessLinks` and every permission that link grants. Reads the room's
	 * `roles`, so the room must carry them whenever it carries `access`.
	 *
	 * @param room - The room to filter
	 * @param permissions - The caller's permissions in the room
	 */
	static applyPermissionFiltering<TRoom extends Partial<MeetRoom>>(
		room: TRoom,
		permissions: MeetRoomMemberPermissions
	): TRoom {
		const { access, roles } = room;

		if (!access) {
			return room;
		}

		const canShare = (link: MeetRoomAnonymousLink) =>
			permissions.roomShareAccessLinks &&
			!!roles &&
			MeetRoomMemberHelper.grantsWithin(this.anonymousLinkPermissions(link, roles), permissions);
		const anonymous = Object.fromEntries(
			(Object.keys(access.anonymous) as MeetRoomAnonymousLink[]).map((link) => {
				const { enabled, url } = access.anonymous[link];
				return [link, canShare(link) ? { enabled, url } : { enabled }];
			})
		) as unknown as MeetRoomAnonymousUsers;

		return { ...room, access: { ...access, anonymous } };
	}

	/**
	 * The permissions an anonymous link grants whoever enters through it: its role's for the moderator
	 * and speaker links, the recording read permissions for the recordings link.
	 */
	static anonymousLinkPermissions(link: MeetRoomAnonymousLink, roles: MeetRoomRoles): MeetRoomMemberPermissions {
		return link === 'recording' ? MeetRoomMemberHelper.recordingReadOnlyPermissions() : roles[link].permissions;
	}

	/**
	 * Whether a room projected to `fields` carries anonymous link URLs to filter.
	 */
	static shouldApplyPermissionFilteringForFields(fields: MeetRoomField[]): boolean {
		return fields.includes('access');
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
