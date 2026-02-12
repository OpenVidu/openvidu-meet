import { CommonModule } from '@angular/common';
import { Component, computed, ContentChild, effect, inject, OnInit, signal, Signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
	OpenViduComponentsUiModule,
	OpenViduThemeMode,
	OpenViduThemeService,
	Room,
	Track
} from 'openvidu-components-angular';
import { Subject } from 'rxjs';
import { RoomFeatures } from '../../../../shared/models/app.model';
import { GlobalConfigService } from '../../../../shared/services/global-config.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RoomFeatureService } from '../../../../shared/services/room-feature.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { SoundService } from '../../../../shared/services/sound.service';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { MeetingLobbyComponent } from '../../components/meeting-lobby/meeting-lobby.component';
import { MeetingParticipantItemComponent } from '../../customization/meeting-participant-item/meeting-participant-item.component';
import { MeetingCaptionsService } from '../../services/meeting-captions.service';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingEventHandlerService } from '../../services/meeting-event-handler.service';
import { MeetingLobbyService } from '../../services/meeting-lobby.service';

@Component({
	selector: 'ov-meeting',
	templateUrl: './meeting.component.html',
	styleUrls: ['./meeting.component.scss'],
	imports: [
		OpenViduComponentsUiModule,
		CommonModule,
		FormsModule,
		ReactiveFormsModule,
		MatIconModule,
		MatProgressSpinnerModule,
		MeetingLobbyComponent
	],
	providers: [MeetingLobbyService, MeetingEventHandlerService, SoundService]
})
export class MeetingComponent implements OnInit {
	protected _participantItem?: MeetingParticipantItemComponent;

	// Template reference for custom participant panel item
	@ContentChild(MeetingParticipantItemComponent)
	set participantItem(value: MeetingParticipantItemComponent | undefined) {
		// Store the reference to the custom participant panel item component
		this._participantItem = value;
	}
	protected participantItemTemplate = computed(() => this._participantItem?.template);

	/**
	 * Controls whether to show lobby (true) or meeting view (false)
	 */
	showLobby = true;
	isLobbyReady = false;

	/**
	 * Controls whether to show the videoconference component
	 */
	protected isMeetingLeft = signal(false);

	protected features: Signal<RoomFeatures>;
	protected roomMemberContextService = inject(RoomMemberContextService);
	protected roomFeatureService = inject(RoomFeatureService);
	protected ovThemeService = inject(OpenViduThemeService);
	protected configService = inject(GlobalConfigService);
	protected notificationService = inject(NotificationService);
	protected lobbyService = inject(MeetingLobbyService);
	protected meetingContextService = inject(MeetingContextService);
	protected eventHandlerService = inject(MeetingEventHandlerService);
	protected captionsService = inject(MeetingCaptionsService);
	protected soundService = inject(SoundService);
	protected runtimeConfigService = inject(RuntimeConfigService);
	protected destroy$ = new Subject<void>();

	// === LOBBY PHASE COMPUTED SIGNALS (when showLobby = true) ===
	protected participantName = computed(() => this.lobbyService.participantName());
	protected e2eeKey = computed(() => this.lobbyService.e2eeKeyValue());
	protected roomName = computed(() => this.lobbyService.roomName());
	protected roomMemberToken = computed(() => this.lobbyService.roomMemberToken());

	// === MEETING PHASE COMPUTED SIGNALS (when showLobby = false) ===
	// These read from MeetingContextService (Single Source of Truth during meeting)
	protected localParticipant = computed(() => this.meetingContextService.localParticipant());
	protected remoteParticipants = computed(() => this.meetingContextService.remoteParticipants());
	protected hasRemoteParticipants = computed(() => this.remoteParticipants().length > 0);
	protected participantsVersion = computed(() => this.meetingContextService.participantsVersion());

	// === SHARED COMPUTED SIGNALS (used in both phases) ===
	// Both lobby and meeting need these, so we read from MeetingContextService (Single Source of Truth)
	protected roomId = computed(() => this.meetingContextService.roomId());
	protected roomSecret = computed(() => this.meetingContextService.roomSecret());
	protected hasRecordings = computed(() => this.meetingContextService.hasRecordings());

