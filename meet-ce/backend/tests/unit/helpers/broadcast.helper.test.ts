import { describe, expect, it } from '@jest/globals';
import type { StreamInfo } from '@livekit/protocol';
import { EgressStatus, StreamInfo_Status } from '@livekit/protocol';
import type { MeetBroadcastDestinationInfo } from '@openvidu-meet/typings';
import {
	MeetBroadcastDestinationSource,
	MeetBroadcastDestinationStatus,
	MeetBroadcastStatus,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout
} from '@openvidu-meet/typings';
import type { EgressInfo } from 'livekit-server-sdk';
import { BroadcastHelper } from '../../../src/helpers/broadcast.helper.js';
import type { BroadcastRecord } from '../../../src/models/broadcast.model.js';
import { OpenViduMeetError } from '../../../src/models/error.model.js';

const YOUTUBE = 'rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl';
const TWITCH = 'rtmps://live.twitch.tv:443/app/live_123456_XyZ?bandwidthtest=true';
const REDACTED_YOUTUBE = 'rtmp://a.rtmp.youtube.com/live2/********';

const stream = (overrides: Partial<StreamInfo>): StreamInfo =>
	({
		url: '',
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
		status: EgressStatus.EGRESS_STARTING,
		startedAt: 0n,
		endedAt: 0n,
		errorCode: 0,
		error: '',
		details: '',
		streamResults: [],
		fileResults: [],
		...overrides
	}) as unknown as EgressInfo;

const destination = (overrides: Partial<MeetBroadcastDestinationInfo>): MeetBroadcastDestinationInfo => ({
	id: 'd1',
	name: 'YouTube',
	url: YOUTUBE,
	source: MeetBroadcastDestinationSource.ROOM,
	status: MeetBroadcastDestinationStatus.CONNECTING,
	...overrides
});

