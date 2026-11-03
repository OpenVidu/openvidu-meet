import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AssetsService } from '../../../../../shared/services/assets.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { PanelService } from '../panel/panel.service';
import { ParticipantService } from '../participant/participant.service';
import { ChatService } from './chat.service';

describe('ChatService', () => {
	const NOTICE_ID = 7;

	let service: ChatService;
	let notificationService: jasmine.SpyObj<NotificationService>;
	let sendText: jasmine.Spy;
	let remoteParticipants: { identity: string; canReadChat: boolean }[];
	const chatPanelButton = signal(true);

	beforeEach(() => {
		chatPanelButton.set(true);
		notificationService = jasmine.createSpyObj<NotificationService>('NotificationService', [
			'showNotification',
			'dismissNotification'
		]);
		notificationService.showNotification.and.returnValue(NOTICE_ID);
		sendText = jasmine.createSpy('sendText').and.resolveTo();
		remoteParticipants = [];

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: NotificationService, useValue: notificationService },
				{ provide: PanelService, useValue: { isChatPanelOpened: () => false } },
				{ provide: MeetingUiConfigService, useValue: { chatPanelButtonSignal: chatPanelButton } },
				{
					provide: ParticipantService,
					useValue: { remoteParticipants: () => remoteParticipants, sendText, getMyName: () => 'Me' }
				},
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

	it('ignores a message the participant cannot read, without a notice', async () => {
		chatPanelButton.set(false);

		await service.addRemoteMessage('hello', 'Alice');

		expect(service.chatMessages()).toEqual([]);
		expect(notificationService.showNotification).not.toHaveBeenCalled();
	});

	it('sends a message as a text stream to the participants holding chatRead only', async () => {
		remoteParticipants = [
			{ identity: 'reader', canReadChat: true },
			{ identity: 'non-reader', canReadChat: false }
		];

		await service.sendMessage('hello  there');

		expect(sendText).toHaveBeenCalledOnceWith('hello there', { topic: 'chat', destinationIdentities: ['reader'] });
		expect(service.chatMessages()).toEqual([{ isLocal: true, participantName: 'Me', message: 'hello there' }]);
	});

	it('sends nothing when no participant holds chatRead, and still shows the own message', async () => {
		remoteParticipants = [{ identity: 'non-reader', canReadChat: false }];

		await service.sendMessage('hello');

		expect(sendText).not.toHaveBeenCalled();
		expect(service.chatMessages()).toEqual([{ isLocal: true, participantName: 'Me', message: 'hello' }]);
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
