import { describe, expect, it, jest } from '@jest/globals';
import type { EncodedFileOutput } from 'livekit-server-sdk';
import { TwirpError } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { errorLivekitNotAvailable, errorRecordingStartRefused } from '../../../src/models/error.model.js';
import { LiveKitService } from '../../../src/services/livekit.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

const buildService = (startRoomCompositeEgress: () => Promise<unknown>): LiveKitService => {
	const service = Object.create(LiveKitService.prototype) as LiveKitService;
	Object.assign(service as object, { lk: { egress: { startRoomCompositeEgress } }, logger: noopLogger });
	return service;
};

describe('LiveKitService.startRoomComposite', () => {
	const output = {} as EncodedFileOutput;

	it('answers 503 when the media server refuses the recording', async () => {
		const service = buildService(() => Promise.reject(new Error('no response from servers')));

		await expect(service.startRoomComposite('room-1', output, {})).rejects.toMatchObject({
			statusCode: 503,
			message: errorRecordingStartRefused('room-1').message
		});
	});

	it('returns the egress the media server accepted', async () => {
		const egress = { egressId: 'EG_1' };
		const service = buildService(() => Promise.resolve(egress));

		await expect(service.startRoomComposite('room-1', output, {})).resolves.toBe(egress);
	});
});

describe('LiveKitService.sendData', () => {
	const buildSendingService = (sendData: () => Promise<void>) => {
		const listRooms = jest.fn(async () => []);
		const service = Object.create(LiveKitService.prototype) as LiveKitService;
		Object.assign(service as object, { lk: { room: { sendData, listRooms } }, logger: noopLogger });
		return { service, listRooms };
	};

	it('sends without asking first whether the room exists', async () => {
		const { service, listRooms } = buildSendingService(() => Promise.resolve());

		await service.sendData('room-1', { a: 1 }, { topic: 't' });

		expect(listRooms).not.toHaveBeenCalled();
	});

	it('skips a room the media server does not have', async () => {
		const { service } = buildSendingService(() =>
			Promise.reject(new TwirpError('not_found', 'requested room does not exist', 404, 'not_found'))
		);

		await expect(service.sendData('room-1', { a: 1 }, { topic: 't' })).resolves.toBeUndefined();
	});

	it('answers 500 when the media server fails for any other reason', async () => {
		const { service } = buildSendingService(() => Promise.reject(new Error('no response from servers')));

		await expect(service.sendData('room-1', { a: 1 }, { topic: 't' })).rejects.toMatchObject({ statusCode: 500 });
	});
});

describe('LiveKitService.roomHasParticipants', () => {
	const buildListingService = (listParticipants: () => Promise<unknown[]>) => {
		const service = Object.create(LiveKitService.prototype) as LiveKitService;
		Object.assign(service as object, { lk: { room: { listParticipants } }, logger: noopLogger });
		return service;
	};

	it('tells whether the room has someone connected', async () => {
		await expect(buildListingService(() => Promise.resolve([{}])).roomHasParticipants('room-1')).resolves.toBe(
			true
		);
		await expect(buildListingService(() => Promise.resolve([])).roomHasParticipants('room-1')).resolves.toBe(false);
	});

	it('reports no participants for a room the media server does not have', async () => {
		const service = buildListingService(() =>
			Promise.reject(new TwirpError('not_found', 'requested room does not exist', 404, 'not_found'))
		);

		await expect(service.roomHasParticipants('room-1')).resolves.toBe(false);
	});

	it('answers 503 when the media server cannot be reached', async () => {
		const service = buildListingService(() =>
			Promise.reject(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }))
		);

		await expect(service.roomHasParticipants('room-1')).rejects.toMatchObject({
			statusCode: 503,
			message: errorLivekitNotAvailable().message
		});
	});
});
