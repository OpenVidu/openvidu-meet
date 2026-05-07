import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatMessage } from '../../models/chat.model';
import { DataTopic } from '../../models/data-topic.model';
import { ActionService } from '../action/action.service';
import { E2eeService } from '../e2ee/e2ee.service';
import { LoggerService } from '../logger/logger.service';
import { PanelService } from '../panel/panel.service';
import { ParticipantService } from '../participant/participant.service';
import { TranslateService } from '../translate/translate.service';
import { ChatService } from './chat.service';

class AudioDouble {
	play = jasmine.createSpy('play').and.returnValue(Promise.resolve());
	volume = 0;
}

describe('ChatService', () => {
	let service: ChatService;
	let loggerInstance: { d: jasmine.Spy; i: jasmine.Spy; e: jasmine.Spy };
	let loggerServiceMock: { get: jasmine.Spy };
	let participantServiceMock: { publishData: jasmine.Spy; getMyName: jasmine.Spy };
	let panelServiceMock: { isChatPanelOpened: jasmine.Spy; togglePanel: jasmine.Spy };
	let actionServiceMock: { launchNotification: jasmine.Spy };
	let translateServiceMock: { translate: jasmine.Spy };
	let e2eeServiceMock: { encrypt: jasmine.Spy };
	let audioFactorySpy: jasmine.Spy;
	let audioInstance: AudioDouble;
	let originalAudio: typeof Audio;

	beforeAll(() => {
		originalAudio = (window as any).Audio;
		audioFactorySpy = jasmine.createSpy('Audio').and.callFake(() => {
			audioInstance = new AudioDouble();
			return audioInstance;
		});
		(window as any).Audio = audioFactorySpy;
	});

	afterAll(() => {
		(window as any).Audio = originalAudio;
	});

	beforeEach(() => {
		audioFactorySpy.calls.reset();

		loggerInstance = {
			d: jasmine.createSpy('d'),
			i: jasmine.createSpy('i'),
			e: jasmine.createSpy('e')
		};
		loggerServiceMock = {
			get: jasmine.createSpy('get').and.returnValue(loggerInstance)
		};
		participantServiceMock = {
			publishData: jasmine.createSpy('publishData').and.resolveTo(undefined),
			getMyName: jasmine.createSpy('getMyName').and.returnValue('alice')
		};
		panelServiceMock = {
			isChatPanelOpened: jasmine.createSpy('isChatPanelOpened').and.returnValue(true),
			togglePanel: jasmine.createSpy('togglePanel')
		};
		actionServiceMock = {
			launchNotification: jasmine.createSpy('launchNotification')
		};
		translateServiceMock = {
			translate: jasmine.createSpy('translate').and.callFake((key: string) => `${key}_translated`)
		};
		e2eeServiceMock = {
			encrypt: jasmine.createSpy('encrypt').and.callFake(async (plain: Uint8Array) => plain)
		};

		TestBed.configureTestingModule({
			providers: [
				ChatService,
				{ provide: LoggerService, useValue: loggerServiceMock },
				{ provide: ParticipantService, useValue: participantServiceMock },
				{ provide: PanelService, useValue: panelServiceMock },
				{ provide: ActionService, useValue: actionServiceMock },
				{ provide: TranslateService, useValue: translateServiceMock },
				{ provide: E2eeService, useValue: e2eeServiceMock }
			]
		});

		service = TestBed.inject(ChatService);
	});

	it('adds remote message without notification when chat panel is open', async () => {
		const emissions: ChatMessage[][] = [];
		const eff = effect(() => emissions.push(service.chatMessages()));

		await service.addRemoteMessage('Hello world', 'Bob');

		expect(emissions.at(-1)).toEqual([{ isLocal: false, participantName: 'Bob', message: 'Hello world' }]);
		expect(actionServiceMock.launchNotification).not.toHaveBeenCalled();
		expect(audioInstance.play).not.toHaveBeenCalled();
	});

	it('adds remote message and triggers notification with sound when chat panel is closed', async () => {
		panelServiceMock.isChatPanelOpened.and.returnValue(false);
		const emissions: ChatMessage[][] = [];
		const eff = effect(() => emissions.push(service.chatMessages()));

		await service.addRemoteMessage('Hi there', 'Bob');

		expect(actionServiceMock.launchNotification).toHaveBeenCalled();
		const notificationArgs = actionServiceMock.launchNotification.calls.mostRecent().args[0];
		expect(notificationArgs.message).toContain('BOB');
		expect(notificationArgs.buttonActionText).toBe('PANEL.CHAT.OPEN_CHAT_translated');
		expect(audioInstance.play).toHaveBeenCalled();
		expect(emissions.at(-1)?.length).toBe(1);
	});

	it('does not send empty messages', async () => {
		await service.sendMessage('   ');

		expect(e2eeServiceMock.encrypt).not.toHaveBeenCalled();
		expect(participantServiceMock.publishData).not.toHaveBeenCalled();
	});

	it('encrypts, publishes and stores local messages', async () => {
		const emissions: ChatMessage[][] = [];
		const eff = effect(() => emissions.push(service.chatMessages()));

		await service.sendMessage('Hello world');

		expect(e2eeServiceMock.encrypt).toHaveBeenCalled();
		expect(participantServiceMock.publishData).toHaveBeenCalled();
		const [, publishOptions] = participantServiceMock.publishData.calls.mostRecent().args;
		expect(publishOptions).toEqual({ topic: DataTopic.CHAT, reliable: true });
		expect(emissions.at(-1)).toEqual([{ isLocal: true, participantName: 'alice', message: 'Hello world' }]);

		sub.unsubscribe();
	});
	it('logs and rethrows errors when encryption fails', async () => {
		const error = new Error('encryption failed');
		e2eeServiceMock.encrypt.and.callFake(() => {
			throw error;
		});

		await expectAsync(service.sendMessage('fail')).toBeRejectedWith(error);
		expect(loggerInstance.e).toHaveBeenCalledWith('Error sending chat message:', error);
	});
});
