import { MeetRoom, MeetRoomOptions } from '@typings-ce';
import { CreateOptions } from 'livekit-server-sdk';
import { MEET_NAME_ID } from '../environment.js';
import { uid } from 'uid/single';

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
			maxParticipants: room.maxParticipants,
			preferences: room.preferences,
			roomNamePrefix: room.roomNamePrefix
		};
	}

	static generateLivekitRoomOptions(roomInput: MeetRoom | MeetRoomOptions): CreateOptions {
		const isOpenViduRoom = 'creationDate' in roomInput;
		const sanitizedPrefix = roomInput.roomNamePrefix
			?.trim()
			.replace(/[^a-zA-Z0-9-]/g, '')
			.replace(/-+$/, '');
		const sanitizedRoomName = sanitizedPrefix ? `${sanitizedPrefix}-${uid(15)}` : uid(15);
		const {
			roomName = sanitizedRoomName,
			expirationDate,
			maxParticipants,
			creationDate = Date.now()
		} = roomInput as MeetRoom;

		const timeUntilExpiration = this.calculateExpirationTime(expirationDate, creationDate);

		return {
			name: roomName,
			metadata: JSON.stringify({
				createdBy: MEET_NAME_ID,
				roomOptions: isOpenViduRoom
					? MeetRoomHelper.toOpenViduOptions(roomInput as MeetRoom)
					: roomInput
			}),
			emptyTimeout: timeUntilExpiration,
			maxParticipants: maxParticipants || undefined,
			departureTimeout: 31_536_000 // 1 year
		};
	}

	private static calculateExpirationTime(expirationDate: number, creationDate: number): number {
		return Math.max(0, Math.floor((expirationDate - creationDate) / 1000));
	}
}
