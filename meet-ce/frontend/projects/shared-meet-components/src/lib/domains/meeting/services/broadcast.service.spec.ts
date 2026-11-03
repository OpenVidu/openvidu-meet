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

	const forMeeting = (broadcastId: string): MeetBroadcastInfo => ({
		broadcastId,
		roomId: 'room1',
		roomName: 'Room 1',
		status: MeetBroadcastStatus.STARTING,
		destination: { name: 'Backup', url: 'rtmp://media.example.com/live/********' },
		layout: MeetRecordingLayout.GRID,
		encoding: MeetRecordingEncodingPreset.H264_720P_30
	});

	beforeEach(() => {
		httpService = jasmine.createSpyObj<HttpService>('HttpService', ['postRequest']);

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

	it('stops the broadcasts asked for, or every running one', async () => {
		httpService.postRequest.and.resolveTo({ broadcasts: [] });

		await service.request({ action: 'stop', roomId: 'room1', broadcastIds: ['bc1'] });
		await service.request({ action: 'stop', roomId: 'room1' });

		expect(httpService.postRequest.calls.allArgs()).toEqual([
			[`${BROADCASTS_PATH}/stop`, { roomId: 'room1', broadcastIds: ['bc1'] }],
			[`${BROADCASTS_PATH}/stop`, { roomId: 'room1', broadcastIds: undefined }]
		]);
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
