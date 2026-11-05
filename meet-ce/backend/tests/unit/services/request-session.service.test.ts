import { describe, expect, it, jest } from '@jest/globals';
import type { MeetRoomMemberTokenMetadata, MeetUser } from '@openvidu-meet/typings';
import { MeetUserRole } from '@openvidu-meet/typings';
import type { RequestRoomSnapshot } from '../../../src/models/request-context.model.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import { RequestSessionService } from '../../../src/services/request-session.service.js';

const user = { userId: 'alice', role: MeetUserRole.ROOM_MANAGER } as MeetUser;
const roomMember = { roomId: 'room-1', memberId: 'member-1', permissions: { chatWrite: true } };
const room = { roomId: 'room-1', rolesUpdatedAt: 0 } as RequestRoomSnapshot;

describe('RequestSessionService', () => {
	const build = () => {
		const debug = jest.fn();
		return { service: new RequestSessionService({ debug } as unknown as LoggerService), debug };
	};

	const fill = (service: RequestSessionService) => {
		service.setUser(user);
		service.setRoomMemberTokenInfo({ ...roomMember } as unknown as MeetRoomMemberTokenMetadata, 'speaker-1');
		service.setRoom(room);
	};

	const read = (service: RequestSessionService) => ({
		user: service.getAuthenticatedUser(),
		roomId: service.getRoomIdFromMember(),
		memberId: service.getRoomMemberId(),
		identity: service.getParticipantIdentity(),
		permissions: service.getRoomMemberPermissions(),
		room: service.getRoom('room-1')
	});

	it('keeps what a request stored for that request only', async () => {
		const { service } = build();

		const [first, second] = await Promise.all([
			service.run(async () => {
				fill(service);
				await new Promise((resolve) => setImmediate(resolve));
				return read(service);
			}),
			service.run(async () => read(service))
		]);

		expect(first).toEqual({
			user,
			roomId: 'room-1',
			memberId: 'member-1',
			identity: 'speaker-1',
			permissions: { chatWrite: true },
			room
		});
		expect(Object.values(second).every((value) => value === undefined)).toBe(true);
	});

	it('gives the stored room only to a caller asking about that same room', async () => {
		const { service } = build();

		await service.run(async () => {
			service.setRoom(room);

			expect(service.getRoom('room-1')).toBe(room);
			expect(service.getRoom('room-2')).toBeUndefined();
		});
	});

	it('ignores writes and answers nothing outside a request, saying so once', () => {
		const { service, debug } = build();

		fill(service);
		const values = read(service);

		expect(Object.values(values).every((value) => value === undefined)).toBe(true);
		expect(debug).toHaveBeenCalledTimes(1);
	});
});
