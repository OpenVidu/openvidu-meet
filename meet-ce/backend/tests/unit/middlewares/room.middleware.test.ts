import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { container, registerDependencies } from '../../../src/config/dependency-injector.config.js';
import { withRoomPermission } from '../../../src/middlewares/room.middleware.js';
import { RequestSessionService } from '../../../src/services/request-session.service.js';
import { RoomService } from '../../../src/services/room.service.js';

type ResponseMock = Response & { status: jest.Mock; json: jest.Mock };

const mockResponse = (): ResponseMock => {
	const res = {
		status: jest.fn(() => res),
		json: jest.fn(() => res)
	} as unknown as ResponseMock;

	return res;
};

const requestFor = (roomId: string): Request => ({ params: { roomId } }) as unknown as Request;

const roomService = {
	meetRoomExists: async () => true,
	getAuthenticatedRoomMemberPermissions: async () => ({}) as MeetRoomMemberPermissions
} as unknown as RoomService;
let requestSessionService: RequestSessionService;

beforeAll(() => {
	registerDependencies();
	container.rebind(RoomService).toConstantValue(roomService);
	requestSessionService = container.get(RequestSessionService);
});

describe('withRoomPermission', () => {
	const checkChatWrite = withRoomPermission('chatWrite');

	beforeEach(() => {
		jest.restoreAllMocks();
		jest.spyOn(roomService, 'meetRoomExists').mockResolvedValue(true);
		jest.spyOn(roomService, 'getAuthenticatedRoomMemberPermissions').mockResolvedValue({
			chatWrite: true
		} as MeetRoomMemberPermissions);
	});

	// The room member token validator has just found this room, or it would have refused the token.
	it('does not look the room up again for a room member token of that same room', async () => {
		jest.spyOn(requestSessionService, 'getRoomIdFromMember').mockReturnValue('room-1');
		const next = jest.fn() as unknown as NextFunction;

		await checkChatWrite(requestFor('room-1'), mockResponse(), next);

		expect(roomService.meetRoomExists).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalled();
	});

	it('looks the room up for a room member token of another room', async () => {
		jest.spyOn(requestSessionService, 'getRoomIdFromMember').mockReturnValue('room-2');

		await checkChatWrite(requestFor('room-1'), mockResponse(), jest.fn() as unknown as NextFunction);

		expect(roomService.meetRoomExists).toHaveBeenCalledWith('room-1');
	});

	it('answers 404 for a missing room when no room member token authenticated the request', async () => {
		jest.spyOn(requestSessionService, 'getRoomIdFromMember').mockReturnValue(undefined);
		jest.spyOn(roomService, 'meetRoomExists').mockResolvedValue(false);
		const res = mockResponse();
		const next = jest.fn() as unknown as NextFunction;

		await checkChatWrite(requestFor('room-1'), res, next);

		expect(res.status).toHaveBeenCalledWith(404);
		expect(next).not.toHaveBeenCalled();
	});
});
