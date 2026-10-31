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
	destination: { id: 'd1', name: 'YouTube', url: YOUTUBE },
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

	const extra = { name: 'Extra', url: 'rtmp://mtx/live/extraKEY' };

	it('streams to the room destinations named, as saved, and then to those given for this meeting', () => {
		expect(
			BroadcastHelper.resolveTargets(room, urls, [], { destinationIds: ['b'], destinations: [extra] })
		).toEqual([{ id: 'b', name: 'B', url: urls.b }, extra]);
	});

	it('streams to every room destination not streamed to yet when destinationIds is omitted', () => {
		expect(BroadcastHelper.resolveTargets(room, urls, [], {}).map(({ id }) => id)).toEqual(['a', 'b']);
		expect(
			BroadcastHelper.resolveTargets(room, urls, [record({ destination: { id: 'a', name: 'A', url: urls.a } })], {
				destinations: [extra]
			})
		).toEqual([{ id: 'b', name: 'B', url: urls.b }, extra]);
	});

	it('streams to no room destination when destinationIds is empty', () => {
		expect(BroadcastHelper.resolveTargets(room, urls, [], { destinationIds: [], destinations: [extra] })).toEqual([
			extra
		]);
	});

	it('rejects an id the room does not have with a 400, and a redacted URL, which has no stream key', () => {
		expectStatus(() => BroadcastHelper.resolveTargets(room, urls, [], { destinationIds: ['a', 'zzz'] }), 400);
		expectStatus(
			() =>
				BroadcastHelper.resolveTargets(room, urls, [], {
					destinations: [{ name: 'New', url: 'rtmp://mtx/live/********' }]
				}),
			422
		);
	});
});

describe('BroadcastHelper.validateNewBroadcasts', () => {
	const inProgress = (urls: string[]) =>
		urls.map((url, index) => record({ broadcastId: `bc-${index}`, destination: { name: url, url } }));
	const targets = (urls: string[]) => urls.map((url) => ({ name: url, url }));

	it('lets a meeting stream to any number of destinations at once, each once', () => {
		expect(() =>
			BroadcastHelper.validateNewBroadcasts(
				inProgress(['a', 'b', 'c', 'd', 'e', 'f']),
				targets(['rtmp://mtx/live/g', 'rtmp://mtx/live/h'])
			)
		).not.toThrow();
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

describe('BroadcastHelper.assertDestinationsAllowed', () => {
	const NAMES: Record<string, string[]> = {
		'egress.local': ['127.0.0.1'],
		'mapped.local': ['::ffff:169.254.169.254'],
		'mixed.example': ['203.0.113.10', '127.0.0.1'],
		'sink.lan': ['172.18.0.5'],
		'a.rtmp.youtube.com': ['142.250.200.12']
	};
	const resolve = async (host: string) => {
		if (!NAMES[host]) throw new Error(`getaddrinfo ENOTFOUND ${host}`);

		return NAMES[host].map((address) => ({ address }));
	};
	const verdict = async (url: string) =>
		BroadcastHelper.assertDestinationsAllowed([url], resolve).then(
			() => 'allowed',
			(error: OpenViduMeetError) => `${error.statusCode} ${error.message}`
		);

	it('refuses a host that is or resolves to a loopback, link-local, unspecified or multicast address', async () => {
		for (const url of [
			'rtmp://127.0.0.1:6379/live/key',
			'rtmp://[::1]:1935/live/key',
			'rtmp://169.254.169.254/live/key',
			'rtmp://0.0.0.0/live/key',
			'rtmp://[ff02::1]/live/key',
			'rtmp://egress.local/live/key',
			'rtmp://mapped.local/live/key',
			'rtmp://mixed.example/live/key'
		]) {
			expect([url, await verdict(url)]).toEqual([
				url,
				expect.stringMatching(/^422 Destination '.*\*{8}' is not allowed/)
			]);
		}
	});

	it('lets through a private network, a public host and a host that does not resolve', async () => {
		for (const url of [
			'rtmp://10.0.0.7/live/key',
			'rtmp://sink.lan:1935/live/key',
			'rtmps://a.rtmp.youtube.com/live2/key',
			'rtmp://nowhere.invalid/live/key'
		]) {
			expect([url, await verdict(url)]).toEqual([url, 'allowed']);
		}
	});

	it('never shows the stream key of a refused destination', async () => {
		expect(await verdict('rtmp://127.0.0.1/live/secret-key')).not.toContain('secret-key');
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

	it('rejects an unknown id, a new destination without its full URL, a repeated id and a repeated stream key', () => {
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
	});
});

describe('BroadcastHelper.taggedUrl', () => {
	it('tags the destination URL with the broadcast id, which names its room', () => {
		const broadcastId = BroadcastHelper.newBroadcastId('room-1');

		expect(broadcastId).toMatch(/^room-1--[0-9a-z]{10}$/);
		expect(BroadcastHelper.roomIdOf(broadcastId)).toBe('room-1');
		expect(BroadcastHelper.taggedUrl({ broadcastId, destination: { name: 'YouTube', url: YOUTUBE } })).toBe(
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
			destination: { name: 'Extra', url: 'rtmp://mtx/live/extraKEY' },
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
			destination: { id: 'd1', name: 'YouTube', url: REDACTED_YOUTUBE },
			layout: 'grid',
			encoding: 'H264_720P_30'
		});
		expect(
			BroadcastHelper.toBroadcastInfo(record({ destination: { name: 'Twitch', url: TWITCH } })).destination.url
		).toBe('rtmps://live.twitch.tv:443/app/********');
	});
});
