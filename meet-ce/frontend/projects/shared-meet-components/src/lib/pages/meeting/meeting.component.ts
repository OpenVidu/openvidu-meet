import { CommonModule } from '@angular/common';
import { Component, computed, ContentChild, effect, inject, OnInit, Signal, signal, TemplateRef } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
	OpenViduComponentsUiModule,
	OpenViduService,
	OpenViduThemeMode,
	OpenViduThemeService,
	Room,
	Track,
	ViewportService
} from 'openvidu-components-angular';
import { Subject } from 'rxjs';
import { MeetingParticipantItemComponent } from '../../customization';
import {
	FeatureConfigurationService,
	GlobalConfigService,
	MeetingContextService,
	MeetingEventHandlerService,
	MeetingLobbyService,
	MeetingService,
	NotificationService,
	RoomMemberService,
	WebComponentManagerService
} from '../../services';
import { MeetingLobbyComponent } from '../../components/meeting-lobby/meeting-lobby.component';
import { ApplicationFeatures } from '../../models/app.model';

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
	providers: [MeetingLobbyService, MeetingEventHandlerService]
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

	protected features: Signal<ApplicationFeatures>;
	protected meetingService = inject(MeetingService);
	protected participantService = inject(RoomMemberService);
	protected featureConfService = inject(FeatureConfigurationService);
	protected wcManagerService = inject(WebComponentManagerService);
	protected openviduService = inject(OpenViduService);
	protected viewportService = inject(ViewportService);
	protected ovThemeService = inject(OpenViduThemeService);
	protected configService = inject(GlobalConfigService);
	protected notificationService = inject(NotificationService);
	protected lobbyService = inject(MeetingLobbyService);
	protected meetingContextService = inject(MeetingContextService);
	protected eventHandlerService = inject(MeetingEventHandlerService);
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
		this.features = this.featureConfService.features;

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
				await this.configService.loadRoomsAppearanceConfig();
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
		window.open(`/room/${this.roomId()}/recordings?secret=${this.roomSecret()}`, '_blank');
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
