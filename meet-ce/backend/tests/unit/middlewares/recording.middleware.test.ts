import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MeetRecordingStatus } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { container, registerDependencies } from '../../../src/config/dependency-injector.config.js';
import {
	authorizeRecordingAccess,
	setupRecordingAuthentication
} from '../../../src/middlewares/recording.middleware.js';
import {
	errorInvalidRecordingSecret,
	errorRecordingNotFound,
	errorRoomNotFound
} from '../../../src/models/error.model.js';
import { RecordingService } from '../../../src/services/recording.service.js';
import { RoomService } from '../../../src/services/room.service.js';

type ResponseMock = Response & { status: jest.Mock; json: jest.Mock; locals: Record<string, unknown> };

const mockResponse = (): ResponseMock => {
	const res = { locals: {}, status: jest.fn(() => res), json: jest.fn(() => res) } as unknown as ResponseMock;
	return res;
};

const RECORDING_ID = 'room-1--EG_1--uid1';
const recording = { status: MeetRecordingStatus.COMPLETE, filename: 'room-1--uid1.mp4' };

const requestWithSecret = (recordingSecret?: string): Request =>
	({ params: { recordingId: RECORDING_ID }, query: { recordingSecret }, headers: {} }) as unknown as Request;

const recordingService = {
	getRecordingSecretGrant: async () => ({ scope: 'public', download: true, recording }),
	validateRecordingAccess: async () => ({ roomId: 'room-1', ...recording })
} as unknown as RecordingService;
const roomService = { getMeetRoom: async () => ({}) } as unknown as RoomService;

const anonymousRecording = (enabled: boolean) => ({ access: { anonymous: { recording: { enabled } } } });

beforeAll(() => {
	registerDependencies();
	container.rebind(RecordingService).toConstantValue(recordingService);
	container.rebind(RoomService).toConstantValue(roomService);
});

beforeEach(() => {
	jest.restoreAllMocks();
	jest.spyOn(recordingService, 'getRecordingSecretGrant').mockResolvedValue({
		scope: 'public',
		download: true,
		recording
	});
	jest.spyOn(recordingService, 'validateRecordingAccess').mockResolvedValue({
		roomId: 'room-1',
		...recording
	} as never);
	jest.spyOn(roomService, 'getMeetRoom').mockResolvedValue(anonymousRecording(true) as never);
});

describe('setupRecordingAuthentication with a recording secret', () => {
	const setup = setupRecordingAuthentication('recordingPlay');

	it('reads the secrets and the room together and hands the recording to the controller', async () => {
		let release!: () => void;
		const secretsRead = new Promise<void>((resolve) => (release = resolve));
		jest.spyOn(recordingService, 'getRecordingSecretGrant').mockImplementation(async () => {
			await secretsRead;
			return { scope: 'public', download: true, recording };
		});
		const res = mockResponse();
		const next = jest.fn() as unknown as NextFunction;

		const running = setup(requestWithSecret('secret'), res, next);
		await new Promise((resolve) => setImmediate(resolve));
		expect(roomService.getMeetRoom).toHaveBeenCalledWith('room-1', ['access']);

		release();
		await running;

		expect(res.locals.recording).toEqual(recording);
		expect(next).toHaveBeenCalled();
	});

	it('answers 403 when the room does not allow anonymous recording access', async () => {
		jest.spyOn(roomService, 'getMeetRoom').mockResolvedValue(anonymousRecording(false) as never);
		const res = mockResponse();
		const next = jest.fn() as unknown as NextFunction;

		await setup(requestWithSecret('secret'), res, next);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});

	it('answers the room error of a public secret whose room is gone', async () => {
		jest.spyOn(roomService, 'getMeetRoom').mockRejectedValue(errorRoomNotFound('room-1'));
		const res = mockResponse();

		await setup(requestWithSecret('secret'), res, jest.fn() as unknown as NextFunction);

		expect(res.status).toHaveBeenCalledWith(404);
	});

	it.each([
		['an invalid secret', errorInvalidRecordingSecret(RECORDING_ID), 400],
		['an unknown recording', errorRecordingNotFound(RECORDING_ID), 404]
	])('answers the secret error of %s before the room error', async (_case, secretError, status) => {
		jest.spyOn(recordingService, 'getRecordingSecretGrant').mockRejectedValue(secretError);
		jest.spyOn(roomService, 'getMeetRoom').mockRejectedValue(new Error('room read failed'));
		const res = mockResponse();

		await setup(requestWithSecret('secret'), res, jest.fn() as unknown as NextFunction);

		expect(res.status).toHaveBeenCalledWith(status);
		expect(res.locals.recording).toBeUndefined();
	});

	it('does not let the room read decide a private secret', async () => {
		jest.spyOn(recordingService, 'getRecordingSecretGrant').mockResolvedValue({
			scope: 'private',
			download: true,
			recording
		});
		jest.spyOn(roomService, 'getMeetRoom').mockRejectedValue(errorRoomNotFound('room-1'));
		const res = mockResponse();

		await setup(requestWithSecret('secret'), res, jest.fn() as unknown as NextFunction);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.locals.recording).toEqual(recording);
	});

	it('refuses a play-only secret on a download before looking at the room', async () => {
		jest.spyOn(recordingService, 'getRecordingSecretGrant').mockResolvedValue({
			scope: 'public',
			download: false,
			recording
		});
		jest.spyOn(roomService, 'getMeetRoom').mockResolvedValue(anonymousRecording(false) as never);
		const res = mockResponse();

		await setupRecordingAuthentication('recordingDownload')(
			requestWithSecret('secret'),
			res,
			jest.fn() as unknown as NextFunction
		);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Authorization Error' }));
	});
});

describe('authorizeRecordingAccess', () => {
	it('hands the recording it read to the controller', async () => {
		const res = mockResponse();
		const next = jest.fn() as unknown as NextFunction;

		await authorizeRecordingAccess('recordingPlay', true)(requestWithSecret(), res, next);

		expect(recordingService.validateRecordingAccess).toHaveBeenCalledWith(RECORDING_ID, 'recordingPlay', [
			'roomId',
			'status',
			'filename'
		]);
		expect(res.locals.recording).toEqual({ roomId: 'room-1', ...recording });
		expect(next).toHaveBeenCalled();
	});

	it('reads nothing for a request a recording secret already authorized', async () => {
		const res = mockResponse();
		const next = jest.fn() as unknown as NextFunction;
		res.locals.recording = recording;

		await authorizeRecordingAccess('recordingPlay', true)(requestWithSecret('secret'), res, next);

		expect(recordingService.validateRecordingAccess).not.toHaveBeenCalled();
		expect(res.locals.recording).toEqual(recording);
		expect(next).toHaveBeenCalled();
	});
});
