import { describe, expect, it } from '@jest/globals';
import type { StreamInfo } from '@livekit/protocol';
import { EgressStatus, StreamInfo_Status } from '@livekit/protocol';
import { MeetBroadcastStatus, MeetRecordingEncodingPreset, MeetRecordingLayout } from '@openvidu-meet/typings';
import type { EgressInfo } from 'livekit-server-sdk';
import { BroadcastHelper } from '../../../src/helpers/broadcast.helper.js';
import type { BroadcastRecord } from '../../../src/models/broadcast.model.js';
import { OpenViduMeetError } from '../../../src/models/error.model.js';

const YOUTUBE = 'rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl';
const TWITCH = 'rtmps://live.twitch.tv:443/app/live_123456_XyZ?bandwidthtest=true';
const REDACTED_YOUTUBE = 'rtmp://a.rtmp.youtube.com/live2/********';

const tagged = (broadcastId: string) => `rtmp://mtx/live/{abc...xyz}#ov-stream-tag=${broadcastId}`;

const stream = (overrides: Partial<StreamInfo>): StreamInfo =>
	({
		url: tagged('bc-1'),
		status: StreamInfo_Status.ACTIVE,
		startedAt: 0n,
		endedAt: 0n,
		duration: 0n,
		error: '',
		...overrides
	}) as StreamInfo;

const egress = (overrides: Partial<EgressInfo>): EgressInfo =>
	({
		egressId: 'EG_1',
		roomName: 'room-1',
		status: EgressStatus.EGRESS_ACTIVE,
		startedAt: 0n,
		endedAt: 0n,
		errorCode: 0,
		error: '',
		details: '',
		streamResults: [],
		fileResults: [],
		...overrides
	}) as unknown as EgressInfo;

const record = (overrides: Partial<BroadcastRecord> = {}): BroadcastRecord => ({
	broadcastId: 'bc-1',
	roomId: 'room-1',
	roomName: 'Room',
	status: MeetBroadcastStatus.STARTING,
	name: 'YouTube',
	url: YOUTUBE,
	destinationId: 'd1',
	layout: MeetRecordingLayout.GRID,
	encoding: MeetRecordingEncodingPreset.H264_720P_30,
	egressId: 'EG_1',
	...overrides
});

const expectStatus = (fn: () => unknown, statusCode: number) => {
	try {
		fn();
	} catch (error) {
		expect(error).toBeInstanceOf(OpenViduMeetError);
		expect((error as OpenViduMeetError).statusCode).toBe(statusCode);
		return;
	}

	throw new Error(`Expected a ${statusCode} error`);
};

describe('BroadcastHelper.redactRoomOptions', () => {
	it('redacts the destination URLs and leaves the rest of the options as they are', () => {
		const options = {
			roomName: 'Room',
			config: {
				chat: { enabled: true },
				broadcast: { enabled: true, destinations: [{ name: 'YouTube', url: YOUTUBE }] }
			}
		};

		expect(BroadcastHelper.redactRoomOptions(options)).toEqual({
			roomName: 'Room',
			config: {
				chat: { enabled: true },
				broadcast: { enabled: true, destinations: [{ name: 'YouTube', url: REDACTED_YOUTUBE }] }
			}
		});
		expect(options.config.broadcast.destinations[0].url).toBe(YOUTUBE);
		expect(BroadcastHelper.redactRoomOptions({ roomName: 'Room' })).toEqual({ roomName: 'Room' });
	});
});

describe('BroadcastHelper.resolveTargets', () => {
	const room = [
		{ id: 'a', name: 'A', url: 'rtmp://mtx/live/********' },
		{ id: 'b', name: 'B', url: 'rtmp://mtx/live/********' }
	];
	const urls = { a: 'rtmp://mtx/live/aaaKEYaaa', b: 'rtmp://mtx/live/bbbKEYbbb' };

	it('streams to the room destinations named, as saved, and to those given for this meeting', () => {
		expect(
			BroadcastHelper.resolveTargets(
				room,
				urls,
				[],
				[{ destinationId: 'b' }, { name: 'Extra', url: 'rtmp://mtx/live/extraKEY' }]
			)
		).toEqual([
			{ destinationId: 'b', name: 'B', url: urls.b },
			{ name: 'Extra', url: 'rtmp://mtx/live/extraKEY' }
		]);
	});

	it('streams to every room destination not streamed to yet when the request names none', () => {
		expect(
			BroadcastHelper.resolveTargets(room, urls, [], undefined).map(({ destinationId }) => destinationId)
		).toEqual(['a', 'b']);
		expect(
			BroadcastHelper.resolveTargets(room, urls, [record({ destinationId: 'a', url: urls.a })], undefined)
		).toEqual([{ destinationId: 'b', name: 'B', url: urls.b }]);
	});

	it('rejects an unknown room destination and a redacted URL, which has no stream key', () => {
		expectStatus(() => BroadcastHelper.resolveTargets(room, urls, [], [{ destinationId: 'zzz' }]), 422);
		expectStatus(
			() => BroadcastHelper.resolveTargets(room, urls, [], [{ name: 'New', url: 'rtmp://mtx/live/********' }]),
			422
		);
	});
});