const record = (
	destinations: MeetBroadcastDestinationInfo[],
	overrides: Partial<BroadcastRecord> = {}
): BroadcastRecord => ({
	broadcastId: 'EG_1',
	roomId: 'room-1',
	roomName: 'Room',
	status: MeetBroadcastStatus.STARTING,
	layout: MeetRecordingLayout.GRID,
	encoding: MeetRecordingEncodingPreset.H264_720P_30,
	destinations,
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

describe('BroadcastHelper.matchesReportedStreamUrl', () => {
	// The shapes LiveKit egress was observed to report for these inputs.
	it('matches the URL egress reports, key redacted to its first and last three characters', () => {
		expect(
			BroadcastHelper.matchesReportedStreamUrl(
				'rtmp://mtx:1935/live/youtube-KEY-AAAAAAAA',
				'rtmp://mtx:1935/live/{you...AAA}'
			)
		).toBe(true);
	});

	it('treats the query string as part of the key, like egress does', () => {
		expect(
			BroadcastHelper.matchesReportedStreamUrl(
				'rtmp://mtx:1935/live/twitch-KEY-BBBBBBBB?param=secretvalue',
				'rtmp://mtx:1935/live/{twi...lue}'
			)
		).toBe(true);
	});

	it('matches a short key, of which egress shows a third at each end, and an unredacted echo', () => {
		const reported = (key: string, shape: string) =>
			BroadcastHelper.matchesReportedStreamUrl(`rtmp://mtx:1935/live/${key}`, `rtmp://mtx:1935/live/${shape}`);

		expect(reported('ab', '{...}')).toBe(true);
		expect(reported('test', '{t...t}')).toBe(true);
		expect(reported('k?x=1', '{k...1}')).toBe(true);
		expect(reported('abcdef', '{ab...ef}')).toBe(true);
		expect(reported('abcdefgh', '{ab...gh}')).toBe(true);
		expect(reported('abcdefghi', '{abc...ghi}')).toBe(true);
		expect(BroadcastHelper.matchesReportedStreamUrl(YOUTUBE, YOUTUBE)).toBe(true);
	});

	it('does not match a stream whose key egress shows differently, short or not', () => {
		const reported = (key: string, shape: string) =>
			BroadcastHelper.matchesReportedStreamUrl(`rtmp://mtx:1935/live/${key}`, `rtmp://mtx:1935/live/${shape}`);

		expect(reported('test', '{...}')).toBe(false);
		expect(reported('test', '{tes...est}')).toBe(false);
		expect(reported('ab', '{a...b}')).toBe(false);
	});

	it('does not match another destination on the same host', () => {
		expect(
			BroadcastHelper.matchesReportedStreamUrl(
				'rtmp://mtx:1935/live/youtube-KEY-AAAAAAAA',
				'rtmp://mtx:1935/live/{fac...DDD}'
			)
		).toBe(false);
		expect(
			BroadcastHelper.matchesReportedStreamUrl(
				'rtmp://mtx:1935/live/youtube-KEY-AAAAAAAA',
				'rtmp://other/live/{you...AAA}'
			)
		).toBe(false);
	});
});

describe('BroadcastHelper.resolveStartDestinations', () => {
	const room = [
		{ id: 'a', name: 'A', url: 'rtmp://mtx/live/********' },
		{ id: 'b', name: 'B', url: 'rtmp://mtx/live/********' }
	];
	const urls = { a: 'rtmp://mtx/live/aaaKEYaaa', b: 'rtmp://mtx/live/bbbKEYbbb' };

	it('streams to every room destination when the request names none', () => {
		const destinations = BroadcastHelper.resolveStartDestinations(room, urls, undefined);

		expect(destinations).toEqual([
			{ id: 'a', name: 'A', url: urls.a, source: 'room', status: 'connecting' },
			{ id: 'b', name: 'B', url: urls.b, source: 'room', status: 'connecting' }
		]);
	});

	it('keeps the room destinations left out as stopped, so they can be started later', () => {
		const destinations = BroadcastHelper.resolveStartDestinations(room, urls, [{ id: 'b' }]);

		expect(destinations.map(({ id, status }) => `${id}:${status}`)).toEqual(['a:stopped', 'b:connecting']);
	});

	it('changes a room destination for this meeting only, and marks it as edited', () => {
		const [edited] = BroadcastHelper.resolveStartDestinations(room, urls, [
			{ id: 'a', name: 'Client channel', url: 'rtmp://mtx/live/clientKEY' }
		]);

		expect(edited).toEqual({
			id: 'a',
			name: 'Client channel',
			url: 'rtmp://mtx/live/clientKEY',
			source: 'room',
			status: 'connecting',
			edited: true
		});
	});

	it('does not count a redacted URL or the saved name as an edit', () => {
		const [unchanged] = BroadcastHelper.resolveStartDestinations(room, urls, [
			{ id: 'a', name: 'A', url: 'rtmp://mtx/live/********' }
		]);

		expect(unchanged.url).toBe(urls.a);
		expect(unchanged.edited).toBeUndefined();
	});

	it('rejects a redacted URL that is not the one the destination was served with', () => {
		expectStatus(
			() =>
				BroadcastHelper.resolveStartDestinations(room, urls, [
					{ id: 'a', url: 'rtmp://other-server/live/********' }
				]),
			422
		);
	});

	it('adds a destination for this meeting', () => {
		const destinations = BroadcastHelper.resolveStartDestinations(room, urls, [
			{ id: 'a' },
			{ name: 'Extra', url: 'rtmp://mtx/live/extraKEY' }
		]);

		expect(destinations[2]).toEqual({
			id: expect.any(String),
			name: 'Extra',
			url: 'rtmp://mtx/live/extraKEY',
			source: 'meeting',
			status: 'connecting'
		});
	});

	it('rejects an unknown room destination, a redacted URL for a new one, duplicates and the cap', () => {
		expectStatus(() => BroadcastHelper.resolveStartDestinations(room, urls, [{ id: 'zzz' }]), 422);
		expectStatus(
			() =>
				BroadcastHelper.resolveStartDestinations(room, urls, [
					{ name: 'New', url: 'rtmp://mtx/live/********' }
				]),
			422
		);
		expectStatus(
			() => BroadcastHelper.resolveStartDestinations(room, urls, [{ name: 'Same as A', url: urls.a }]),
			422
		);
		expectStatus(
			() =>
				BroadcastHelper.resolveStartDestinations(
					room,
					urls,
					['c', 'd', 'e', 'f'].map((key) => ({ name: key, url: `rtmp://mtx/live/${key}` }))
				),
			422
		);
	});

	it('needs at least one destination to stream to', () => {
		expectStatus(() => BroadcastHelper.resolveStartDestinations([], {}, undefined), 422);
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

	it('rejects an unknown id, a new destination without its full URL, a repeated id and a repeated URL', () => {
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
	});
});

describe('BroadcastHelper.withEgressInfo', () => {
	it('keeps a start date it already knows when a snapshot carries none', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record([destination({})], { status: MeetBroadcastStatus.ACTIVE, startDate: 10_000 }),
			egress({ status: EgressStatus.EGRESS_ENDING })
		);

		expect(updated.startDate).toBe(10_000);
	});

	const yt = destination({ id: 'yt', url: 'rtmp://mtx/live/youtube-KEY-AAAAAAAA' });
	const tw = destination({ id: 'tw', name: 'Twitch', url: 'rtmp://mtx/live/twitch-KEY-BBBBBBBB' });

	it('maps each stream to its destination whatever order egress lists them in', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record([yt, tw]),
			egress({
				status: EgressStatus.EGRESS_ACTIVE,
				streamResults: [
					stream({ url: 'rtmp://mtx/live/{twi...BBB}', startedAt: 2_000_000_000n }),
					stream({
						url: 'rtmp://mtx/live/{you...AAA}',
						status: StreamInfo_Status.FAILED,
						error: 'Failed to connect',
						startedAt: 1_000_000_000n,
						endedAt: 1_000_000_000n
					})
				]
			})
		);

		expect(updated.status).toBe(MeetBroadcastStatus.ACTIVE);
		expect(updated.destinations[0]).toMatchObject({ id: 'yt', status: 'failed', error: 'Failed to connect' });
		expect(updated.destinations[1]).toMatchObject({
			id: 'tw',
			status: 'active',
			startDate: 2000,
			error: undefined
		});
	});

	it('keeps the broadcast starting while LiveKit reports the egress active but no destination has media', () => {
		const connecting = BroadcastHelper.withEgressInfo(
			record([yt]),
			egress({
				status: EgressStatus.EGRESS_ACTIVE,
				streamResults: [stream({ url: 'rtmp://mtx/live/{you...AAA}' })]
			})
		);
		const live = BroadcastHelper.withEgressInfo(
			connecting,
			egress({
				status: EgressStatus.EGRESS_ACTIVE,
				streamResults: [stream({ url: 'rtmp://mtx/live/{you...AAA}', startedAt: 2_000_000_000n })]
			})
		);

		expect(connecting).toMatchObject({ status: 'starting', startDate: undefined });
		expect(live).toMatchObject({ status: 'active', startDate: 2000 });
	});

	it('reports a stream that egress lists but has not started yet as connecting', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record([yt]),
			egress({ streamResults: [stream({ url: 'rtmp://mtx/live/{you...AAA}' })] })
		);

		expect(updated.destinations[0].status).toBe(MeetBroadcastDestinationStatus.CONNECTING);
		expect(updated.startDate).toBeUndefined();
	});

	it('takes the earliest stream start as the broadcast start, never the egress request time', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record([yt, tw]),
			egress({
				status: EgressStatus.EGRESS_ACTIVE,
				startedAt: 500_000_000n,
				streamResults: [
					stream({ url: 'rtmp://mtx/live/{you...AAA}', startedAt: 3_000_000_000n }),
					stream({ url: 'rtmp://mtx/live/{twi...BBB}', startedAt: 2_000_000_000n })
				]
			})
		);

		expect(updated.startDate).toBe(2000);
	});

	it('follows the latest attempt when a destination was re-added, and converts durations to seconds', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record([yt]),
			egress({
				status: EgressStatus.EGRESS_ACTIVE,
				streamResults: [
					stream({
						url: 'rtmp://mtx/live/{you...AAA}',
						status: StreamInfo_Status.FINISHED,
						startedAt: 1_000_000_000n,
						endedAt: 21_000_000_000n,
						duration: 20_000_000_000n
					}),
					stream({ url: 'rtmp://mtx/live/{you...AAA}', startedAt: 30_000_000_000n })
				]
			})
		);

		expect(updated.destinations[0]).toMatchObject({ status: 'active', startDate: 30_000, endDate: undefined });
	});

	it('keeps a destination that was never streamed to as the server left it', () => {
		const stopped = destination({ id: 'tw', url: tw.url, status: MeetBroadcastDestinationStatus.STOPPED });
		const updated = BroadcastHelper.withEgressInfo(
			record([yt, stopped]),
			egress({ streamResults: [stream({ url: 'rtmp://mtx/live/{you...AAA}', startedAt: 1_000_000_000n })] })
		);

		expect(updated.destinations[1]).toEqual(stopped);
	});

	it('does not revive a destination that ended when a webhook carries an older snapshot of it', () => {
		const ended = destination({
			id: 'yt',
			url: yt.url,
			status: MeetBroadcastDestinationStatus.STOPPED,
			startDate: 1000,
			endDate: 5000
		});
		const updated = BroadcastHelper.withEgressInfo(
			record([ended], { status: MeetBroadcastStatus.ENDING }),
			egress({
				status: EgressStatus.EGRESS_ENDING,
				streamResults: [stream({ url: 'rtmp://mtx/live/{you...AAA}', startedAt: 1_000_000_000n })]
			})
		);

		expect(updated.destinations[0].status).toBe(MeetBroadcastDestinationStatus.STOPPED);
	});

	it('settles the final state from a finished egress', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record([yt], { status: MeetBroadcastStatus.ACTIVE }),
			egress({
				status: EgressStatus.EGRESS_COMPLETE,
				endedAt: 61_000_000_000n,
				streamResults: [
					stream({
						url: 'rtmp://mtx/live/{you...AAA}',
						status: StreamInfo_Status.FINISHED,
						startedAt: 1_000_000_000n,
						endedAt: 61_000_000_000n,
						duration: 60_000_000_000n
					})
				]
			})
		);

		expect(updated).toMatchObject({ status: 'complete', startDate: 1000, endDate: 61_000, duration: 60 });
		expect(updated.destinations[0]).toMatchObject({ status: 'stopped', duration: 60 });
	});

	it('stops a destination still connecting when the egress ended, and leaves a failed one failed', () => {
		const failed = destination({ id: 'tw', url: tw.url, status: MeetBroadcastDestinationStatus.FAILED });
		const updated = BroadcastHelper.withEgressInfo(
			record([yt, failed], { status: MeetBroadcastStatus.ENDING }),
			egress({
				status: EgressStatus.EGRESS_COMPLETE,
				endedAt: 61_000_000_000n,
				streamResults: [stream({ url: 'rtmp://mtx/live/{you...AAA}' })]
			})
		);

		expect(updated.destinations[0]).toMatchObject({ status: 'stopped', endDate: 61_000 });
		expect(updated.destinations[1]).toEqual(failed);
	});

	it('leaves a destination connecting while the egress is only ending', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record([yt], { status: MeetBroadcastStatus.ACTIVE }),
			egress({
				status: EgressStatus.EGRESS_ENDING,
				streamResults: [stream({ url: 'rtmp://mtx/live/{you...AAA}' })]
			})
		);

		expect(updated.destinations[0].status).toBe(MeetBroadcastDestinationStatus.CONNECTING);
	});

	it('carries the egress error of a failed broadcast', () => {
		const updated = BroadcastHelper.withEgressInfo(
			record([yt]),
			egress({ status: EgressStatus.EGRESS_FAILED, errorCode: 500, error: 'boom', details: 'more' })
		);

		expect(updated).toMatchObject({ status: 'failed', errorCode: 500, error: 'boom', details: 'more' });
	});
});

