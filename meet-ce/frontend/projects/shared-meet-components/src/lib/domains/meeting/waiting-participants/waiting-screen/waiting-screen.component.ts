import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, computed, DestroyRef, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MeetWaitingParticipantStatus } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import { AudioDevicesComponent } from '../../openvidu-components/components/settings/audio-devices/audio-devices.component';
import { VideoDevicesComponent } from '../../openvidu-components/components/settings/video-devices/video-devices.component';
import { VideoElementComponent } from '../../openvidu-components/components/video-element/video-element.component';
import { AvatarView } from '../../openvidu-components/models/avatar-view.model';
import { MeetingUiConfigService } from '../../openvidu-components/services/config/meeting-ui-config.service';
import { LocalMediaService } from '../../openvidu-components/services/local-media/local-media.service';
import { WaitingParticipantService } from '../waiting-participant.service';

const CLOCK_TICK_MS = 15_000;

/**
 * What the participant sees while they wait to be let in: how long they have waited, the room's message
 * and the preview of their camera and microphone, which they join with.
 */
@Component({
	selector: 'ov-waiting-screen',
	imports: [
		MatButtonModule,
		MatIconModule,
		TranslatePipe,
		VideoElementComponent,
		VideoDevicesComponent,
		AudioDevicesComponent
	],
	templateUrl: './waiting-screen.component.html',
	styleUrl: './waiting-screen.component.scss'
})
export class WaitingScreenComponent implements OnInit {
	private readonly waitingParticipant = inject(WaitingParticipantService);
	private readonly localMedia = inject(LocalMediaService);
	private readonly uiConfig = inject(MeetingUiConfigService);
	private readonly liveAnnouncer = inject(LiveAnnouncer);
	private readonly translateService = inject(TranslateService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - WaitingScreenComponent');

	protected readonly meetingActive = this.waitingParticipant.meetingActive;
	protected readonly message = this.waitingParticipant.message;
	protected readonly isReconnecting = this.waitingParticipant.isReconnecting;
	protected readonly showCameraControls = this.uiConfig.showCameraControlsSignal;
	protected readonly showMicrophoneControls = this.uiConfig.showMicrophoneControlsSignal;
	protected readonly videoTrack = this.localMedia.camera.track;
	protected readonly avatar = computed<AvatarView>(() => ({
		show: !this.localMedia.camera.enabled(),
		name: this.uiConfig.participantNameSignal() ?? '',
		color: 'hsl(48, 100%, 50%)',
		isSpeaking: false,
		hasEncryptionError: false
	}));
	protected readonly deviceErrorKey = signal<string | undefined>(undefined);

	private readonly now = signal(Date.now());
	protected readonly minutesWaited = computed(() => {
		const knockedAt = this.waitingParticipant.knockedAt();
		return knockedAt === undefined ? 0 : Math.floor((this.now() - knockedAt) / 60_000);
	});

	constructor() {
		const clock = setInterval(() => this.now.set(Date.now()), CLOCK_TICK_MS);
		inject(DestroyRef).onDestroy(() => clearInterval(clock));
		this.announce('WAITING_PARTICIPANTS.TITLE', 'polite');

		effect(() => {
			if (this.waitingParticipant.status() === MeetWaitingParticipantStatus.ADMITTED) {
				untracked(() => this.announce('WAITING_PARTICIPANTS.ADMITTED', 'assertive'));
			}
		});
	}

	async ngOnInit(): Promise<void> {
		try {
			await this.localMedia.acquire();
			this.deviceErrorKey.set(this.localMedia.unavailableDevicesMessageKey());
		} catch (error) {
			this.log.e('Could not open the camera and microphone while waiting:', error);
			this.deviceErrorKey.set('ERRORS.DEVICES_UNAVAILABLE');
		}
	}

	protected leave(): void {
		this.waitingParticipant.leave();
	}

	private announce(key: string, politeness: 'polite' | 'assertive'): void {
		this.liveAnnouncer.announce(this.translateService.translate(key), politeness).catch(() => undefined);
	}
}
