import { ElementRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogService } from '../../../../../shared/services/dialog.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { MeetingContextService } from '../../../services/meeting-context.service';
import { WaitingParticipantsAdminService } from '../../../waiting-participants/waiting-participants-admin.service';
import { BroadcastStateService } from '../../services/broadcast/broadcast-state.service';
import { ChatService } from '../../services/chat/chat.service';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';
import { DeviceService } from '../../services/device/device.service';
import { DocumentService } from '../../services/document/document.service';
import { LocalMediaService } from '../../services/local-media/local-media.service';
import { MeetingLiveKitService } from '../../services/meeting-livekit/meeting-livekit.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { PlatformService } from '../../services/platform/platform.service';
import { RecordingService } from '../../services/recording/recording.service';
import { ScreenShareService } from '../../services/screen-share/screen-share.service';
import { MeetingTranslateService } from '../../services/translate/meeting-translate.service';
import { ViewportService } from '../../services/viewport/viewport.service';
import { ToolbarComponent } from './toolbar.component';

describe('ToolbarComponent microphone toggle', () => {
	let resolve: () => void;
	let reject: (reason: Error) => void;
	let toolbar: { microphoneMuteChanging: ReturnType<typeof signal<boolean>> };
	let toggleMicrophone: () => Promise<void>;

	beforeEach(() => {
		const pending = new Promise<void>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		toolbar = { microphoneMuteChanging: signal(false) };
		Object.assign(toolbar, {
			isMicrophoneEnabled: () => false,
			localMedia: { setMicrophoneEnabled: () => pending },
			log: { e: () => {} }
		});
		toggleMicrophone = () => ToolbarComponent.prototype.toggleMicrophone.call(toolbar);
	});

	it('is changing while the microphone change is pending and settled after it resolves', async () => {
		const toggling = toggleMicrophone();

		expect(toolbar.microphoneMuteChanging()).toBeTrue();

		resolve();
		await toggling;

		expect(toolbar.microphoneMuteChanging()).toBeFalse();
	});

	it('settles after the microphone change fails', async () => {
		const toggling = toggleMicrophone();
		reject(new Error('device error'));
		await toggling;

		expect(toolbar.microphoneMuteChanging()).toBeFalse();
	});
});

describe('ToolbarComponent when the connection is lost', () => {
	let reconnecting: ReturnType<typeof signal<boolean>>;
	let panelOpen: ReturnType<typeof signal<{ isOpened: boolean }>>;
	let closePanel: jasmine.Spy;
	let newChatMessages: ReturnType<typeof signal<number>>;
	let toolbar: ToolbarComponent;

	/** A service whose members the toolbar reads at construction but this spec does not care about. */
	const stubOf = (members: Record<string | symbol, unknown> = {}) =>
		new Proxy(members, { get: (target, key) => (key in target ? target[key] : signal(undefined)) });

	beforeEach(() => {
		reconnecting = signal(false);
		panelOpen = signal({ isOpened: false });
		closePanel = jasmine.createSpy('closePanel');
		newChatMessages = signal(0);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
				{ provide: DocumentService, useValue: stubOf() },
				{ provide: ChatService, useValue: stubOf({ newMessageCount: newChatMessages }) },
				{
					provide: PanelService,
					useValue: stubOf({
						panelOpened: signal({ isOpened: false }),
						isPanelOpened: () => panelOpen().isOpened,
						isChatPanelOpened: () => false,
						closePanel
					})
				},
				{ provide: ParticipantService, useValue: stubOf() },
				{ provide: WaitingParticipantsAdminService, useValue: stubOf() },
				{
					provide: LocalMediaService,
					useValue: stubOf({ camera: { enabled: signal(false) }, microphone: { enabled: signal(false) } })
				},
				{ provide: ScreenShareService, useValue: stubOf() },
				{ provide: MeetingLiveKitService, useValue: stubOf({ isReconnecting: reconnecting }) },
				{ provide: DeviceService, useValue: stubOf() },
				{ provide: DialogService, useValue: stubOf() },
				{ provide: RecordingService, useValue: stubOf() },
				{ provide: BroadcastStateService, useValue: stubOf() },
				{ provide: MeetingContextService, useValue: stubOf() },
				{ provide: MeetingTranslateService, useValue: stubOf() },
				{ provide: MeetingUiConfigService, useValue: stubOf({ roomNameSignal: signal('') }) },
				{ provide: PlatformService, useValue: stubOf({ isFirefox: () => false, isMobile: () => false }) },
				{ provide: ViewportService, useValue: stubOf() },
				{ provide: LoggerService, useValue: { get: () => ({ d: () => {}, w: () => {}, e: () => {} }) } }
			]
		});

		toolbar = TestBed.runInInjectionContext(() => new ToolbarComponent());
	});

	it('counts as unread the chat messages that arrive live while the chat is closed, and no other', () => {
		TestBed.tick();
		expect(toolbar.unreadMessages()).toBe(0);

		newChatMessages.set(2);
		TestBed.tick();

		expect(toolbar.unreadMessages()).toBe(2);
	});

	it('closes the panel that is open', () => {
		panelOpen.set({ isOpened: true });
		TestBed.tick();

		reconnecting.set(true);
		TestBed.tick();

		expect(closePanel).toHaveBeenCalledTimes(1);
	});

	it('has no panel to close while none is open', () => {
		reconnecting.set(true);
		TestBed.tick();

		expect(closePanel).not.toHaveBeenCalled();
	});
});
