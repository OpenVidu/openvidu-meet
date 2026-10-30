import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpService } from '../../../shared/services/http.service';
import { MeetingContextService } from './meeting-context.service';
import { MeetingModerationService } from './meeting-moderation.service';

const ROOM_ID = 'room1';

describe('MeetingModerationService', () => {
	let service: MeetingModerationService;
	let httpService: jasmine.SpyObj<HttpService>;
	const endedBySelf = signal(false);

	beforeEach(() => {
		endedBySelf.set(false);
		httpService = jasmine.createSpyObj<HttpService>('HttpService', ['deleteRequest']);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingModerationService,
				{ provide: HttpService, useValue: httpService },
				{
					provide: MeetingContextService,
					useValue: {
						endedBySelf,
						markMeetingEndedBySelf: () => endedBySelf.set(true),
						clearMeetingEndedBySelf: () => endedBySelf.set(false)
					}
				}
			]
		});

		service = TestBed.inject(MeetingModerationService);
	});

	it('marks the meeting as ended by the local participant before asking the server to end it', async () => {
		httpService.deleteRequest.and.callFake((async () => {
			expect(endedBySelf()).toBeTrue();
		}) as HttpService['deleteRequest']);

		await service.endMeeting(ROOM_ID);

		expect(httpService.deleteRequest).toHaveBeenCalledOnceWith(
			`${HttpService.API_PATH_PREFIX}/meetings/${ROOM_ID}`
		);
		expect(endedBySelf()).toBeTrue();
	});

	it('withdraws the mark when the server refuses to end the meeting', async () => {
		httpService.deleteRequest.and.rejectWith(new Error('403'));

		await expectAsync(service.endMeeting(ROOM_ID)).toBeRejectedWithError('403');

		expect(endedBySelf()).toBeFalse();
	});
});
