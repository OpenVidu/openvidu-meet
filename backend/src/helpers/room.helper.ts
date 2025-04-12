import { MeetRoom, MeetRoomOptions } from '@typings-ce';

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
			autoDeletionDate: room.autoDeletionDate,
			// maxParticipants: room.maxParticipants,
			preferences: room.preferences,
			roomIdPrefix: room.roomIdPrefix
		};
	}

	/**
	 * Extracts publisher and moderator secrets from a MeetRoom object's URLs.
	 *
	 * This method parses the 'secret' query parameter from both publisher and moderator
	 * room URLs associated with the meeting room.
	 *
	 * @param room - The MeetRoom object containing publisherRoomUrl and moderatorRoomUrl properties
	 * @returns An object containing the extracted secrets with the following properties:
	 *   - publisherSecret: The secret extracted from the publisher room URL
	 *   - moderatorSecret: The secret extracted from the moderator room URL
	 */
	static extractSecretsFromRoom(room: MeetRoom): { publisherSecret: string; moderatorSecret: string } {
		const { publisherRoomUrl, moderatorRoomUrl } = room;

		const publisherUrl = new URL(publisherRoomUrl);
		const publisherSecret = publisherUrl.searchParams.get('secret') || '';
		const moderatorUrl = new URL(moderatorRoomUrl);
		const moderatorSecret = moderatorUrl.searchParams.get('secret') || '';
		return { publisherSecret, moderatorSecret };
	}
}