describe('BroadcastHelper.validateNewBroadcasts', () => {
	const inProgress = (urls: string[]) => urls.map((url, index) => record({ broadcastId: `bc-${index}`, url }));
	const targets = (urls: string[]) => urls.map((url) => ({ name: url, url }));

	it('lets a meeting stream to five destinations at once, each once', () => {
		expect(() =>
			BroadcastHelper.validateNewBroadcasts(
				inProgress(['a', 'b', 'c']),
				targets(['rtmp://mtx/live/d', 'rtmp://mtx/live/e'])
			)
		).not.toThrow();
		expectStatus(
			() =>
				BroadcastHelper.validateNewBroadcasts(
					inProgress(['a', 'b', 'c', 'd']),
					targets(['rtmp://mtx/live/e', 'rtmp://mtx/live/f'])
				),
			422
		);
		expectStatus(
			() => BroadcastHelper.validateNewBroadcasts([], targets(['rtmp://mtx/live/a', 'rtmp://mtx/live/a'])),
			422
		);
		expectStatus(
			() =>
				BroadcastHelper.validateNewBroadcasts(
					inProgress(['rtmp://mtx/live/a']),
					targets(['rtmp://mtx/live/a'])
				),
			409
		);
	});

	it('streams each stream key once, the only thing the media server tells streams apart by', () => {
		expectStatus(
			() =>
				BroadcastHelper.validateNewBroadcasts(
					[],
					targets(['rtmp://one.example.com/live/same-key', 'rtmps://two.example.com/app/same-key live=1'])
				),
			422
		);
		expectStatus(
			() =>
				BroadcastHelper.validateNewBroadcasts(
					inProgress(['rtmp://one.example.com/live/same-key']),
					targets(['rtmp://two.example.com/live/same-key'])
				),
			409
		);
		expect(() =>
			BroadcastHelper.validateNewBroadcasts(
				inProgress(['rtmp://one.example.com/live/same-key']),
				targets(['rtmp://one.example.com/live/other-key'])
			)
		).not.toThrow();
	});
});

