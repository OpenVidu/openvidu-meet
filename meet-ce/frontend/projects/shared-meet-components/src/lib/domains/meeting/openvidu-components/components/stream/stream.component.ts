import { Component, DestroyRef, effect, ElementRef, inject, Input, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatMenuPanel, MatMenuTrigger } from '@angular/material/menu';
import { ParticipantTrackPublication } from '../../models/participant.model';
import { CdkOverlayService } from '../../services/cdk-overlay/cdk-overlay.service';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { LayoutService } from '../../services/layout/layout.service';
import { Track } from '../../services/livekit/livekit-sdk.service';
import { ParticipantService } from '../../services/participant/participant.service';

/**
 * The **StreamComponent** is hosted inside of the {@link LayoutComponent}.
 * It is in charge of displaying the participant video stream in the videoconference layout.
 */
@Component({
	selector: 'ov-stream',
	templateUrl: './stream.component.html',
	styleUrls: ['./stream.component.scss'],
	standalone: false
})
export class StreamComponent implements OnInit, OnDestroy {
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
	_track: ParticipantTrackPublication | undefined;

	/**
	 * @ignore
	 */
	isMinimal: boolean = false;
	/**
	 * @ignore
	 */
	showParticipantName: boolean = true;
	/**
	 * @ignore
	 */
	showAudioDetection: boolean = true;
	/**
	 * @ignore
	 */
	showVideoControls: boolean = true;
	/**
	 * @ignore
	 */
	readonly showVideo = signal(false);
	/**
	 * @ignore
	 */
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

	@Input()
	set track(track: ParticipantTrackPublication) {
		this._track = track;
	}

	private _streamContainer: ElementRef | undefined;
	private readonly destroyRef = inject(DestroyRef);
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

	private readonly layoutService = inject(LayoutService);
	private readonly participantService = inject(ParticipantService);
	private readonly cdkSrv = inject(CdkOverlayService);
	private readonly libService = inject(OpenViduComponentsConfigService);

	ngOnInit() {
		this.subscribeToStreamDirectives();
	}

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

	private subscribeToStreamDirectives() {
		this.libService.minimal$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((value: boolean) => {
				this.isMinimal = value;
			});

		this.libService.displayParticipantName$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((value: boolean) => {
				this.showParticipantName = value;
			});

		this.libService.displayAudioDetection$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((value: boolean) => {
				this.showAudioDetection = value;
			});

		this.libService.streamVideoControls$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((value: boolean) => {
				this.showVideoControls = value;
			});
	}
}
