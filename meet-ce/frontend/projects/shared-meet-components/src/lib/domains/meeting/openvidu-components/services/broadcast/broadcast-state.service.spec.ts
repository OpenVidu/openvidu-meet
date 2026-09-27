import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	MeetBroadcastDestinationInfo,
	MeetBroadcastDestinationSource,
	MeetBroadcastDestinationStatus,
	MeetBroadcastInfo,
	MeetBroadcastStatus,
	MeetRecordingLayout
} from '@openvidu-meet/typings';
import { BroadcastStateService } from './broadcast-state.service';

/**
 * The LIVE chip and the broadcast activity read this state, so what is pinned here is what they
 * show: a running or failed broadcast stays, a finished one is forgotten, the clock follows the start
 * the server reports and stops with the broadcast, and a pending request is answered by whatever the
 * server says next.
 */
describe('BroadcastStateService', () => {
	const NOW = 1_700_000_000_000;
	let service: BroadcastStateService;

	const broadcast = (overrides: Partial<MeetBroadcastInfo> = {}): MeetBroadcastInfo => ({
		broadcastId: 'bc1',
		roomId: 'room1',
		roomName: 'Room 1',
		status: MeetBroadcastStatus.ACTIVE,
		layout: MeetRecordingLayout.GRID,
		destinations: [],
		...overrides
	});

	const destination = (status: MeetBroadcastDestinationStatus): MeetBroadcastDestinationInfo => ({
		id: `dest-${status}`,
		name: status,
		url: 'rtmp://media.example.com/live/********',
		source: MeetBroadcastDestinationSource.ROOM,
		status
	});

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

		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.ENDING }));
		expect(service.isEnding()).toBeTrue();

		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.COMPLETE }));
		expect(service.broadcast()).toBeUndefined();
		expect(service.isInProgress()).toBeFalse();
	});

	it('keeps a failed broadcast, so the activity can say why, until the failure is dismissed', () => {
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.FAILED, error: 'Egress failed' }));
		expect(service.hasFailed()).toBeTrue();
		expect(service.broadcast()?.error).toBe('Egress failed');

		service.dismissFailure();
		expect(service.broadcast()).toBeUndefined();
		expect(service.hasFailed()).toBeFalse();
	});

	it('answers a pending request with whatever the server reports next', () => {
		service.setRequest('starting');
		expect(service.isStarting()).toBeTrue();

		service.setBroadcast(broadcast());
		expect(service.request()).toEqual({ status: 'idle' });
		expect(service.isStarting()).toBeFalse();
		expect(service.isLive()).toBeTrue();
	});

	it('dismissing a refused request keeps the broadcast it was about', () => {
		service.setBroadcast(broadcast());
		service.setRequest('failed', 'Destination limit reached');

		service.dismissFailure();

		expect(service.request()).toEqual({ status: 'idle' });
		expect(service.isLive()).toBeTrue();
	});

	it('counts the destinations still streaming', () => {
		const { CONNECTING, ACTIVE, STOPPED, FAILED } = MeetBroadcastDestinationStatus;
		service.setBroadcast(broadcast({ destinations: [CONNECTING, ACTIVE, STOPPED, FAILED].map(destination) }));

		expect(service.streamingDestinationCount()).toBe(2);
	});

	it('clocks the time live from the start the server reports, once a second', () => {
		service.setBroadcast(broadcast({ startDate: NOW - 5_000 }));
		expect(elapsedSeconds()).toBe(5);

		jasmine.clock().tick(1_000);
		expect(elapsedSeconds()).toBe(6);
	});

	it('does not run the clock before the broadcast is live', () => {
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.STARTING, startDate: NOW - 5_000 }));
		jasmine.clock().tick(1_000);

		expect(elapsedSeconds()).toBe(0);
	});

	it('stops the clock with the broadcast', () => {
		service.setBroadcast(broadcast({ startDate: NOW - 5_000 }));
		service.setBroadcast(broadcast({ status: MeetBroadcastStatus.COMPLETE, startDate: NOW - 5_000 }));
		jasmine.clock().tick(3_000);

		expect(elapsedSeconds()).toBe(0);
	});
});
