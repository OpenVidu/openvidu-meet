import { MeetRoom, MeetRoomOptions } from '@typings-ce';
import { MEET_NAME_ID } from '../environment.js';

export class MeetRoomHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	/**
	 * Converts an MeetRoom object to an MeetRoomOptions object.
	 *
	 * @param room - The MeetRoom object to convert.
	 * @returns An MeetRoomOptions object containing the same properties as the input room.
	 */
	static toOpenViduOptions(room: MeetRoom): MeetRoomOptions {
		return {
			roomName: room.roomName,
			autoDeletionDate: room.autoDeletionDate,
			preferences: room.preferences
			// maxParticipants: room.maxParticipants
		};
	}

	/**
	 * Extracts speaker and moderator secrets from a MeetRoom object's URLs.
	 *
	 * This method parses the 'secret' query parameter from both speaker and moderator
	 * room URLs associated with the meeting room.
	 *
	 * @param room - The MeetRoom object containing speakerUrl and moderatorUrl properties
	 * @returns An object containing the extracted secrets with the following properties:
	 *   - speakerSecret: The secret extracted from the speaker room URL
	 *   - moderatorSecret: The secret extracted from the moderator room URL
	 */
	static extractSecretsFromRoom(room: MeetRoom): { speakerSecret: string; moderatorSecret: string } {
		const { speakerUrl, moderatorUrl } = room;

		const parsedSpeakerUrl = new URL(speakerUrl);
		const speakerSecret = parsedSpeakerUrl.searchParams.get('secret') || '';
		const parsedModeratorUrl = new URL(moderatorUrl);
		const moderatorSecret = parsedModeratorUrl.searchParams.get('secret') || '';
		return { speakerSecret, moderatorSecret };
	}

	/**
	 * Safely parses JSON metadata and checks if createdBy matches MEET_NAME_ID.
	 * @returns true if metadata indicates OpenVidu Meet as creator, false otherwise
	 */
	static checkIfMeetingBelogsToOpenViduMeet(metadata?: string): boolean {
		if (!metadata) return false;

		try {
			const parsed = JSON.parse(metadata);
			const isOurs = parsed?.createdBy === MEET_NAME_ID;
			return isOurs;
		} catch (err: unknown) {
			return false;
		}
	}
}
