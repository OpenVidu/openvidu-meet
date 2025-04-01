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
			expirationDate: room.expirationDate,
			// maxParticipants: room.maxParticipants,
			preferences: room.preferences,
			roomIdPrefix: room.roomIdPrefix
		};
	}
}
