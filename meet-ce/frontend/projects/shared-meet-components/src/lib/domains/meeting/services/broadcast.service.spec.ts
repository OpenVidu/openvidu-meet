import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	MeetBroadcastInfo,
	MeetBroadcastStatus,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout
} from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';
import { BroadcastStateService } from '../openvidu-components';
import { BroadcastService } from './broadcast.service';

const BROADCASTS_PATH = `${HttpService.API_PATH_PREFIX}/broadcasts`;

/**
 * Every request of the local participant, from the activity or from the host application, goes
 * through here, so the activity shows each one pending until the server answers it and keeps a
 * refusal with the reason the server gave.
 */
describe('BroadcastService', () => {
	let service: BroadcastService;
	let state: BroadcastStateService;
	let httpService: jasmine.SpyObj<HttpService>;

	const forMeeting = (broadcastId: string, status = MeetBroadcastStatus.STARTING): MeetBroadcastInfo => ({
		broadcastId,
		roomId: 'room1',
		roomName: 'Room 1',
		status,
		destination: { name: 'Backup', url: 'rtmp://media.example.com/live/********' },
		layout: MeetRecordingLayout.GRID,
		encoding: MeetRecordingEncodingPreset.H264_720P_30
	});

	beforeEach(() => {
		httpService = jasmine.createSpyObj<HttpService>('HttpService', ['postRequest', 'deleteRequest']);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				BroadcastService,
				BroadcastStateService,
				{ provide: HttpService, useValue: httpService }
			]
		});

		service = TestBed.inject(BroadcastService);
		state = TestBed.inject(BroadcastStateService);
	});

	it('keeps a start pending until answered, and ties each destination given for the meeting to its broadcast', async () => {
		const destinations = [{ name: 'Backup', url: 'rtmp://media.example.com/live/key' }];
		let answer!: (body: { broadcasts: MeetBroadcastInfo[] }) => void;
		httpService.postRequest.and.returnValue(new Promise((resolve) => (answer = resolve)));

		const request = service.request({ action: 'start', roomId: 'room1', destinationIds: ['dest1'], destinations });
		expect(state.isStartPending()).toBeTrue();

		answer({ broadcasts: [forMeeting('bc1')] });
		await request;

		expect(httpService.postRequest).toHaveBeenCalledOnceWith(BROADCASTS_PATH, {
			roomId: 'room1',
			destinationIds: ['dest1'],
			destinations
		});
		expect(state.pendingRequests()).toEqual([]);
		expect(state.ownUrls().get('bc1')).toBe('rtmp://media.example.com/live/key');
	});

	it('stops the broadcast asked for by its id, or every running one by their ids', async () => {
		httpService.deleteRequest.and.resolveTo({});
		state.setBroadcast(forMeeting('room1--a', MeetBroadcastStatus.ACTIVE));
		state.setBroadcast(forMeeting('room1--b', MeetBroadcastStatus.ENDING));
		state.setBroadcast(forMeeting('room1--c', MeetBroadcastStatus.STARTING));

		await service.request({ action: 'stop', roomId: 'room1', broadcastId: 'room1--a' });
		await service.request({ action: 'stop', roomId: 'room1' });

		expect(httpService.deleteRequest.calls.allArgs()).toEqual([
			[`${BROADCASTS_PATH}/room1--a`],
			[`${BROADCASTS_PATH}?broadcastIds=room1--a,room1--c`]
		]);
	});

	it('stops every broadcast with those of a start still being answered, and sends nothing when none runs', async () => {
		let answer!: (body: { broadcasts: MeetBroadcastInfo[] }) => void;
		httpService.postRequest.and.returnValue(new Promise((resolve) => (answer = resolve)));
		httpService.deleteRequest.and.resolveTo({});

		await service.request({ action: 'stop', roomId: 'room1' });
		expect(httpService.deleteRequest).not.toHaveBeenCalled();

		const start = service.request({ action: 'start', roomId: 'room1' });
		const stop = service.request({ action: 'stop', roomId: 'room1' });
		answer({ broadcasts: [forMeeting('room1--a')] });
		await Promise.all([start, stop]);

		expect(httpService.deleteRequest).toHaveBeenCalledOnceWith(`${BROADCASTS_PATH}?broadcastIds=room1--a`);
	});

	it('keeps a refusal with the reason the server gave, and throws it back', async () => {
		const refused = { error: { message: 'Broadcast is disabled' } };
		httpService.postRequest.and.rejectWith(refused);
		const request = { action: 'start' as const, roomId: 'room1' };

		await expectAsync(service.request(request)).toBeRejectedWith(refused);

		expect(state.pendingRequests()).toEqual([]);
		expect(state.refusal()).toEqual({ request, error: 'Broadcast is disabled' });
	});
});
