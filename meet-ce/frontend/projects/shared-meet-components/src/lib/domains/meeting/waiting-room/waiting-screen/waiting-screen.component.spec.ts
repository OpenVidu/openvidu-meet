import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetWaitingRoomStatus } from '@openvidu-meet/typings';
import { TranslateParams, TranslateService } from '../../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import { AudioDevicesComponent } from '../../openvidu-components/components/settings/audio-devices/audio-devices.component';
import { VideoDevicesComponent } from '../../openvidu-components/components/settings/video-devices/video-devices.component';
import { VideoElementComponent } from '../../openvidu-components/components/video-element/video-element.component';
import { MeetingUiConfigService } from '../../openvidu-components/services/config/meeting-ui-config.service';
import { LocalMediaService } from '../../openvidu-components/services/local-media/local-media.service';
import { WaitingRoomService } from '../waiting-room.service';
import { WaitingScreenComponent } from './waiting-screen.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const translate = (key: string, params?: TranslateParams) => (params ? `${key} ${JSON.stringify(params)}` : key);

describe('WaitingScreenComponent', () => {
	let fixture: ComponentFixture<WaitingScreenComponent>;
	let announce: jasmine.Spy;
	let leave: jasmine.Spy;
	let acquire: jasmine.Spy;
	const status = signal<MeetWaitingRoomStatus | undefined>(MeetWaitingRoomStatus.WAITING);
	const queuePosition = signal<number | undefined>(undefined);
	const knockedAt = signal<number | undefined>(undefined);
	const meetingActive = signal<boolean | undefined>(undefined);
	const message = signal<string | undefined>(undefined);

	beforeEach(async () => {
		jasmine.clock().install();
		jasmine.clock().mockDate(new Date('2026-11-11T10:00:00Z'));
		status.set(MeetWaitingRoomStatus.WAITING);
		queuePosition.set(undefined);
		knockedAt.set(undefined);
		meetingActive.set(undefined);
		message.set(undefined);
		announce = jasmine.createSpy('announce').and.resolveTo();
		leave = jasmine.createSpy('leave');
		acquire = jasmine.createSpy('acquire').and.resolveTo();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LiveAnnouncer, useValue: { announce } },
				{ provide: TranslateService, useValue: { translate, translationsLoaded: () => 0 } },
				{
					provide: WaitingRoomService,
					useValue: {
						status,
						queuePosition,
						knockedAt,
						meetingActive,
						message,
						isReconnecting: signal(false),
						leave
					}
				},
				{
					provide: LocalMediaService,
					useValue: {
						acquire,
						unavailableDevicesMessageKey: () => undefined,
						camera: { track: signal(undefined), enabled: signal(true) }
					}
				},
				{
					provide: MeetingUiConfigService,
					useValue: {
						showCameraControlsSignal: signal(true),
						showMicrophoneControlsSignal: signal(true),
						participantNameSignal: signal('Ana')
					}
				}
			]
		});
		TestBed.overrideComponent(WaitingScreenComponent, {
			remove: { imports: [VideoElementComponent, VideoDevicesComponent, AudioDevicesComponent] },
			add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] }
		});

		fixture = TestBed.createComponent(WaitingScreenComponent);
		await render();
	});

	afterEach(() => jasmine.clock().uninstall());

	async function render(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
	}

	const text = (selector: string) =>
		(fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.trim() ?? '';

	it('opens the camera and microphone for the preview', () => {
		expect(acquire).toHaveBeenCalledTimes(1);
	});

	it('titles the screen with the place in line once it is known', async () => {
		expect(text('#waiting-screen-title')).toBe('WAITING_ROOM.TITLE');

		queuePosition.set(2);
		await render();

		expect(text('#waiting-screen-title')).toBe('WAITING_ROOM.POSITION {"position":2}');
	});

	it('shows the time waited from the first minute, in a region screen readers do not announce', async () => {
		knockedAt.set(Date.now() - 30_000);
		await render();
		expect(text('#waiting-screen-waited')).toBe('');

		knockedAt.set(Date.now() - 4 * 60_000);
		await render();

		expect(text('#waiting-screen-waited')).toContain('WAITING_ROOM.WAITED {"minutes":4}');
		expect(
			(fixture.nativeElement as HTMLElement).querySelector('#waiting-screen-waited')!.getAttribute('aria-live')
		).toBe('off');
	});

	it('says the meeting has not started yet only while the server says so', async () => {
		expect(text('#waiting-screen-not-started')).toBe('');

		meetingActive.set(false);
		message.set('We start at 10:00');
		await render();

		expect(text('#waiting-screen-not-started span')).toBe('WAITING_ROOM.NOT_STARTED');
		expect(text('#waiting-screen-message span')).toBe('We start at 10:00');
	});

	it('announces the place in line politely, at most once every 10 seconds, the latest one', async () => {
		queuePosition.set(3);
		await render();
		queuePosition.set(2);
		await render();
		queuePosition.set(1);
		await render();

		expect(announce).toHaveBeenCalledOnceWith('WAITING_ROOM.POSITION {"position":3}', 'polite');

		jasmine.clock().tick(10_000);

		expect(announce).toHaveBeenCalledTimes(2);
		expect(announce).toHaveBeenCalledWith('WAITING_ROOM.POSITION {"position":1}', 'polite');
	});

	it('announces the admission assertively', async () => {
		status.set(MeetWaitingRoomStatus.ADMITTED);
		await render();

		expect(announce).toHaveBeenCalledWith('WAITING_ROOM.ADMITTED', 'assertive');
	});

	it('leaves the waiting room from its button', () => {
		(fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('#waiting-room-leave-button')!.click();

		expect(leave).toHaveBeenCalledTimes(1);
	});
});