	constructor() {
		this.features = this.roomFeatureService.features;

		// Change theme variables when custom theme is enabled
		effect(() => {
			if (this.features().hasCustomTheme) {
				const theme = this.features().themeConfig;
				this.ovThemeService.setTheme(theme!.baseTheme as unknown as OpenViduThemeMode);
				this.ovThemeService.updateThemeVariables({
					'--ov-primary-action-color': theme?.primaryColor,
					'--ov-secondary-action-color': theme?.secondaryColor,
					'--ov-accent-action-color': theme?.accentColor,
					'--ov-background-color': theme?.backgroundColor,
					'--ov-surface-color': theme?.surfaceColor
				});
			} else {
				this.ovThemeService.resetThemeVariables();
			}
		});

		// Observe lobby state changes reactively
		// When roomMemberToken is set, transition from lobby to meeting
		effect(async () => {
			const token = this.roomMemberToken();
			if (token && this.showLobby) {
				// The meeting view must be shown before loading the appearance config
				this.showLobby = false;
				await Promise.all([
					this.configService.loadRoomsAppearanceConfig(),
					this.configService.loadCaptionsConfig()
				]);
			}
		});
	}

	async ngOnInit() {
		try {
			await this.lobbyService.initialize();
			this.isLobbyReady = true;
		} catch (error) {
			console.error('Error initializing lobby state:', error);
			this.notificationService.showDialog({
				title: 'Error',
				message: 'An error occurred while initializing the meeting lobby. Please try again later.',
				showCancelButton: false,
				confirmText: 'OK'
			});
		}
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();

		// Clear meeting context when component is destroyed
		this.meetingContextService.clearContext();

		// Cleanup captions service
		this.captionsService.destroy();
	}

	// async onRoomConnected() {
	// 	try {
	// 		// Suscribirse solo para actualizar el estado de video pin
	// 		// Los participantes se actualizan automáticamente en MeetingContextService
	// 		combineLatest([
	// 			this.ovComponentsParticipantService.remoteParticipants$,
	// 			this.ovComponentsParticipantService.localParticipant$
	// 		])
	// 			.pipe(takeUntil(this.destroy$))
	// 			.subscribe(() => {
	// 		this.updateVideoPinState();
	// 		});
	// 	} catch (error) {
	// 		console.error('Error accessing meeting:', error);
	// 	}
	// }

	onRoomCreated(lkRoom: Room) {
		// At this point, user has joined the meeting and MeetingContextService becomes the Single Source of Truth
		// MeetingContextService has been updated during lobby initialization with roomId, roomSecret, hasRecordings
		// All subsequent updates (hasRecordings, roomSecret, participants) go to MeetingContextService

		// Store LiveKit room in context
		this.meetingContextService.setLkRoom(lkRoom);

		// Initialize captions service
		this.captionsService.initialize(lkRoom, {
			maxVisibleCaptions: 3,
			finalCaptionDuration: 5000,
			interimCaptionDuration: 3000,
			showInterimTranscriptions: true
		});

		// Setup LK room event listeners
		this.eventHandlerService.setupRoomListeners(lkRoom);
	}

	// async leaveMeeting() {
	// 	await this.openviduService.disconnectRoom();
	// }

	// async endMeeting() {
	// 	if (!this.participantService.isModerator()) return;

	// 	this.meetingContextService.setMeetingEndedBy('self');

	// 	try {
	// 		await this.meetingService.endMeeting(this.roomId()!);
	// 	} catch (error) {
	// 		console.error('Error ending meeting:', error);
	// 	}
	// }

	async onViewRecordingsClicked() {
		const basePath = this.runtimeConfigService.basePath;
		const basePathForUrl = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
		let recordingsUrl = `${basePathForUrl}/room/${this.roomId()}/recordings`;

		// Append room secret as query param if it exists
		const secret = this.roomSecret();
		if (secret) {
			recordingsUrl += `?secret=${secret}`;
		}

		window.open(recordingsUrl, '_blank');
	}

	onParticipantConnected(event: any): void {
		// Play joined sound
		this.soundService.playParticipantJoinedSound();
		this.eventHandlerService.onParticipantConnected(event);
	}

	/**
	 * Handles the participant left event and hides the videoconference component
	 */
	protected onParticipantLeft(event: any): void {
		this.isMeetingLeft.set(true);
		this.eventHandlerService.onParticipantLeft(event);
	}

	/**
	 * Centralized logic for managing video pinning based on
	 * remote participants and local screen sharing state.
	 */
	protected updateVideoPinState(): void {
		const localParticipant = this.localParticipant();
		if (!localParticipant) return;

		const isSharing = localParticipant.isScreenShareEnabled;

		if (this.hasRemoteParticipants() && isSharing) {
			// Pin the local screen share to appear bigger
			localParticipant.setVideoPinnedBySource(Track.Source.ScreenShare, true);
		} else {
			// Unpin everything if no remote participants or not sharing
			localParticipant.setAllVideoPinned(false);
		}
	}
}
