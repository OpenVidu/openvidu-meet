import { Clipboard } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { Component, OnInit, Signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule, MatIconButton } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatRippleModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { ShareMeetingLinkComponent } from '@lib/components/share-meeting-link/share-meeting-link.component';
import { ErrorReason } from '@lib/models';
import { CustomParticipantModel } from '@lib/models/custom-participant.model';
import {
	AppDataService,
	ApplicationFeatures,
	AuthService,
	FeatureConfigurationService,
	GlobalConfigService,
	MeetingService,
	NavigationService,
	NotificationService,
	ParticipantService,
	RecordingService,
	RoomService,
	SessionStorageService,
	WebComponentManagerService
} from '@lib/services';
import {
	LeftEventReason,
	MeetRoom,
	MeetRoomStatus,
	ParticipantRole,
	WebComponentEvent,
	WebComponentOutboundEventMessage
} from '@lib/typings/ce';
import {
	MeetParticipantRoleUpdatedPayload,
	MeetRoomConfigUpdatedPayload,
	MeetSignalType
} from '@lib/typings/ce/event.model';
import {
	ApiDirectiveModule,
	ParticipantService as ComponentParticipantService,
	DataPacket_Kind,
	LeaveButtonDirective,
	OpenViduComponentsUiModule,
	OpenViduService,
	OpenViduThemeService,
	ParticipantLeftEvent,
	ParticipantLeftReason,
	ParticipantModel,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent,
	RemoteParticipant,
	Room,
	RoomEvent,
	Track,
	ViewportService
} from 'openvidu-components-angular';
import { combineLatest, Subject, takeUntil } from 'rxjs';

@Component({
	selector: 'ov-meeting',
	templateUrl: './meeting.component.html',
	styleUrls: ['./meeting.component.scss'],
	standalone: true,
	imports: [
		OpenViduComponentsUiModule,
		// ApiDirectiveModule,
		CommonModule,
		MatFormFieldModule,
		MatInputModule,
		FormsModule,
		ReactiveFormsModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatIconButton,
		MatMenuModule,
		MatDividerModule,
		MatTooltipModule,
		MatRippleModule,
		ShareMeetingLinkComponent
	]
})
export class MeetingComponent implements OnInit {
	participantForm = new FormGroup({
		name: new FormControl('', [Validators.required])
	});

	hasRecordings = false;
	showRecordingCard = false;
	roomClosed = false;

	showBackButton = true;
	backButtonText = 'Back';

	room?: MeetRoom;
	roomId = '';
	roomSecret = '';
	participantName = '';
	participantToken = '';
	localParticipant?: CustomParticipantModel;
	remoteParticipants: CustomParticipantModel[] = [];

	showMeeting = false;
	features: Signal<ApplicationFeatures>;
	meetingEndedByMe = false;

	private destroy$ = new Subject<void>();

	constructor(
		protected route: ActivatedRoute,
		protected roomService: RoomService,
		protected meetingService: MeetingService,
		protected participantService: ParticipantService,
		protected recordingService: RecordingService,
		protected featureConfService: FeatureConfigurationService,
		protected authService: AuthService,
		protected appDataService: AppDataService,
		protected sessionStorageService: SessionStorageService,
		protected wcManagerService: WebComponentManagerService,
		protected openviduService: OpenViduService,
		protected ovComponentsParticipantService: ComponentParticipantService,
		protected navigationService: NavigationService,
		protected notificationService: NotificationService,
		protected clipboard: Clipboard,
		protected viewportService: ViewportService,
		protected ovThemeService: OpenViduThemeService,
		protected configService: GlobalConfigService
	) {
		this.features = this.featureConfService.features;
	}

	get roomName(): string {
		return this.room?.roomName || 'Room';
	}

	get hostname(): string {
		return window.location.origin.replace('http://', '').replace('https://', '');
	}

	get isMobile(): boolean {
		return this.viewportService.isMobile();
	}

