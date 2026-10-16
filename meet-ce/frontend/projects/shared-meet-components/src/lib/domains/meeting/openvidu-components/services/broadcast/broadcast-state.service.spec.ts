import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
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

	const broadcast = (overrides: Partial<MeetBroadcastInfo> = {}): MeetBroadcastInfo => ({
		broadcastId: 'bc1',
		roomId: 'room1',
		roomName: 'Room 1',
		status: MeetBroadcastStatus.ACTIVE,
		name: 'YouTube',
		url: 'rtmp://media.example.com/live/********',
		destinationId: 'dest-1',
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
			broadcast({ broadcastId: 'bc1', destinationId: 'd1', status: MeetBroadcastStatus.STARTING })
		);
		service.setBroadcast(broadcast({ broadcastId: 'bc2', destinationId: 'd2' }));
		service.setBroadcast(
			broadcast({ broadcastId: 'bc3', destinationId: 'd3', status: MeetBroadcastStatus.FAILED })
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
			broadcast({ broadcastId: 'bc-meeting', destinationId: undefined, status: MeetBroadcastStatus.FAILED })
		);

		service.setBroadcast(broadcast({ broadcastId: 'bc2', status: MeetBroadcastStatus.STARTING }));
		service.setBroadcast(
			broadcast({ broadcastId: 'bc-meeting-2', destinationId: undefined, status: MeetBroadcastStatus.STARTING })
		);

		expect(statuses()).toEqual(['bc2:starting', 'bc-meeting-2:starting']);
	});

	it('keeps the failure of a destination given for the meeting when another on the same platform starts', () => {
		const meeting = { destinationId: undefined, url: 'rtmp://a.rtmp.youtube.com/live2/********' };
		service.setBroadcast(
			broadcast({ ...meeting, broadcastId: 'bc-a', name: 'Channel A', status: MeetBroadcastStatus.FAILED })
		);

		service.setBroadcast(
			broadcast({ ...meeting, broadcastId: 'bc-b', name: 'Channel B', status: MeetBroadcastStatus.STARTING })
		);

		expect(statuses()).toEqual(['bc-a:failed', 'bc-b:starting']);
	});

	it('forgets the failures once the last broadcast in progress ends normally, so stopping is no failure', () => {
		service.setBroadcast(broadcast({ broadcastId: 'bc1', destinationId: 'd1' }));
		service.setBroadcast(
			broadcast({ broadcastId: 'bc2', destinationId: 'd2', status: MeetBroadcastStatus.FAILED })
		);
		service.setBroadcast(
			broadcast({ broadcastId: 'bc3', destinationId: 'd3', status: MeetBroadcastStatus.STARTING })
		);

		service.setBroadcast(
			broadcast({ broadcastId: 'bc3', destinationId: 'd3', status: MeetBroadcastStatus.ABORTED })
		);
		expect(statuses()).toEqual(['bc1:active', 'bc2:failed']);

		service.setBroadcast(
			broadcast({ broadcastId: 'bc1', destinationId: 'd1', status: MeetBroadcastStatus.COMPLETE })
		);
		expect(service.broadcasts()).toEqual([]);
		expect(service.hasFailed()).toBeFalse();
	});

	it('keeps the failures when the last broadcast in progress fails too', () => {
		service.setBroadcast(broadcast({ broadcastId: 'bc1', destinationId: 'd1' }));
		service.setBroadcast(
			broadcast({ broadcastId: 'bc2', destinationId: 'd2', status: MeetBroadcastStatus.FAILED })
		);

		service.setBroadcast(
			broadcast({ broadcastId: 'bc1', destinationId: 'd1', status: MeetBroadcastStatus.FAILED })
		);

		expect(statuses()).toEqual(['bc1:failed', 'bc2:failed']);
		expect(service.hasFailed()).toBeTrue();
	});

	it('ties each broadcast of a start to the full URL of the destination given for the meeting, until reset', () => {
		service.recordOwnBroadcasts(
			[{ destinationId: 'd1' }, { name: 'Channel A', url: 'rtmp://a.rtmp.youtube.com/live2/key-a' }],
			[broadcast({ broadcastId: 'bc1' }), broadcast({ broadcastId: 'bc2', destinationId: undefined })]
		);

		expect([...service.ownUrls()]).toEqual([['bc2', 'rtmp://a.rtmp.youtube.com/live2/key-a']]);

		service.reset();
		expect(service.ownUrls().size).toBe(0);
	});

	it('keeps a request pending until it is answered, and dismissing a refusal keeps the broadcasts', () => {
		service.setBroadcast(broadcast());
		service.setRequest('starting');
		expect(service.isStarting()).toBeTrue();

		service.setRequest('failed', 'Destination limit reached');
		service.dismissFailure();

		expect(service.request()).toEqual({ status: 'idle' });
		expect(service.isLive()).toBeTrue();
	});

	it('clocks the time live from the first broadcast still live, once a second', () => {
		service.setBroadcast(broadcast({ broadcastId: 'bc1', destinationId: 'd1', startDate: NOW - 5_000 }));
		service.setBroadcast(broadcast({ broadcastId: 'bc2', destinationId: 'd2', startDate: NOW - 2_000 }));
		expect(elapsedSeconds()).toBe(5);

		jasmine.clock().tick(1_000);
		expect(elapsedSeconds()).toBe(6);

		service.setBroadcast(
			broadcast({ broadcastId: 'bc1', destinationId: 'd1', status: MeetBroadcastStatus.COMPLETE })
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