describe('BroadcastHelper.reconcileRoomDestinations', () => {
	const savedUrls = { a: 'rtmp://mtx/live/aaaKEYaaa', b: 'rtmp://mtx/live/bbbKEYbbb' };

	it('keeps the saved URL of a destination echoed back redacted, and replaces a full one', () => {
		const { destinations, urls } = BroadcastHelper.reconcileRoomDestinations(savedUrls, [
			{ id: 'a', name: 'A renamed', url: 'rtmp://mtx/live/********' },
			{ id: 'b', name: 'B', url: 'rtmp://mtx/live/bbbNEWbbb' }
		]);

		expect(urls).toEqual({ a: savedUrls.a, b: 'rtmp://mtx/live/bbbNEWbbb' });
		expect(destinations).toEqual([
			{ id: 'a', name: 'A renamed', url: 'rtmp://mtx/live/********' },
			{ id: 'b', name: 'B', url: 'rtmp://mtx/live/********' }
		]);
	});

	it('rejects a redacted URL echoed back with another host or path, which has no stream key to keep', () => {
		for (const url of [
			'rtmp://other/live/********',
			'rtmp://mtx/other-app/********',
			'rtmps://mtx/live/********'
		]) {
			expectStatus(
				() => BroadcastHelper.reconcileRoomDestinations(savedUrls, [{ id: 'a', name: 'A', url }]),
				422
			);
		}
	});

	it('assigns an id to a new destination and drops the ones left out', () => {
		const { destinations, urls } = BroadcastHelper.reconcileRoomDestinations(savedUrls, [
			{ name: 'C', url: 'rtmp://mtx/live/cccKEYccc' }
		]);

		expect(destinations).toHaveLength(1);
		expect(destinations[0].id).toEqual(expect.any(String));
		expect(urls).toEqual({ [destinations[0].id!]: 'rtmp://mtx/live/cccKEYccc' });
	});

	it('rejects an unknown id, a new destination without its full URL, a repeated id, a repeated stream key and the cap', () => {
		expectStatus(
			() =>
				BroadcastHelper.reconcileRoomDestinations(savedUrls, [
					{ id: 'zzz', name: 'Z', url: 'rtmp://mtx/live/z' }
				]),
			422
		);
		expectStatus(
			() =>
				BroadcastHelper.reconcileRoomDestinations(savedUrls, [
					{ name: 'New', url: 'rtmp://mtx/live/********' }
				]),
			422
		);
		expectStatus(
			() =>
				BroadcastHelper.reconcileRoomDestinations(savedUrls, [
					{ id: 'a', name: 'A', url: 'rtmp://mtx/live/********' },
					{ id: 'a', name: 'A again', url: 'rtmp://mtx/live/********' }
				]),
			422
		);
		expectStatus(
			() =>
				BroadcastHelper.reconcileRoomDestinations(savedUrls, [
					{ id: 'a', name: 'A', url: 'rtmp://mtx/live/********' },
					{ name: 'Same URL as A', url: savedUrls.a }
				]),
			422
		);
		expectStatus(
			() =>
				BroadcastHelper.reconcileRoomDestinations(savedUrls, [
					{ id: 'a', name: 'A', url: 'rtmp://mtx/live/********' },
					{ name: 'Key of A elsewhere', url: 'rtmp://other.example.com/app/aaaKEYaaa' }
				]),
			422
		);
		expectStatus(
			() =>
				BroadcastHelper.reconcileRoomDestinations(
					{},
					['c', 'd', 'e', 'f', 'g', 'h'].map((key) => ({ name: key, url: `rtmp://mtx/live/${key}` }))
				),
			422
		);
	});
});

describe('BroadcastHelper.taggedUrl', () => {
	it('tags the destination URL with the broadcast id, which names its room', () => {
		const broadcastId = BroadcastHelper.newBroadcastId('room-1');

		expect(broadcastId).toMatch(/^room-1--[0-9a-z]{10}$/);
		expect(BroadcastHelper.roomIdOf(broadcastId)).toBe('room-1');
		expect(BroadcastHelper.taggedUrl({ broadcastId, url: YOUTUBE })).toBe(
			`${YOUTUBE}#ov-stream-tag=${broadcastId}`
		);
	});
});

describe('BroadcastHelper.createRecord', () => {
	const room = { roomId: 'room-1', roomName: 'Room' };
	const target = { name: 'Extra', url: 'rtmp://mtx/live/extraKEY' };
	const settings = { layout: MeetRecordingLayout.SPEAKER, encoding: MeetRecordingEncodingPreset.H264_1080P_30 };

	it('takes the stream the egress reports under the broadcast tag, not the others of the egress', () => {
		const created = BroadcastHelper.createRecord(
			'room-1--extra',
			egress({
				egressId: 'EG_2',
				streamResults: [stream({ url: tagged('room-1--extra') }), stream({ startedAt: 1_000_000_000n })]
			}),
			room,
			target,
			settings
		);

		expect(created).toEqual({
			broadcastId: 'room-1--extra',
			roomId: 'room-1',
			roomName: 'Room',
			status: MeetBroadcastStatus.STARTING,
			name: 'Extra',
			url: 'rtmp://mtx/live/extraKEY',
			destinationId: undefined,
			layout: MeetRecordingLayout.SPEAKER,
			encoding: MeetRecordingEncodingPreset.H264_1080P_30,
			egressId: 'EG_2',
			startDate: undefined,
			endDate: undefined,
			duration: undefined,
			error: undefined
		});
	});

	it('refuses an egress that does not report the tag, which could never tell the broadcast how it goes', () => {
		const untagged = egress({ streamResults: [stream({ url: 'rtmp://mtx/live/{ext...EY}' })] });

		expectStatus(() => BroadcastHelper.createRecord('room-1--extra', untagged, room, target, settings), 500);
	});
});