	async ngOnInit() {
		this.roomId = this.roomService.getRoomId();
		this.roomSecret = this.roomService.getRoomSecret();
		this.room = await this.roomService.getRoom(this.roomId);
		this.roomClosed = this.room.status === MeetRoomStatus.CLOSED;

		await this.setBackButtonText();
		await this.checkForRecordings();
		await this.initializeParticipantName();
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	/**
	 * Sets the back button text based on the application mode and user role
	 */
	private async setBackButtonText() {
		const isStandaloneMode = this.appDataService.isStandaloneMode();
		const redirection = this.navigationService.getLeaveRedirectURL();
		const isAdmin = await this.authService.isAdmin();

		if (isStandaloneMode && !redirection && !isAdmin) {
			// If in standalone mode, no redirection URL and not an admin, hide the back button
			this.showBackButton = false;
			return;
		}

		this.showBackButton = true;
		this.backButtonText = isStandaloneMode && !redirection && isAdmin ? 'Back to Rooms' : 'Back';
	}

	/**
	 * Checks if there are recordings in the room and updates the visibility of the recordings card.
	 *
	 * It is necessary to previously generate a recording token in order to list the recordings.
	 * If token generation fails or the user does not have sufficient permissions to list recordings,
	 * the error will be caught and the recordings card will be hidden (`showRecordingCard` will be set to `false`).
	 *
	 * If recordings exist, sets `showRecordingCard` to `true`; otherwise, to `false`.
	 */
	private async checkForRecordings() {
		try {
			const { canRetrieveRecordings } = await this.recordingService.generateRecordingToken(
				this.roomId,
				this.roomSecret
			);

			if (!canRetrieveRecordings) {
				this.showRecordingCard = false;
				return;
			}

			const { recordings } = await this.recordingService.listRecordings({
				maxItems: 1,
				roomId: this.roomId,
				fields: 'recordingId'
			});
			this.hasRecordings = recordings.length > 0;
			this.showRecordingCard = this.hasRecordings;
		} catch (error) {
			console.error('Error checking for recordings:', error);
			this.showRecordingCard = false;
		}
	}

	/**
	 * Initializes the participant name in the form control.
	 *
	 * Retrieves the participant name from the ParticipantTokenService first, and if not available,
	 * falls back to the authenticated username. Sets the retrieved name value in the
	 * participant form's 'name' control if a valid name is found.
	 *
	 * @returns A promise that resolves when the participant name has been initialized
	 */
	private async initializeParticipantName() {
		// Apply participant name from ParticipantTokenService if set, otherwise use authenticated username
		const currentParticipantName = this.participantService.getParticipantName();
		const username = await this.authService.getUsername();
		const participantName = currentParticipantName || username;

		if (participantName) {
			this.participantForm.get('name')?.setValue(participantName);
		}
	}

	async goToRecordings() {
		try {
			await this.navigationService.navigateTo(`room/${this.roomId}/recordings`, { secret: this.roomSecret });
		} catch (error) {
			console.error('Error navigating to recordings:', error);
		}
	}

	/**
	 * Handles the back button click event and navigates accordingly
	 * If in embedded mode, it closes the WebComponentManagerService
	 * If the redirect URL is set, it navigates to that URL
	 * If in standalone mode without a redirect URL, it navigates to the rooms page
	 */
	async goBack() {
		if (this.appDataService.isEmbeddedMode()) {
			this.wcManagerService.close();
		}

		const redirectTo = this.navigationService.getLeaveRedirectURL();
		if (redirectTo) {
			// Navigate to the specified redirect URL
			await this.navigationService.redirectToLeaveUrl();
			return;
		}

		if (this.appDataService.isStandaloneMode()) {
			// Navigate to rooms page
			await this.navigationService.navigateTo('/rooms');
		}
	}

	async submitAccessMeeting() {
		const { valid, value } = this.participantForm;
		if (!valid || !value.name?.trim()) {
			// If the form is invalid, do not proceed
			console.warn('Participant form is invalid. Cannot access meeting.');
			return;
		}

		this.participantName = value.name.trim();

		try {
			await this.generateParticipantToken();
			await this.addParticipantNameToUrl();
			await this.roomService.loadRoomConfig(this.roomId);
			this.showMeeting = true;

			const { appearance } = await this.configService.getRoomsAppearanceConfig();
			console.log('Loaded appearance config:', appearance);
			if (appearance.themes.length > 0 && appearance.themes[0].enabled) {
				const theme = appearance.themes[0];
				this.ovThemeService.updateThemeVariables({
					'--ov-primary-action-color': theme.primaryColor,
					'--ov-secondary-action-color': theme.secondaryColor,
					'--ov-background-color': theme.backgroundColor,
					'--ov-surface-color': theme.surfaceColor
				});
				this.features().showThemeSelector = false;
			} else {
				this.ovThemeService.resetThemeVariables();
				this.features().showThemeSelector = true;
			}

			combineLatest([
				this.ovComponentsParticipantService.remoteParticipants$,
				this.ovComponentsParticipantService.localParticipant$
			])
				.pipe(takeUntil(this.destroy$))
				.subscribe(([participants, local]) => {
					this.remoteParticipants = participants as CustomParticipantModel[];
					this.localParticipant = local as CustomParticipantModel;

					this.updateVideoPinState();
				});
		} catch (error) {
			console.error('Error accessing meeting:', error);
		}
	}

	/**
	 * Centralized logic for managing video pinning based on
	 * remote participants and local screen sharing state.
	 */
	private updateVideoPinState(): void {
		if (!this.localParticipant) return;

		const hasRemote = this.remoteParticipants.length > 0;
		const isSharing = this.localParticipant.isScreenShareEnabled;

		if (hasRemote && isSharing) {
			// Pin the local screen share to appear bigger
			this.localParticipant.setVideoPinnedBySource(Track.Source.ScreenShare, true);
		} else {
			// Unpin everything if no remote participants or not sharing
			this.localParticipant.setAllVideoPinned(false);
		}
	}

	/**
	 * Generates a participant token for joining a meeting.
	 *
	 * @throws When participant already exists in the room (status 409)
	 * @returns Promise that resolves when token is generated
	 */
	private async generateParticipantToken() {
		try {
			this.participantToken = await this.participantService.generateToken({
				roomId: this.roomId,
				secret: this.roomSecret,
				participantName: this.participantName
			});
			this.participantName = this.participantService.getParticipantName()!;
		} catch (error: any) {
			console.error('Error generating participant token:', error);
			switch (error.status) {
				case 400:
					// Invalid secret
					await this.navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM_SECRET, true);
					break;
				case 404:
					// Room not found
					await this.navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM, true);
					break;
				case 409:
					// Room is closed
					await this.navigationService.redirectToErrorPage(ErrorReason.CLOSED_ROOM, true);
					break;
				default:
					await this.navigationService.redirectToErrorPage(ErrorReason.INTERNAL_ERROR, true);
			}

			throw new Error('Error generating participant token');
		}
	}

	/**
	 * Add participant name as a query parameter to the URL
	 */
	private async addParticipantNameToUrl() {
		await this.navigationService.updateQueryParamsFromUrl(this.route.snapshot.queryParams, {
			'participant-name': this.participantName
		});
	}

	onRoomCreated(room: Room) {
		room.on(
			RoomEvent.DataReceived,
			async (payload: Uint8Array, _participant?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string) => {
				const event = JSON.parse(new TextDecoder().decode(payload));

				switch (topic) {
					case 'recordingStopped': {
						// If a 'recordingStopped' event is received and there was no previous recordings,
						// update the hasRecordings flag and refresh the recording token
						if (this.hasRecordings) return;

						this.hasRecordings = true;

						try {
							await this.recordingService.generateRecordingToken(this.roomId, this.roomSecret);
						} catch (error) {
							console.error('Error refreshing recording token:', error);
						}

						break;
					}
					case MeetSignalType.MEET_ROOM_CONFIG_UPDATED: {
						// Update room config
						const { config } = event as MeetRoomConfigUpdatedPayload;
						this.featureConfService.setRoomConfig(config);

						// Refresh recording token if recording is enabled
						if (config.recording.enabled) {
							try {
								await this.recordingService.generateRecordingToken(this.roomId, this.roomSecret);
							} catch (error) {
								console.error('Error refreshing recording token:', error);
							}
						}
						break;
					}
					case MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED: {
						// Update participant role
						const { participantIdentity, newRole, secret } = event as MeetParticipantRoleUpdatedPayload;

						if (participantIdentity === this.localParticipant!.identity) {
							if (!secret) return;

							this.roomSecret = secret;
							this.roomService.setRoomSecret(secret, false);

							try {
								await this.participantService.refreshParticipantToken({
									roomId: this.roomId,
									secret,
									participantName: this.participantName,
									participantIdentity
								});

								this.localParticipant!.meetRole = newRole;
								this.notificationService.showSnackbar(`You have been assigned the role of ${newRole}`);
							} catch (error) {
								console.error('Error refreshing participant token to update role:', error);
							}
						} else {
							const participant = this.remoteParticipants.find((p) => p.identity === participantIdentity);
							if (participant) {
								participant.meetRole = newRole;
							}
						}

						break;
					}
				}
			}
		);
	}

	onParticipantConnected(event: ParticipantModel) {
		const message: WebComponentOutboundEventMessage<WebComponentEvent.JOINED> = {
			event: WebComponentEvent.JOINED,
			payload: {
				roomId: event.getProperties().room?.name || '',
				participantIdentity: event.identity
			}
		};
		this.wcManagerService.sendMessageToParent(message);
	}

	async onParticipantLeft(event: ParticipantLeftEvent) {
		let leftReason = this.getReasonParamFromEvent(event.reason);
		if (leftReason === LeftEventReason.MEETING_ENDED && this.meetingEndedByMe) {
			leftReason = LeftEventReason.MEETING_ENDED_BY_SELF;
		}

		// Send LEFT event to the parent component
		const message: WebComponentOutboundEventMessage<WebComponentEvent.LEFT> = {
			event: WebComponentEvent.LEFT,
			payload: {
				roomId: event.roomName,
				participantIdentity: event.participantName,
				reason: leftReason
			}
		};
		this.wcManagerService.sendMessageToParent(message);

		// Remove the moderator secret from session storage if the participant left for a reason other than browser unload
		if (event.reason !== ParticipantLeftReason.BROWSER_UNLOAD) {
			this.sessionStorageService.removeRoomSecret(event.roomName);
		}

		// Navigate to the disconnected page with the reason
		await this.navigationService.navigateTo('disconnected', { reason: leftReason }, true);
	}

	/**
	 * Maps ParticipantLeftReason to LeftEventReason.
	 * This method translates the technical reasons for a participant leaving the room
	 * into user-friendly reasons that can be used in the UI or for logging purposes.
	 * @param reason The technical reason for the participant leaving the room.
	 * @returns The corresponding LeftEventReason.
	 */
	private getReasonParamFromEvent(reason: ParticipantLeftReason): LeftEventReason {
		const reasonMap: Record<ParticipantLeftReason, LeftEventReason> = {
			[ParticipantLeftReason.LEAVE]: LeftEventReason.VOLUNTARY_LEAVE,
			[ParticipantLeftReason.BROWSER_UNLOAD]: LeftEventReason.VOLUNTARY_LEAVE,
			[ParticipantLeftReason.NETWORK_DISCONNECT]: LeftEventReason.NETWORK_DISCONNECT,
			[ParticipantLeftReason.SIGNAL_CLOSE]: LeftEventReason.NETWORK_DISCONNECT,
			[ParticipantLeftReason.SERVER_SHUTDOWN]: LeftEventReason.SERVER_SHUTDOWN,
			[ParticipantLeftReason.PARTICIPANT_REMOVED]: LeftEventReason.PARTICIPANT_KICKED,
			[ParticipantLeftReason.ROOM_DELETED]: LeftEventReason.MEETING_ENDED,
			[ParticipantLeftReason.DUPLICATE_IDENTITY]: LeftEventReason.UNKNOWN,
			[ParticipantLeftReason.OTHER]: LeftEventReason.UNKNOWN
		};
		return reasonMap[reason] ?? LeftEventReason.UNKNOWN;
	}

	async leaveMeeting() {
		await this.openviduService.disconnectRoom();
	}

	async endMeeting() {
		if (!this.participantService.isModeratorParticipant()) return;

		this.meetingEndedByMe = true;

		try {
			await this.meetingService.endMeeting(this.roomId);
		} catch (error) {
			console.error('Error ending meeting:', error);
			this.notificationService.showSnackbar('Failed to end meeting');
		}
	}

	async kickParticipant(participant: CustomParticipantModel) {
		if (!this.participantService.isModeratorParticipant()) return;

		try {
			await this.meetingService.kickParticipant(this.roomId, participant.identity);
		} catch (error) {
			console.error('Error kicking participant:', error);
			this.notificationService.showSnackbar('Failed to kick participant');
		}
	}

	/**
	 * Makes a participant as moderator.
	 * @param participant The participant to make as moderator.
	 */
	async makeModerator(participant: CustomParticipantModel) {
		if (!this.participantService.isModeratorParticipant()) return;

		try {
			await this.meetingService.changeParticipantRole(
				this.roomId,
				participant.identity,
				ParticipantRole.MODERATOR
			);
		} catch (error) {
			console.error('Error making participant moderator:', error);
			this.notificationService.showSnackbar('Failed to make participant moderator');
		}
	}

	/**
	 * Unmakes a participant as moderator.
	 * @param participant The participant to unmake as moderator.
	 */
	async unmakeModerator(participant: CustomParticipantModel) {
		if (!this.participantService.isModeratorParticipant()) return;

		try {
			await this.meetingService.changeParticipantRole(this.roomId, participant.identity, ParticipantRole.SPEAKER);
		} catch (error) {
			console.error('Error unmaking participant moderator:', error);
			this.notificationService.showSnackbar('Failed to unmake participant moderator');
		}
	}

	async copyModeratorLink() {
		this.clipboard.copy(this.room!.moderatorUrl);
		this.notificationService.showSnackbar('Moderator link copied to clipboard');
	}

	async copySpeakerLink() {
		this.clipboard.copy(this.room!.speakerUrl);
		this.notificationService.showSnackbar('Speaker link copied to clipboard');
	}

	async onRecordingStartRequested(event: RecordingStartRequestedEvent) {
		try {
			await this.recordingService.startRecording(event.roomName);
		} catch (error: unknown) {
			if ((error as any).status === 503) {
				console.error(
					`No egress service was able to register a request.
Check your CPU usage or if there's any Media Node with enough CPU.
Remember that by default, a recording uses 4 CPUs for each room.`
				);
			} else {
				console.error(error);
			}
		}
	}

	async onRecordingStopRequested(event: RecordingStopRequestedEvent) {
		try {
			await this.recordingService.stopRecording(event.recordingId);
		} catch (error) {
			console.error(error);
		}
	}

	async onViewRecordingsClicked() {
		window.open(`/room/${this.roomId}/recordings?secret=${this.roomSecret}`, '_blank');
	}
}
