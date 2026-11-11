import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, computed, DestroyRef, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MeetLobbyStatus } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import { AudioDevicesComponent } from '../../openvidu-components/components/settings/audio-devices/audio-devices.component';
import { VideoDevicesComponent } from '../../openvidu-components/components/settings/video-devices/video-devices.component';
import { VideoElementComponent } from '../../openvidu-components/components/video-element/video-element.component';
import { AvatarView } from '../../openvidu-components/models/avatar-view.model';
import { MeetingUiConfigService } from '../../openvidu-components/services/config/meeting-ui-config.service';
import { LocalMediaService } from '../../openvidu-components/services/local-media/local-media.service';
import { WaitingRoomService } from '../waiting-room.service';

/** Screen readers hear the place in line at most this often. */
const POSITION_ANNOUNCEMENT_INTERVAL_MS = 10_000;
const CLOCK_TICK_MS = 15_000;

/**
 * What the participant sees while they wait to be let in: their place in line, how long they have
 * waited, the room's message and the preview of their camera and microphone, which they join with.
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
	private readonly waitingRoom = inject(WaitingRoomService);
	private readonly localMedia = inject(LocalMediaService);
	private readonly uiConfig = inject(MeetingUiConfigService);
	private readonly liveAnnouncer = inject(LiveAnnouncer);
	private readonly translateService = inject(TranslateService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - WaitingScreenComponent');

	protected readonly queuePosition = this.waitingRoom.queuePosition;
	protected readonly meetingActive = this.waitingRoom.meetingActive;
	protected readonly message = this.waitingRoom.message;
	protected readonly isReconnecting = this.waitingRoom.isReconnecting;
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
		const knockedAt = this.waitingRoom.knockedAt();
		return knockedAt === undefined ? 0 : Math.floor((this.now() - knockedAt) / 60_000);
	});

	private lastPositionAnnouncedAt = 0;
	private positionAnnouncement?: ReturnType<typeof setTimeout>;

	constructor() {
		const clock = setInterval(() => this.now.set(Date.now()), CLOCK_TICK_MS);
		inject(DestroyRef).onDestroy(() => {
			clearInterval(clock);
			clearTimeout(this.positionAnnouncement);
		});

		effect(() => {
			const position = this.queuePosition();

			if (position !== undefined) untracked(() => this.announcePosition(position));
		});

		effect(() => {
			if (this.waitingRoom.status() === MeetLobbyStatus.ADMITTED) {
				untracked(() => this.announce('WAITING_ROOM.ADMITTED', 'assertive'));
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
		this.waitingRoom.leave();
	}

	/** The latest place is announced once the interval since the previous announcement has passed. */
	private announcePosition(position: number): void {
		clearTimeout(this.positionAnnouncement);

		const announce = () => {
			this.lastPositionAnnouncedAt = Date.now();
			this.announce('WAITING_ROOM.POSITION', 'polite', position);
		};

		const delayMs = this.lastPositionAnnouncedAt + POSITION_ANNOUNCEMENT_INTERVAL_MS - Date.now();

		if (delayMs <= 0) {
			announce();
		} else {
			this.positionAnnouncement = setTimeout(announce, delayMs);
		}
	}

	private announce(key: string, politeness: 'polite' | 'assertive', position?: number): void {
		const text = this.translateService.translate(key, position === undefined ? undefined : { position });
		this.liveAnnouncer.announce(text, politeness).catch(() => undefined);
	}
}
