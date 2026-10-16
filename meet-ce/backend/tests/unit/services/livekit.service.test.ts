import { describe, expect, it } from '@jest/globals';
import type { EgressInfo, StreamOutput } from 'livekit-server-sdk';
import '../../../src/config/dependency-injector.config.js';
import type { OpenViduMeetError } from '../../../src/models/error.model.js';
import { LiveKitService } from '../../../src/services/livekit.service.js';
import type { LoggerService } from '../../../src/services/logger.service.js';

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} };
const egress = { egressId: 'EG_1' } as EgressInfo;
const twirp = (status: number) => Object.assign(new Error(`twirp error ${status}`), { status, code: 'unknown' });
const timeout = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');

/** A LiveKitService whose egress client answers every call with the egress, or fails with the given error. */
const answering = (failure?: unknown) => {
	const service = new LiveKitService(logger as unknown as LoggerService);
	const answer = async () => {
		if (failure) throw failure;

		return egress;
	};
	(service as unknown as { lk: unknown }).lk = {
		egress: { updateStream: answer, startRoomCompositeEgress: answer }
	};
	return service;
};

const outcome = (call: Promise<unknown>) =>
	call.then(
		(value) => value ?? 'nothing',
		(error: OpenViduMeetError) => `${error.statusCode} ${error.message}`
	);

/**
 * LiveKit answers 503 when no egress service takes a call to an egress, and for a start only after
 * this client gave up waiting; an egress that ended answers 404 or 412. What Meet answers its own
 * callers, and whether it takes an egress for lost, rests on telling those apart.
 */
describe('LiveKitService calls to an egress', () => {
	it('answers 503 for a start no egress service takes, whether LiveKit says so or the call times out', async () => {
		const start = (failure?: unknown) =>
			outcome(answering(failure).startRoomComposite('room-1', {} as StreamOutput, {}));

		expect(await start()).toBe(egress);
		expect(await start(twirp(503))).toBe('503 No egress service is available');
		expect(await start(timeout())).toBe('503 No egress service is available');
		expect(await start(twirp(500))).toMatch(/^500 /);
	});

	it('takes an update of an egress that already ended as nothing to update, and maps no egress service to 503', async () => {
		const update = (failure?: unknown) => outcome(answering(failure).updateStream('EG_1', ['url'], []));

		expect(await update()).toBe(egress);
		expect(await update(twirp(404))).toBe('nothing');
		expect(await update(twirp(412))).toBe('nothing');
		expect(await update(twirp(503))).toBe('503 No egress service is available');
		expect(await update(timeout())).toBe('503 No egress service is available');
		expect(await update(twirp(500))).toMatch(/^500 /);
	});

	it('takes an egress for lost only when no egress service answers for it', async () => {
		const reachable = (failure?: unknown) => answering(failure).isEgressReachable('EG_1');

		expect(await reachable()).toBe(true);
		expect(await reachable(twirp(400))).toBe(true);
		expect(await reachable(twirp(404))).toBe(true);
		expect(await reachable(twirp(412))).toBe(true);
		expect(await reachable(twirp(503))).toBe(false);
	});
});
