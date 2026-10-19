import { describe, expect, it } from '@jest/globals';
import type { EncodedFileOutput } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { errorRecordingStartRefused } from '../../../src/models/error.model.js';
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