describe('BroadcastHelper.withEgressInfo', () => {
	it('reads its own stream by its tag, wherever LiveKit lists it and whatever the others say', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record(),
			egress({
				streamResults: [
					stream({ startedAt: 2_000_000_000n }),
					stream({ url: tagged('bc-2'), status: StreamInfo_Status.FAILED, error: 'Failed to connect' })
				]
			})
		);
		const reordered = BroadcastHelper.withEgressInfo(
			record({ broadcastId: 'bc-2' }),
			egress({ streamResults: [stream({ url: tagged('bc-3') }), stream({ url: tagged('bc-2') })] })
		);

		expect(updated).toMatchObject({ status: 'active', startDate: 2000, error: undefined });
		expect(reordered).toMatchObject({ status: 'starting', startDate: undefined });
	});

	it('tells a destination streamed to again from its earlier broadcast, though both have the same URL', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record({ broadcastId: 'bc-again' }),
			egress({
				streamResults: [
					stream({ status: StreamInfo_Status.FINISHED, startedAt: 1_000_000_000n, endedAt: 9_000_000_000n }),
					stream({ url: tagged('bc-again') })
				]
			})
		);

		expect(updated).toMatchObject({ status: 'starting', startDate: undefined, endDate: undefined });
	});

	it('never moves back when a snapshot is older than what it already knows', () => {
		const ending = record({ status: MeetBroadcastStatus.ENDING, startDate: 1000 });

		expect(
			BroadcastHelper.withEgressInfo(ending, egress({ streamResults: [stream({ startedAt: 1_000_000_000n })] }))
		).toEqual(ending);
	});

	it('keeps the broadcast starting while LiveKit reports the egress active but no media has reached the destination', () => {
		const connecting = BroadcastHelper.withEgressInfo(record(), egress({ streamResults: [stream({})] }));
		const live = BroadcastHelper.withEgressInfo(
			connecting,
			egress({ streamResults: [stream({ startedAt: 2_000_000_000n })] })
		);

		expect(connecting).toMatchObject({ status: 'starting', startDate: undefined });
		expect(live).toMatchObject({ status: 'active', startDate: 2000 });
	});

	it('keeps a start it already knows when a snapshot of its stream carries none', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record({ status: MeetBroadcastStatus.ACTIVE, startDate: 10_000 }),
			egress({ streamResults: [stream({})] })
		);

		expect(updated).toMatchObject({ status: 'active', startDate: 10_000 });
	});

	it('leaves the record as it is when a snapshot does not carry its stream yet', () => {
		const current = record({ status: MeetBroadcastStatus.ACTIVE, startDate: 10_000 });

		expect(
			BroadcastHelper.withEgressInfo(current, egress({ streamResults: [stream({ url: tagged('bc-other') })] }))
		).toEqual(current);
	});

	it('fails with its stream, undated when no media ever reached the destination', () => {
		// Egress stamps a stream that never connects with its end time as start time.
		const updated = BroadcastHelper.withEgressInfo(
			record(),
			egress({
				streamResults: [
					stream({
						status: StreamInfo_Status.FAILED,
						error: 'Connection refused',
						startedAt: 1_000_000_000n,
						endedAt: 1_000_000_000n
					})
				]
			})
		);

		expect(updated).toMatchObject({
			status: 'failed',
			error: 'Connection refused',
			startDate: undefined,
			endDate: undefined,
			duration: undefined
		});
	});

	it('completes with its stream, dated and measured in seconds, while the egress goes on for the others', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record({ status: MeetBroadcastStatus.ACTIVE, startDate: 1000 }),
			egress({
				streamResults: [
					stream({
						status: StreamInfo_Status.FINISHED,
						startedAt: 1_000_000_000n,
						endedAt: 61_000_000_000n,
						duration: 60_000_000_000n
					}),
					stream({ url: tagged('bc-2'), startedAt: 5_000_000_000n })
				]
			})
		);

		expect(updated).toMatchObject({ status: 'complete', startDate: 1000, endDate: 61_000, duration: 60 });
	});

	it('is aborted when its stream finished before any media reached the destination', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record(),
			egress({
				streamResults: [
					stream({ status: StreamInfo_Status.FINISHED, startedAt: 3_000_000_000n, endedAt: 3_000_000_000n })
				]
			})
		);

		expect(updated).toMatchObject({ status: 'aborted', startDate: undefined, endDate: undefined });
	});

	it('is ending while its stream is open and the egress is ending', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record({ status: MeetBroadcastStatus.ACTIVE, startDate: 1000 }),
			egress({ status: EgressStatus.EGRESS_ENDING, streamResults: [stream({ startedAt: 1_000_000_000n })] })
		);

		expect(updated.status).toBe(MeetBroadcastStatus.ENDING);
	});

	it('ends with the egress when its stream was still open, dated by the egress end', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record({ status: MeetBroadcastStatus.ACTIVE, startDate: 1000 }),
			egress({
				status: EgressStatus.EGRESS_COMPLETE,
				endedAt: 61_000_000_000n,
				details: 'Stopped using API',
				streamResults: [stream({ startedAt: 1_000_000_000n })]
			})
		);

		expect(updated).toMatchObject({
			status: 'complete',
			startDate: 1000,
			endDate: 61_000,
			duration: 60,
			details: 'Stopped using API'
		});
	});

	it('carries the egress error when the egress failed with its stream still open, and is aborted when it never streamed', () => {
		const failed = BroadcastHelper.withEgressInfo(
			record({ status: MeetBroadcastStatus.ACTIVE, startDate: 1000 }),
			egress({
				status: EgressStatus.EGRESS_FAILED,
				endedAt: 6_000_000_000n,
				errorCode: 500,
				error: 'boom',
				streamResults: [stream({ startedAt: 1_000_000_000n })]
			})
		);
		const aborted = BroadcastHelper.withEgressInfo(
			record(),
			egress({ status: EgressStatus.EGRESS_COMPLETE, endedAt: 6_000_000_000n, streamResults: [stream({})] })
		);

		expect(failed).toMatchObject({ status: 'failed', errorCode: 500, error: 'boom', endDate: 6000, duration: 5 });
		expect(aborted).toMatchObject({ status: 'aborted', startDate: undefined, endDate: undefined });
	});

	it('leaves a broadcast its stream already ended alone when the egress ends later', () => {
		const ended = record({
			status: MeetBroadcastStatus.FAILED,
			error: 'Connection refused'
		});
		const updated = BroadcastHelper.withEgressInfo(
			ended,
			egress({
				status: EgressStatus.EGRESS_COMPLETE,
				endedAt: 61_000_000_000n,
				streamResults: [
					stream({
						status: StreamInfo_Status.FAILED,
						error: 'Connection refused',
						startedAt: 1_000_000_000n,
						endedAt: 1_000_000_000n
					})
				]
			})
		);

		expect(updated).toMatchObject({ status: 'failed', error: 'Connection refused', endDate: undefined });
	});
});

