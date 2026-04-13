import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatMenuPanel, MatMenuTrigger } from '@angular/material/menu';
import { Track } from 'livekit-client';
import { Subject, takeUntil } from 'rxjs';
import { ParticipantTrackPublication } from '../../models/participant.model';
import { CdkOverlayService } from '../../services/cdk-overlay/cdk-overlay.service';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { LayoutService } from '../../services/layout/layout.service';
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
	@ViewChild(MatMenuTrigger) public menuTrigger: MatMenuTrigger | undefined = undefined;

	/**
	 * @ignore
	 */
	@ViewChild('menu') menu: MatMenuPanel | undefined = undefined;

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
	showVideo: boolean = false;
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

	/**
	 * @ignore
	 */
	@ViewChild('streamContainer', { static: false, read: ElementRef })
	set streamContainer(streamContainer: ElementRef) {
		setTimeout(() => {
			if (streamContainer) {
				this._streamContainer = streamContainer;
				// This is a workaround for fixing a layout bug which provide a bad UX with each new elements created.
				setTimeout(() => {
					this.showVideo = true;
				}, 100);
			}
		}, 0);
	}

	@Input()
	set track(track: ParticipantTrackPublication) {
		this._track = track;
	}

	private _streamContainer: ElementRef | undefined;
	private destroy$ = new Subject<void>();
	private readonly HOVER_TIMEOUT = 2000;

	/**
	 * @ignore
	 */
	constructor(
		private layoutService: LayoutService,
		private participantService: ParticipantService,
		private cdkSrv: CdkOverlayService,
		private libService: OpenViduComponentsConfigService
	) {}

	ngOnInit() {
		this.subscribeToStreamDirectives();
	}

	ngOnDestroy() {
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
			.pipe(takeUntil(this.destroy$))
			.subscribe((value: boolean) => {
				this.isMinimal = value;
			});

		this.libService.displayParticipantName$
			.pipe(takeUntil(this.destroy$))
			.subscribe((value: boolean) => {
				this.showParticipantName = value;
				// this.cd.markForCheck();
			});

		this.libService.displayAudioDetection$
			.pipe(takeUntil(this.destroy$))
			.subscribe((value: boolean) => {
				this.showAudioDetection = value;
				// this.cd.markForCheck();
			});

		this.libService.streamVideoControls$
			.pipe(takeUntil(this.destroy$))
			.subscribe((value: boolean) => {
				this.showVideoControls = value;
				// this.cd.markForCheck();
			});
	}
}