describe('BroadcastHelper.withEnded', () => {
	it('closes the broadcast and every open stream at the given instant', () => {
		const ended = BroadcastHelper.withEnded(
			record(
				[
					destination({ id: 'live', status: MeetBroadcastDestinationStatus.ACTIVE }),
					destination({ id: 'off', status: MeetBroadcastDestinationStatus.FAILED })
				],
				{ status: MeetBroadcastStatus.ACTIVE, startDate: 10_000 }
			),
			70_000
		);

		expect(ended).toMatchObject({ status: 'complete', endDate: 70_000, duration: 60 });
		expect(ended.destinations.map(({ status }) => status)).toEqual(['stopped', 'failed']);
		expect(ended.destinations[0].endDate).toBe(70_000);
	});

	it('keeps the ending LiveKit already reported, like the abort of a broadcast stopped while starting', () => {
		const ended = BroadcastHelper.withEnded(
			record([destination({ status: MeetBroadcastDestinationStatus.CONNECTING })], {
				status: MeetBroadcastStatus.ABORTED,
				startDate: 10_000
			}),
			70_000
		);

		expect(ended).toMatchObject({ status: 'aborted', startDate: undefined, endDate: undefined });
	});

	it('reports a broadcast that never streamed as aborted, with no end date nor duration', () => {
		const ended = BroadcastHelper.withEnded(
			record([destination({ status: MeetBroadcastDestinationStatus.CONNECTING })]),
			70_000
		);

		expect(ended.status).toBe('aborted');
		expect(ended.endDate).toBeUndefined();
		expect(ended.duration).toBeUndefined();
		expect(ended.destinations[0].status).toBe('stopped');
	});
});

describe('BroadcastHelper.toBroadcastInfo', () => {
	it('redacts every destination URL and nothing else', () => {
		const info = BroadcastHelper.toBroadcastInfo(record([destination({}), destination({ id: 'd2', url: TWITCH })]));

		expect(info.destinations.map(({ url }) => url)).toEqual([
			REDACTED_YOUTUBE,
			'rtmps://live.twitch.tv:443/app/********'
		]);
		expect(info.destinations[0]).toMatchObject({ id: 'd1', name: 'YouTube', source: 'room', status: 'connecting' });
	});
});
