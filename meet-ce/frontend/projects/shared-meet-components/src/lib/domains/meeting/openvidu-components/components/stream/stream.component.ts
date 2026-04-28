import { CommonModule } from '@angular/common';
import { Component, effect, ElementRef, inject, input, OnDestroy, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuPanel, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParticipantTrackPublication } from '../../models/participant.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { CdkOverlayService } from '../../services/cdk-overlay/cdk-overlay.service';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { LayoutService } from '../../services/layout/layout.service';
import { Track } from '../../services/livekit-adapter';
import { ParticipantService } from '../../services/participant/participant.service';
import { AudioWaveComponent } from '../audio-wave/audio-wave.component';
import { MediaElementComponent } from '../media-element/media-element.component';

/**
 * The **StreamComponent** is hosted inside of the {@link LayoutComponent}.
 * It is in charge of displaying the participant video stream in the videoconference layout.
 */
@Component({
	selector: 'ov-stream',
	imports: [
		CommonModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		TranslatePipe,
		AudioWaveComponent,
		MediaElementComponent
	],
	templateUrl: './stream.component.html',
	styleUrls: ['./stream.component.scss'],
	standalone: true
})
export class StreamComponent implements OnDestroy {
	private readonly layoutService = inject(LayoutService);
	private readonly participantService = inject(ParticipantService);
	private readonly cdkSrv = inject(CdkOverlayService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	readonly trackInput = input<ParticipantTrackPublication | undefined>(undefined, { alias: 'track' });

	/**
	 * @ignore
	 */
	readonly menuTriggerQuery = viewChild(MatMenuTrigger);
	public menuTrigger: MatMenuTrigger | undefined = undefined;

	/**
	 * @ignore
	 */
	readonly menuQuery = viewChild<MatMenuPanel>('menu');
	menu: MatMenuPanel | undefined = undefined;

	/**
	 * @ignore
	 */
	videoTypeEnum = Track.Source;

	/**
	 * @ignore
	 */
	get _track(): ParticipantTrackPublication | undefined {
		return this.trackInput();
	}

	readonly showParticipantName = this.libService.displayParticipantNameSignal;
	readonly showAudioDetection = this.libService.displayAudioDetectionSignal;
	readonly showVideoControls = this.libService.streamVideoControlsSignal;
	readonly showVideo = signal(false);

	isFullscreen: boolean = false;

	/**
	 * @ignore
	 */
	mouseHovering: boolean = false;

	/**
	 * @ignore
	 */
	hoveringTimeout: ReturnType<typeof setTimeout> | undefined;
	private showVideoTimeout: ReturnType<typeof setTimeout> | undefined;

	/**
	 * @ignore
	 */
	readonly streamContainerQuery = viewChild('streamContainer', { read: ElementRef });

	private _streamContainer: ElementRef | undefined;
	private readonly HOVER_TIMEOUT = 2000;
	private readonly NO_SIZE_TIMEOUT = 100;
	private readonly querySyncEffect = effect(() => {
		this.menuTrigger = this.menuTriggerQuery();
		this.menu = this.menuQuery();
		const streamContainer = this.streamContainerQuery();
		if (streamContainer) {
			this._streamContainer = streamContainer;
			if (this.showVideoTimeout) {
				clearTimeout(this.showVideoTimeout);
			}
			this.showVideoTimeout = setTimeout(() => {
				this.showVideo.set(true);
			}, this.NO_SIZE_TIMEOUT);
		}
	});

	ngOnDestroy() {
		if (this.showVideoTimeout) {
			clearTimeout(this.showVideoTimeout);
		}
		if (this.hoveringTimeout) {
			clearTimeout(this.hoveringTimeout);
		}
		this.cdkSrv.setSelector('body');
	}

	/**
	 * @ignore
	 */
	toggleVideoPinned() {
		const activeTrack = this._track;
		const sid = activeTrack?.trackSid;
		if (activeTrack?.participant) {
			if (activeTrack.participant.isLocal) {
				if (activeTrack.participant.isMinimized) {
					this.participantService.toggleMyVideoMinimized(sid);
				}
				this.participantService.toggleMyVideoPinned(sid);
			} else {
				this.participantService.toggleRemoteVideoPinned(sid);
			}
		}
		this.layoutService.update();
	}

	/**
	 * @ignore
	 */
	toggleMinimize() {
		const activeTrack = this._track;
		const sid = activeTrack?.trackSid;
		if (activeTrack?.participant && activeTrack.participant.isLocal) {
			this.participantService.toggleMyVideoMinimized(sid);
			this.layoutService.update();
		}
	}

	/**
	 * @ignore
	 */
	toggleVideoMenu(event: MouseEvent) {
		const trigger = this.menuTrigger;
		if (!trigger) return;
		if (trigger.menuOpen) {
			trigger.closeMenu();
			return;
		}
		this.cdkSrv.setSelector('#container-' + this._track?.trackSid);
		trigger.openMenu();
	}

	/**
	 * @ignore
	 */
	toggleMuteForcibly() {
		const activeTrack = this._track;
		if (activeTrack?.participant) {
			this.participantService.setRemoteMutedForcibly(activeTrack.participant.sid, !activeTrack.isMutedForcibly);
		}
	}

	/**
	 * @ignore
	 */
	mouseHover(event: MouseEvent) {
		event.preventDefault();
		clearTimeout(this.hoveringTimeout);
		this.mouseHovering = true;
		this.hoveringTimeout = setTimeout(() => {
			this.mouseHovering = false;
		}, this.HOVER_TIMEOUT);
	}
}
