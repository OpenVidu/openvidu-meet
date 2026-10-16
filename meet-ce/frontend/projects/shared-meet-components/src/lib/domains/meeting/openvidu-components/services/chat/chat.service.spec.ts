import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AssetsService } from '../../../../../shared/services/assets.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { PanelService } from '../panel/panel.service';
import { ParticipantService } from '../participant/participant.service';
import { ChatService } from './chat.service';

describe('ChatService', () => {
	const NOTICE_ID = 7;

	let service: ChatService;
	let notificationService: jasmine.SpyObj<NotificationService>;

	beforeEach(() => {
		notificationService = jasmine.createSpyObj<NotificationService>('NotificationService', [
			'showNotification',
			'dismissNotification'
		]);
		notificationService.showNotification.and.returnValue(NOTICE_ID);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: NotificationService, useValue: notificationService },
				{ provide: PanelService, useValue: { isChatPanelOpened: () => false } },
				{ provide: ParticipantService, useValue: {} },
				{ provide: AssetsService, useValue: { chatMessageSound: '' } }
			]
		});

		service = TestBed.inject(ChatService);
	});

	it('forgets the messages and the new-message notice of the meeting it clears', async () => {
		await service.addRemoteMessage('hello', 'Alice');
		expect(service.chatMessages()).toEqual([{ isLocal: false, participantName: 'Alice', message: 'hello' }]);

		service.clear();

		expect(service.chatMessages()).toEqual([]);
		expect(notificationService.dismissNotification).toHaveBeenCalledOnceWith(NOTICE_ID);
	});

	it('announces the first message after a clear as new', async () => {
		await service.addRemoteMessage('hello', 'Alice');
		service.clear();

		await service.addRemoteMessage('hi again', 'Bob');

		expect(service.chatMessages()).toEqual([{ isLocal: false, participantName: 'Bob', message: 'hi again' }]);
		expect(notificationService.showNotification).toHaveBeenCalledTimes(2);
		expect(notificationService.dismissNotification).toHaveBeenCalledOnceWith(NOTICE_ID);
	});
});
