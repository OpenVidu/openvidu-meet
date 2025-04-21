import { MeetRoomHelper } from '../../src/helpers';
import { createRoom, loginUserAsRole, generateParticipantToken, joinFakeParticipant } from './helpers';

import { UserRole } from '../../src/typings/ce';

export interface RoomData {
	room: any;
	moderatorCookie: string;
	moderatorSecret: string;
	recordingId?: string;
}

export interface TestContext {
	rooms: RoomData[];
	getRoomByIndex(index: number): RoomData | undefined;
}

/**
 * Configura un escenario de prueba con dos salas para pruebas de grabación concurrente
 */
export async function setupMultiRoomTestContext(numRooms: number, withParticipants: boolean): Promise<TestContext> {
	const adminCookie = await loginUserAsRole(UserRole.ADMIN);
	const rooms: RoomData[] = [];

	// Create additional rooms
	for (let i = 0; i < numRooms; i++) {
		const room = await createRoom({
			roomIdPrefix: `test-recording-room-${i + 1}`
		});
		const { moderatorSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
		const moderatorCookie = await generateParticipantToken(
			adminCookie,
			room.roomId,
			`Moderator-${i + 1}`,
			moderatorSecret
		);

		if (withParticipants) {
			const participantId = `TEST_P-${i + 1}`;

			await joinFakeParticipant(room.roomId, participantId);
		}

		rooms.push({
			room,
			moderatorCookie,
			moderatorSecret
		});
	}

	return {
		rooms,
		getRoomByIndex: (index: number) => {
			if (index < 0 || index >= rooms.length) {
				return undefined;
			}

			return rooms[index];
		}
	};
}
