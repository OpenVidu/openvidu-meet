import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoom, MeetRoomConfig } from '@openvidu-meet/typings';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import type { RoomRepository } from '../../../src/repositories/room.repository.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import { RequestSessionService } from '../../../src/services/request-session.service.js';
import { RoomService } from '../../../src/services/room.service.js';

/**
 * A request authenticated with a room member token has already read its room in the validator, so a
 * check that only gates a feature on that room's config takes it from there. Any other request, or a
 * check on another room, still reads the room from MongoDB.
 */
describe('RoomService.getRequestRoomConfig', () => {
	const sharedConfig = { reactions: { enabled: true } } as MeetRoomConfig;
	const storedConfig = { reactions: { enabled: false } } as MeetRoomConfig;

	let findByRoomId: jest.Mock<(roomId: string, fields: readonly string[]) => Promise<Partial<MeetRoom> | null>>;
	let requestSessionService: RequestSessionService;
	let roomService: RoomService;

	const inRequestValidatedAgainst = (roomId: string, read: () => Promise<MeetRoomConfig>) =>
		requestSessionService.run(() => {
			requestSessionService.setRoom({ roomId, rolesUpdatedAt: 0, config: sharedConfig });
			return read();
		});

	beforeEach(() => {
		const logger = { debug: () => {} } as unknown as LoggerService;
		findByRoomId = jest.fn(async () => ({ config: storedConfig }));
		requestSessionService = new RequestSessionService(logger);
		roomService = new RoomService(
			logger,
			{ findByRoomId } as unknown as RoomRepository,
			{} as never,
			{} as never,
			{} as never,
			requestSessionService
		);
	});

	it('takes the config of the room the request was validated against without reading it again', async () => {
		const config = await inRequestValidatedAgainst('room-1', () => roomService.getRequestRoomConfig('room-1'));

		expect(config).toBe(sharedConfig);
		expect(findByRoomId).not.toHaveBeenCalled();
	});

	it('reads the config of any other room', async () => {
		const config = await inRequestValidatedAgainst('room-2', () => roomService.getRequestRoomConfig('room-1'));

		expect(config).toBe(storedConfig);
		expect(findByRoomId).toHaveBeenCalledWith('room-1', ['config']);
	});

	it('reads the config when no room member token authenticated the request', async () => {
		const config = await requestSessionService.run(() => roomService.getRequestRoomConfig('room-1'));

		expect(config).toBe(storedConfig);
		expect(findByRoomId).toHaveBeenCalledWith('room-1', ['config']);
	});

	it('answers 404 for a room that does not exist', async () => {
		findByRoomId.mockResolvedValue(null);

		await expect(
			inRequestValidatedAgainst('room-2', () => roomService.getRequestRoomConfig('room-1'))
		).rejects.toMatchObject({ statusCode: 404 });
	});
});
