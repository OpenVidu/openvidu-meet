import { Component, Pipe, PipeTransform, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import { CustomDevice } from '../../../models/device.model';
import { DeviceService } from '../../../services/device/device.service';
import { DeviceTrialService } from '../../../services/device-trial/device-trial.service';
import { LocalMediaService } from '../../../services/local-media/local-media.service';
import { MicActivityService } from '../../../services/mic-activity/mic-activity.service';
import { PlatformService } from '../../../services/platform/platform.service';
import { AudioDevicesComponent } from './audio-devices.component';

@Pipe({ name: 'translate' })
class TranslatePipeStub implements PipeTransform {
	transform(key: string): string {
		return key;
	}
}

@Component({ selector: 'ov-mic-status-alert', template: '' })
class MicStatusAlertStub {}

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

const laptop: CustomDevice = { label: 'Laptop', device: 'mic-1' };
const headset: CustomDevice = { label: 'Headset', device: 'mic-2' };

describe('AudioDevicesComponent', () => {
	let component: AudioDevicesComponent;
	let localMedia: {
		setMicrophoneEnabled: jasmine.Spy;
		switchMicrophone: jasmine.Spy;
		microphone: { enabled: ReturnType<typeof signal<boolean>> };
	};
	let deviceService: { setMicSelected: jasmine.Spy };
	let micLevel: ReturnType<typeof signal<number>>;
	let systemMuted: ReturnType<typeof signal<boolean>>;
	let isSpeaking: ReturnType<typeof signal<boolean>>;

	function create(trial?: unknown, canCaptureSecondDevice = true, renderTemplate = false) {
		localMedia = {
			setMicrophoneEnabled: jasmine.createSpy('setMicrophoneEnabled'),
			switchMicrophone: jasmine.createSpy('switchMicrophone'),
			microphone: { enabled: signal(false) }
		};
		deviceService = { setMicSelected: jasmine.createSpy('setMicSelected') };
		micLevel = signal(0);
		systemMuted = signal(false);
		isSpeaking = signal(false);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalMediaService, useValue: localMedia as unknown as LocalMediaService },
				{
					provide: MicActivityService,
					useValue: { level: micLevel, systemMuted, isSpeaking } as unknown as MicActivityService
				},
				{
					provide: PlatformService,
					useValue: { canCaptureSecondDevice: () => canCaptureSecondDevice }
				},
				{
					provide: DeviceService,
					useValue: {
						...deviceService,
						microphones: signal<CustomDevice[]>([laptop, headset]),
						microphoneSelected: signal<CustomDevice | undefined>(laptop),
						hasAudioDevices: signal(true)
					} as unknown as DeviceService
				},
				...(trial ? [{ provide: DeviceTrialService, useValue: trial }] : [])
			]
		});
		TestBed.overrideComponent(
			AudioDevicesComponent,
			!renderTemplate
				? { set: { template: '', imports: [], styles: [] } }
				: {
						set: {
							imports: [
								MatIconModule,
								MatMenuModule,
								MatTooltipModule,
								TranslatePipeStub,
								MicStatusAlertStub
							],
							styles: []
						}
					}
		);

		const fixture = TestBed.createComponent(AudioDevicesComponent);
		fixture.componentRef.setInput('compact', renderTemplate);
		component = fixture.componentInstance;
		return fixture;
	}

	describe('on the device setup screen', () => {
		beforeEach(() => create());

		it('is ready for the next toggle when the microphone could not be started', async () => {
			localMedia.setMicrophoneEnabled.and.rejectWith(new Error('NotReadableError'));

			await expectAsync(component.toggleMic(new MouseEvent('click'))).toBeResolved();

			expect(component.microphoneStatusChanging()).toBeFalse();
		});

		it('lights the level meter in proportion to what the microphone captures', () => {
			localMedia.microphone.enabled.set(true);
			micLevel.set(0.5);

			expect(component.litLevelBars()).toBe(component.levelBars.length / 2);
		});

		// The capture is still measured while muted, to warn about speaking while muted.
		it('keeps the level meter dark while the microphone is off', () => {
			micLevel.set(0.5);

			expect(component.litLevelBars()).toBe(0);
		});

		it('switches the microphone at once when one is picked', async () => {
			await component.onMicrophoneSelected({ value: headset });

			expect(localMedia.switchMicrophone).toHaveBeenCalledOnceWith('mic-2');
			expect(deviceService.setMicSelected).toHaveBeenCalledOnceWith('mic-2');
		});
	});

	describe('the compact control of the device setup screen', () => {
		let fixture: ReturnType<typeof create>;
		const query = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);
		const fill = () => query('.level-fill') as HTMLElement | null;

		beforeEach(() => {
			fixture = create(undefined, true, true);
			localMedia.microphone.enabled.set(true);
			fixture.detectChanges();
		});

		it('fills the toggle in proportion to the level', async () => {
			micLevel.set(0.5);
			fixture.detectChanges();

			expect(fill()?.style.transform).toBe('scaleY(0.5)');
			expect(query('.dropdown-section .level-fill')).toBeNull();
		});

		it('shows no level while the microphone is off', () => {
			localMedia.microphone.enabled.set(false);
			fixture.detectChanges();

			expect(fill()).toBeNull();
		});

		it('marks the toggle with the state of the microphone', () => {
			expect(query('#microphone-button')?.classList).toContain('device-enabled');

			localMedia.microphone.enabled.set(false);
			fixture.detectChanges();

			expect(query('#microphone-button')?.classList).toContain('device-disabled');
			expect(query('#microphone-button')?.classList).not.toContain('device-enabled');
		});

		it('keeps the menu button, enabled, while the microphone is off', () => {
			localMedia.microphone.enabled.set(false);
			fixture.detectChanges();

			expect((query('#audio-dropdown') as HTMLButtonElement | null)?.disabled).toBeFalse();
		});

		it('shows no level while the system mutes the microphone', () => {
			systemMuted.set(true);
			fixture.detectChanges();

			expect(fill()).toBeNull();
		});

		it('says when the microphone picks up sound', () => {
			expect(query('#microphone-button')?.getAttribute('aria-label')).toBe('TOOLBAR.MUTE_AUDIO');

			isSpeaking.set(true);
			fixture.detectChanges();

			expect(query('#microphone-button')?.getAttribute('aria-label')).toBe(
				'TOOLBAR.MUTE_AUDIO, DEVICES.PICKING_UP_SOUND'
			);
		});

		it('turns the microphone off from the toggle without opening the device list', () => {
			localMedia.setMicrophoneEnabled.and.resolveTo();

			query('#microphone-button')?.click();

			expect(localMedia.setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
			expect(document.querySelector('.device-menu')).toBeNull();
		});

		it('opens the device list from the menu button without touching the microphone', () => {
			query('#audio-dropdown')?.click();
			fixture.detectChanges();

			expect(localMedia.setMicrophoneEnabled).not.toHaveBeenCalled();
			expect(document.querySelector('.device-menu')).not.toBeNull();
		});
	});

	describe('in the meeting settings', () => {
		let trial: {
			tryMicrophone: jasmine.Spy;
			microphone: {
				device: ReturnType<typeof signal<CustomDevice | undefined>>;
				level: ReturnType<typeof signal<number>>;
			};
			applying: ReturnType<typeof signal<boolean>>;
		};

		beforeEach(() => {
			trial = {
				tryMicrophone: jasmine.createSpy('tryMicrophone'),
				microphone: { device: signal<CustomDevice | undefined>(undefined), level: signal(0) },
				applying: signal(false)
			};
			create(trial);
		});

		it('tries a picked microphone without switching the published one', async () => {
			await component.onMicrophoneSelected({ value: headset });

			expect(trial.tryMicrophone).toHaveBeenCalledOnceWith(headset);
			expect(localMedia.switchMicrophone).not.toHaveBeenCalled();
			expect(deviceService.setMicSelected).not.toHaveBeenCalled();
		});

		it('does not warn that a pick reaches the others at once', () => {
			expect(component.switchesAtOnce).toBeFalse();
		});

		it('meters the microphone being tried, and the published one otherwise', () => {
			localMedia.microphone.enabled.set(true);
			micLevel.set(0.5);
			trial.microphone.level.set(1);
			expect(component.litLevelBars()).toBe(component.levelBars.length / 2);

			trial.microphone.device.set(headset);
			expect(component.litLevelBars()).toBe(component.levelBars.length);
		});
	});

	describe('in the meeting settings where a second device cannot be captured', () => {
		let trial: { tryMicrophone: jasmine.Spy };

		beforeEach(() => {
			trial = { tryMicrophone: jasmine.createSpy('tryMicrophone') };
			create(trial, false);
		});

		it('switches the microphone at once when one is picked', async () => {
			await component.onMicrophoneSelected({ value: headset });

			expect(localMedia.switchMicrophone).toHaveBeenCalledOnceWith('mic-2');
			expect(deviceService.setMicSelected).toHaveBeenCalledOnceWith('mic-2');
			expect(trial.tryMicrophone).not.toHaveBeenCalled();
		});

		it('tells the participant that a pick reaches the others at once', () => {
			expect(component.switchesAtOnce).toBeTrue();
		});

		it('meters the published microphone', () => {
			localMedia.microphone.enabled.set(true);
			micLevel.set(0.5);

			expect(component.litLevelBars()).toBe(component.levelBars.length / 2);
		});
	});
});
