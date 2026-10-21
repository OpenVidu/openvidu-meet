import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	MeetBroadcastDestination,
	MeetBroadcastInfo,
	MeetBroadcastStatus,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout
} from '@openvidu-meet/typings';
import { BroadcastStateService } from './broadcast-state.service';

/**
 * The LIVE chip and the broadcast activity read this state, so what is pinned here is what they
 * show: a running or failed broadcast stays, a finished one is forgotten, the clock follows the
 * first start the server reports among the broadcasts still live and stops with the last of them.
 */
describe('BroadcastStateService', () => {
	const NOW = 1_700_000_000_000;
	let service: BroadcastStateService;

	const broadcast = ({
		destination,
		...overrides
	}: Partial<Omit<MeetBroadcastInfo, 'destination'>> & {
		destination?: Partial<MeetBroadcastDestination>;
	} = {}): MeetBroadcastInfo => ({
		broadcastId: 'bc1',
		roomId: 'room1',
		roomName: 'Room 1',
		status: MeetBroadcastStatus.ACTIVE,
		destination: { id: 'dest-1', name: 'YouTube', url: 'rtmp://media.example.com/live/********', ...destination },
		layout: MeetRecordingLayout.GRID,
		encoding: MeetRecordingEncodingPreset.H264_720P_30,
		...overrides
	});

	const statuses = () => service.broadcasts().map(({ broadcastId, status }) => `${broadcastId}:${status}`);
	const elapsedSeconds = () => service.elapsed().getMinutes() * 60 + service.elapsed().getSeconds();

	beforeEach(() => {
		jasmine.clock().install();
		jasmine.clock().mockDate(new Date(NOW));
		TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), BroadcastStateService] });
		service = TestBed.inject(BroadcastStateService);
	});

	afterEach(() => {
		service.reset();
		jasmine.clock().uninstall();
	});

	it('keeps a broadcast while it runs and forgets it once it ends', () => {
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.STARTING }));
		expect(service.isStarting()).toBeTrue();
		expect(service.isInProgress()).toBeTrue();

		service.setBroadcast(broadcast());
		expect(service.isLive()).toBeTrue();
		expect(statuses()).toEqual(['bc1:active']);

		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.ENDING }));
		expect(service.isEnding()).toBeTrue();

		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.COMPLETE }));
		expect(service.broadcasts()).toEqual([]);
		expect(service.isInProgress()).toBeFalse();
	});

	it('is live while any broadcast is, and counts the destinations media reached', () => {
		service.setBroadcast(
			broadcast({ broadcastId: 'bc1', destination: { id: 'd1' }, status: MeetBroadcastStatus.STARTING })
		);
		service.setBroadcast(broadcast({ broadcastId: 'bc2', destination: { id: 'd2' } }));
		service.setBroadcast(
			broadcast({ broadcastId: 'bc3', destination: { id: 'd3' }, status: MeetBroadcastStatus.FAILED })
		);

		expect(service.isLive()).toBeTrue();
		expect(service.hasFailed()).toBeFalse();
		expect(service.liveDestinationCount()).toBe(1);
		expect(service.failed().map(({ broadcastId }) => broadcastId)).toEqual(['bc3']);
	});

	it('keeps a failed broadcast, so the activity can say why, until the failure is dismissed', () => {
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.FAILED, error: 'Egress failed' }));
		expect(service.hasFailed()).toBeTrue();
		expect(service.failed()[0].error).toBe('Egress failed');

		service.dismissFailure();
		expect(service.broadcasts()).toEqual([]);
		expect(service.hasFailed()).toBeFalse();
	});

	it('replaces the failed broadcast to a destination with the next attempt at it', () => {
		service.setBroadcast(broadcast({ broadcastId: 'bc1', status: MeetBroadcastStatus.FAILED }));
		service.setBroadcast(
			broadcast({ broadcastId: 'bc-meeting', destination: { id: undefined }, status: MeetBroadcastStatus.FAILED })
		);

		service.setBroadcast(broadcast({ broadcastId: 'bc2', status: MeetBroadcastStatus.STARTING }));
		service.setBroadcast(
			broadcast({
				broadcastId: 'bc-meeting-2',
				destination: { id: undefined },
				status: MeetBroadcastStatus.STARTING
			})
		);

		expect(statuses()).toEqual(['bc2:starting', 'bc-meeting-2:starting']);
	});

	it('keeps the failure of a destination given for the meeting when another on the same platform starts', () => {
		const meeting = { id: undefined, url: 'rtmp://a.rtmp.youtube.com/live2/********' };
		service.setBroadcast(
			broadcast({
				broadcastId: 'bc-a',
				destination: { ...meeting, name: 'Channel A' },
				status: MeetBroadcastStatus.FAILED
			})
		);

		service.setBroadcast(
			broadcast({
				broadcastId: 'bc-b',
				destination: { ...meeting, name: 'Channel B' },
				status: MeetBroadcastStatus.STARTING
			})
		);

		expect(statuses()).toEqual(['bc-a:failed', 'bc-b:starting']);
	});

	it('forgets the failures once the last broadcast in progress ends normally, so stopping is no failure', () => {
		service.setBroadcast(broadcast({ broadcastId: 'bc1', destination: { id: 'd1' } }));
		service.setBroadcast(
			broadcast({ broadcastId: 'bc2', destination: { id: 'd2' }, status: MeetBroadcastStatus.FAILED })
		);
		service.setBroadcast(
			broadcast({ broadcastId: 'bc3', destination: { id: 'd3' }, status: MeetBroadcastStatus.STARTING })
		);

		service.setBroadcast(
			broadcast({ broadcastId: 'bc3', destination: { id: 'd3' }, status: MeetBroadcastStatus.ABORTED })
		);
		expect(statuses()).toEqual(['bc1:active', 'bc2:failed']);

		service.setBroadcast(
			broadcast({ broadcastId: 'bc1', destination: { id: 'd1' }, status: MeetBroadcastStatus.COMPLETE })
		);
		expect(service.broadcasts()).toEqual([]);
		expect(service.hasFailed()).toBeFalse();
	});

	it('keeps the failures when the last broadcast in progress fails too', () => {
		service.setBroadcast(broadcast({ broadcastId: 'bc1', destination: { id: 'd1' } }));
		service.setBroadcast(
			broadcast({ broadcastId: 'bc2', destination: { id: 'd2' }, status: MeetBroadcastStatus.FAILED })
		);

		service.setBroadcast(
			broadcast({ broadcastId: 'bc1', destination: { id: 'd1' }, status: MeetBroadcastStatus.FAILED })
		);

		expect(statuses()).toEqual(['bc1:failed', 'bc2:failed']);
		expect(service.hasFailed()).toBeTrue();
	});

	it('ties each broadcast of a start to the full URL of the destination given for the meeting, until reset', () => {
		service.recordOwnBroadcasts(
			[
				{ name: 'Channel A', url: 'rtmp://a.rtmp.youtube.com/live2/key-a' },
				{ name: 'Channel B', url: 'rtmp://b.example.com/live/key-b' }
			],
			[
				broadcast({ broadcastId: 'bc1' }),
				broadcast({ broadcastId: 'bc2', destination: { id: undefined } }),
				broadcast({ broadcastId: 'bc3', destination: { id: undefined } })
			]
		);

		expect([...service.ownUrls()]).toEqual([
			['bc2', 'rtmp://a.rtmp.youtube.com/live2/key-a'],
			['bc3', 'rtmp://b.example.com/live/key-b']
		]);

		service.reset();
		expect(service.ownUrls().size).toBe(0);
	});

	it('only moves a broadcast forward, so a late report never brings one back once it ended', () => {
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.ACTIVE }));
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.STARTING }));
		expect(statuses()).toEqual(['bc1:active']);

		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.COMPLETE }));
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.ACTIVE }));
		expect(service.broadcasts()).toEqual([]);
		expect(service.isInProgress()).toBeFalse();

		service.reset();
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.ACTIVE }));
		expect(statuses()).toEqual(['bc1:active']);
	});

	it('keeps a request pending until it is answered, and dismissing a refusal keeps the broadcasts', () => {
		const start = { action: 'start' as const, roomId: 'room1' };
		service.setBroadcast(broadcast());
		service.requestStarted(start);
		expect(service.isStarting()).toBeTrue();

		service.requestFailed(start, 'Broadcast is disabled');
		expect(service.refusal()).toEqual({ request: start, error: 'Broadcast is disabled' });
		service.dismissFailure();

		expect(service.pendingRequests()).toEqual([]);
		expect(service.refusal()).toBeUndefined();
		expect(service.isLive()).toBeTrue();
	});

	it('answers each request on its own: one answered leaves the others pending and the refusal of another standing', () => {
		const start = { action: 'start' as const, roomId: 'room1', destinationIds: ['dest-2'] };
		const stop = { action: 'stop' as const, roomId: 'room1', broadcastIds: ['bc1'] };
		service.requestStarted(start);
		service.requestStarted(stop);

		service.requestFailed(stop, 'The broadcast stayed busy with another change');
		expect(service.pendingRequests()).toEqual([start]);
		expect(service.isStartPending()).toBeTrue();
		expect(service.isEnding()).toBeFalse();

		service.requestSucceeded(start);
		expect(service.pendingRequests()).toEqual([]);
		expect(service.refusal()?.request).toBe(stop);

		service.requestStarted({ action: 'stop', roomId: 'room1' });
		expect(service.refusal()).toBeUndefined();
	});

	it('shows no refusal of a request asked before a reset, which belongs to another meeting', () => {
		const start = { action: 'start' as const, roomId: 'room1' };
		service.requestStarted(start);
		service.reset();

		service.requestFailed(start, 'Room has no participants');

		expect(service.refusal()).toBeUndefined();
	});

	it('clocks the time live from the first broadcast still live, once a second', () => {
		service.setBroadcast(broadcast({ broadcastId: 'bc1', destination: { id: 'd1' }, startDate: NOW - 5_000 }));
		service.setBroadcast(broadcast({ broadcastId: 'bc2', destination: { id: 'd2' }, startDate: NOW - 2_000 }));
		expect(elapsedSeconds()).toBe(5);

		jasmine.clock().tick(1_000);
		expect(elapsedSeconds()).toBe(6);

		service.setBroadcast(
			broadcast({ broadcastId: 'bc1', destination: { id: 'd1' }, status: MeetBroadcastStatus.COMPLETE })
		);
		expect(elapsedSeconds()).toBe(3);
	});

	it('does not run the clock before a broadcast is live', () => {
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.STARTING, startDate: NOW - 5_000 }));
		jasmine.clock().tick(1_000);

		expect(elapsedSeconds()).toBe(0);
	});

	it('stops the clock with the last live broadcast', () => {
		service.setBroadcast(broadcast({ startDate: NOW - 5_000 }));
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.COMPLETE, startDate: NOW - 5_000 }));
		jasmine.clock().tick(3_000);

		expect(elapsedSeconds()).toBe(0);
	});
});