describe('BroadcastHelper.withEnded', () => {
	it('completes a live broadcast at the given instant', () => {
		const ended = BroadcastHelper.withEnded(
			record({ status: MeetBroadcastStatus.ACTIVE, startDate: 10_000 }),
			70_000
		);

		expect(ended).toMatchObject({ status: 'complete', endDate: 70_000, duration: 60 });
	});

	it('keeps the ending a broadcast already has, dating a failure that had streamed', () => {
		expect(
			BroadcastHelper.withEnded(record({ status: MeetBroadcastStatus.ABORTED, startDate: 10_000 }), 70_000)
		).toMatchObject({ status: 'aborted', startDate: undefined, endDate: undefined });
		expect(
			BroadcastHelper.withEnded(record({ status: MeetBroadcastStatus.FAILED, startDate: 10_000 }), 70_000)
		).toMatchObject({ status: 'failed', startDate: 10_000, endDate: 70_000, duration: 60 });
	});

	it('reports a broadcast that never streamed as aborted, with no end date nor duration', () => {
		expect(BroadcastHelper.withEnded(record(), 70_000)).toMatchObject({
			status: 'aborted',
			endDate: undefined,
			duration: undefined
		});
	});
});

describe('BroadcastHelper.toBroadcastInfo', () => {
	it('redacts the URL and keeps where the broadcast runs to the server', () => {
		expect(BroadcastHelper.toBroadcastInfo(record())).toEqual({
			broadcastId: 'bc-1',
			roomId: 'room-1',
			roomName: 'Room',
			status: 'starting',
			name: 'YouTube',
			url: REDACTED_YOUTUBE,
			destinationId: 'd1',
			layout: 'grid',
			encoding: 'H264_720P_30'
		});
		expect(BroadcastHelper.toBroadcastInfo(record({ url: TWITCH })).url).toBe(
			'rtmps://live.twitch.tv:443/app/********'
		);
	});
});
