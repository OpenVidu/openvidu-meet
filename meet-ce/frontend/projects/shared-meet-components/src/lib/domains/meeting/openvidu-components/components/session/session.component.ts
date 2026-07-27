import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, ElementRef, inject, OnDestroy, OnInit, output, signal, viewChild } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { SidenavLayoutDirective } from '../../directives/layout/sidenav-layout.directive';
import { ParticipantLeftEvent, ParticipantLeftReason, ParticipantModel } from '../../models/participant.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ActionService } from '../../services/action/action.service';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { Room } from '../../services/livekit';
import { MeetingLiveKitService } from '../../services/meeting-livekit/meeting-livekit.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { SessionRoomEventsService } from '../../services/session/session-room-events.service';
import { TemplateRegistryService } from '../../services/template/template-registry.service';
import { MeetingTranslateService } from '../../services/translate/meeting-translate.service';
import { ViewportService } from '../../services/viewport/viewport.service';
import { VirtualBackgroundService } from '../../services/virtual-background/virtual-background.service';
import { LandscapeWarningComponent } from '../landscape-warning/landscape-warning.component';
import { LoggerService } from '../../../../../shared/services/logger.service';

/**
 * @internal
 */

@Component({
	selector: 'ov-session',
	imports: [
		MatProgressSpinnerModule,
		MatSidenavModule,
		TranslatePipe,
		LandscapeWarningComponent,
		NgTemplateOutlet,
		SidenavLayoutDirective
	],
	templateUrl: './session.component.html',
	styleUrls: ['./session.component.scss'],
	host: {
		'(window:beforeunload)': 'beforeunloadHandler()'
	}
})
export class SessionComponent implements OnInit, OnDestroy {
	/**
	 * Provides event notifications that fire when Room is created for the local participant.
	 */
	onRoomCreated = output<Room>();

	/**
	 * Provides event notifications that fire when Room is being reconnected for the local participant.
	 */
	onRoomReconnecting = output<void>();

	/**
	 * Provides event notifications that fire when Room is reconnected for the local participant.
	 */
	onRoomReconnected = output<void>();

	/**
	 * Provides event notifications that fire when local participant is connected to the Room.
	 */
	onParticipantConnected = output<ParticipantModel>();

	/**
	 * This event is emitted when the local participant leaves the room.
	 */
	onParticipantLeft = output<ParticipantLeftEvent>();

	room!: Room;
	readonly loading = signal(true);

	/**
	 * @internal
	 */
	private shouldDisconnectRoomWhenComponentIsDestroyed: boolean = true;
	private readonly actionService = inject(ActionService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);
	private readonly participantService = inject(ParticipantService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly panelService = inject(PanelService);
	private readonly translateService = inject(MeetingTranslateService);
	private readonly backgroundService = inject(VirtualBackgroundService);

	private readonly sessionRoomEventsService = inject(SessionRoomEventsService);
	protected readonly viewportService = inject(ViewportService);
	readonly templateRegistry = inject(TemplateRegistryService);
	readonly layoutContainerQuery = viewChild<ElementRef>('layoutContainer');
	private log = inject(LoggerService).get('SessionComponent');

	// Virtual background, not layout: the layout container entering the DOM is just the cue that the
	// in-call view is on screen and the stored background can be applied.
	private readonly applyStoredBackgroundEffect = effect(() => {
		const container = this.layoutContainerQuery();
		if (container) {
			// Use microtask instead of setTimeout for better performance
			Promise.resolve().then(async () => {
				if (container && this.libService.showBackgroundEffectsButton()) {
					// Apply background from storage when layout container is in DOM only when background effects button is enabled
					await this.backgroundService.applyBackgroundFromStorage();
				}
			});
		}
	});

	// Close background effects panel and remove background if the button is disabled
	private readonly backgroundEffectsEffect = effect(() => {
		const enabled = this.libService.backgroundEffectsButtonSignal();
		if (enabled) return;

		if (this.backgroundService.isBackgroundApplied()) {
			void this.backgroundService.removeBackground().then(() => {
				if (this.panelService.isBackgroundEffectsPanelOpened()) {
					this.panelService.closePanel();
				}
			});
		}
	});

	beforeunloadHandler() {
		this.disconnectRoom(ParticipantLeftReason.BROWSER_UNLOAD);
	}

	async ngOnInit() {
		this.shouldDisconnectRoomWhenComponentIsDestroyed = true;

		// Check if room is available before proceeding
		if (!this.meetingLiveKitService.isInitialized()) {
			this.log.e('Room is not initialized when SessionComponent starts. This indicates a timing issue.');
			this.showStartupError('ERRORS.MEETING_NOT_READY');
			return;
		}

		// Get room instance
		try {
			this.room = this.meetingLiveKitService.getRoom();
			this.log.d('Room successfully obtained for SessionComponent');
		} catch (error: unknown) {
			this.log.e('Unexpected error getting room:', error);
			this.showStartupError('ERRORS.MEETING_NOT_READY');
			return;
		}
		this.sessionRoomEventsService.bindRoom(this.room, {
			onRoomReconnecting: () => this.onRoomReconnecting.emit(),
			onRoomReconnected: () => this.onRoomReconnected.emit(),
			onParticipantLeft: (event) => this.onParticipantLeft.emit(event)
		});

		try {
			await this.participantService.connect();
			// Send room created after participant connect for avoiding to send incomplete room payload
			this.onRoomCreated.emit(this.room);

			this.loading.set(false);
			const localParticipant = this.participantService.localParticipant();
			if (localParticipant) {
				this.onParticipantConnected.emit(localParticipant);
			}
		} catch (error: any) {
			// The technical detail goes to the log; the user gets a translated, actionable message.
			this.log.e('There was an error connecting to the meeting:', error?.code, error?.message, error);
			this.showStartupError('ERRORS.MEETING_CONNECTION_FAILED');
		}
	}

	/**
	 * Single policy for the errors that prevent the meeting from starting: same translated title,
	 * a translated message keyed by cause, and never the raw error — which used to leak LiveKit
	 * internals into the dialog. Callers are responsible for logging the technical detail.
	 */
	private showStartupError(messageKey: string): void {
		this.actionService.openDialog(
			this.translateService.translate('ERRORS.SESSION'),
			this.translateService.translate(messageKey)
		);
	}

	async ngOnDestroy() {
		if (this.shouldDisconnectRoomWhenComponentIsDestroyed) {
			await this.disconnectRoom(ParticipantLeftReason.LEAVE);
		}
		if (this.room) this.room.removeAllListeners();
		this.participantService.clear();
	}

	async disconnectRoom(reason: ParticipantLeftReason) {
		// Mark session as disconnected for avoiding to do it again in ngOnDestroy
		this.shouldDisconnectRoomWhenComponentIsDestroyed = false;
		await this.meetingLiveKitService.disconnect(() => {
			this.onParticipantLeft.emit({
				roomName: this.meetingLiveKitService.getRoomName(),
				participantName: this.participantService.getMyName() || '',
				identity: this.participantService.getMyIdentity() || '',
				reason
			});
		}, false);
	}
}
