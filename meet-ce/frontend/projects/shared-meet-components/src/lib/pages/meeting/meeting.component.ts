import { Clipboard } from '@angular/cdk/clipboard';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { Component, computed, effect, inject, OnInit, Signal, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MeetRoom, MeetRoomMemberRole } from '@openvidu-meet/typings';
import {
	ParticipantService as ComponentParticipantService,
	OpenViduComponentsUiModule,
	OpenViduService,
	OpenViduThemeMode,
	OpenViduThemeService,
	Room,
	Track,
	ViewportService
} from 'openvidu-components-angular';
import { combineLatest, Subject, takeUntil } from 'rxjs';
import { MEETING_ACTION_HANDLER_TOKEN, MEETING_COMPONENTS_TOKEN, MeetingComponentsPlugins } from '../../customization';
import { CustomParticipantModel } from '../../models';
import { LobbyState } from '../../models/lobby.model';
import {
	ApplicationFeatures,
	FeatureConfigurationService,
	GlobalConfigService,
	MeetingEventHandlerService,
	MeetingLobbyService,
	MeetingPluginManagerService,
	MeetingService,
	NotificationService,
	RoomMemberService,
	WebComponentManagerService
} from '../../services';

@Component({
	selector: 'ov-meeting',
	templateUrl: './meeting.component.html',
	styleUrls: ['./meeting.component.scss'],
	imports: [
		OpenViduComponentsUiModule,
		CommonModule,
		FormsModule,
		ReactiveFormsModule,
		NgComponentOutlet,
		MatIconModule,
		MatProgressSpinnerModule
	],
	providers: [MeetingLobbyService, MeetingPluginManagerService, MeetingEventHandlerService]
})
export class MeetingComponent implements OnInit {
	lobbyState?: LobbyState;
	protected localParticipant = signal<CustomParticipantModel | undefined>(undefined);

	// Reactive signal for remote participants to trigger computed updates
	protected remoteParticipants = signal<CustomParticipantModel[]>([]);

	// Signal to track participant updates (role changes, etc.) that don't change array references
	protected participantsVersion = signal<number>(0);

	showPrejoin = true;
	prejoinReady = false;
	features: Signal<ApplicationFeatures>;

	// Injected plugins
	plugins: MeetingComponentsPlugins;

	protected meetingService = inject(MeetingService);
	protected participantService = inject(RoomMemberService);
	protected featureConfService = inject(FeatureConfigurationService);
	protected wcManagerService = inject(WebComponentManagerService);
	protected openviduService = inject(OpenViduService);
	protected ovComponentsParticipantService = inject(ComponentParticipantService);
	protected viewportService = inject(ViewportService);
	protected ovThemeService = inject(OpenViduThemeService);
	protected configService = inject(GlobalConfigService);
	protected clipboard = inject(Clipboard);
	protected notificationService = inject(NotificationService);
	protected lobbyService = inject(MeetingLobbyService);
	protected pluginManager = inject(MeetingPluginManagerService);

	// Public for direct template binding (uses arrow functions to preserve 'this' context)
	public eventHandler = inject(MeetingEventHandlerService);

	// Injected action handler (optional - falls back to default implementation)
	protected actionHandler = inject(MEETING_ACTION_HANDLER_TOKEN, { optional: true });
	protected destroy$ = new Subject<void>();

	constructor() {
		this.features = this.featureConfService.features;
		this.plugins = inject(MEETING_COMPONENTS_TOKEN, { optional: true }) || {};

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
	}

	// Computed signals for plugin inputs
	protected toolbarAdditionalButtonsInputs = computed(() =>
		this.pluginManager.getToolbarAdditionalButtonsInputs(this.features().canModerateRoom, this.isMobile, () =>
			this.handleCopySpeakerLink()
		)
	);

	protected toolbarLeaveButtonInputs = computed(() =>
		this.pluginManager.getToolbarLeaveButtonInputs(
			this.features().canModerateRoom,
			this.isMobile,
			() => this.openviduService.disconnectRoom(),
			() => this.endMeeting()
		)
	);

	protected participantPanelAfterLocalInputs = computed(() =>
		this.pluginManager.getParticipantPanelAfterLocalInputs(
			this.features().canModerateRoom,
			`${this.hostname}/room/${this.roomId}`,
			() => this.handleCopySpeakerLink()
		)
	);

	/**
	 * Inputs for custom layout component (CE or PRO)
	 * Includes additionalElementsComponent if provided via plugin
	 */
	protected layoutInputs = computed(() => {
		const showOverlay = this.onlyModeratorIsPresent;
		const meetingUrl = `${this.hostname}/room/${this.roomId}`;
		const onCopyLinkFn = () => this.handleCopySpeakerLink();
		const additionalElementsComponent = this.plugins.layoutAdditionalElements;
		return this.pluginManager.getLayoutInputs(showOverlay, meetingUrl, onCopyLinkFn, additionalElementsComponent);
	});

	protected lobbyInputs = computed(() => {
		if (!this.lobbyState) return {};
		return this.pluginManager.getLobbyInputs(
			this.lobbyState,
			this.hostname,
			this.features().canModerateRoom,
			() => this.submitAccessMeeting(),
			() => this.lobbyService.goToRecordings(),
			() => this.lobbyService.goBack(),
			() => this.handleCopySpeakerLink()
		);
	});

	protected participantPanelItemInputsMap = computed(() => {
		const local = this.localParticipant();
		const remotes = this.remoteParticipants();
		// Force reactivity by reading participantsVersion signal
		this.participantsVersion();
		const allParticipants: CustomParticipantModel[] = local ? [local, ...remotes] : remotes;

		const inputsMap = new Map<string, any>();
		for (const participant of allParticipants) {
			const inputs = this.pluginManager.getParticipantPanelItemInputs(
				participant,
				allParticipants,
				(p) => this.handleMakeModerator(p),
				(p) => this.handleUnmakeModerator(p),
				(p) => this.handleKickParticipant(p)
			);
			inputsMap.set(participant.identity, inputs);
		}

		return inputsMap;
	});

	get participantName(): string {
		return this.lobbyService.participantName;
	}
	get e2eeKey(): string {
		return this.lobbyService.e2eeKey;
	}

	get roomMemberToken(): string {
		return this.lobbyState!.roomMemberToken;
	}

	get room(): MeetRoom | undefined {
		return this.lobbyState?.room;
	}

	get roomName(): string {
		return this.lobbyState?.room?.roomName || 'Room';
	}

	get roomId(): string {
		return this.lobbyState?.roomId || '';
	}

	get roomSecret(): string {
		return this.lobbyState?.roomSecret || '';
	}

	set roomSecret(value: string) {
		if (this.lobbyState) {
			this.lobbyState.roomSecret = value;
		}
	}

	get onlyModeratorIsPresent(): boolean {
		return this.features().canModerateRoom && !this.hasRemoteParticipants;
	}

	get hasRemoteParticipants(): boolean {
		return this.remoteParticipants().length > 0;
	}

	get hasRecordings(): boolean {
		return this.lobbyState?.hasRecordings || false;
	}

	set hasRecordings(value: boolean) {
		if (this.lobbyState) {
			this.lobbyState.hasRecordings = value;
		}
	}

	get hostname(): string {
		return window.location.origin.replace('http://', '').replace('https://', '');
	}

	get isMobile(): boolean {
		return this.viewportService.isMobile();
	}

	async ngOnInit() {
		try {
			this.lobbyState = await this.lobbyService.initialize();
			this.prejoinReady = true;
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
	}

	async submitAccessMeeting() {
		try {
			await this.lobbyService.submitAccess();

			// The meeting view must be shown before loading the appearance config,
			// as it contains theme information that might be applied immediately
			// when the meeting view is rendered
			this.showPrejoin = false;
			await this.configService.loadRoomsAppearanceConfig();

			combineLatest([
				this.ovComponentsParticipantService.remoteParticipants$,
				this.ovComponentsParticipantService.localParticipant$
			])
				.pipe(takeUntil(this.destroy$))
				.subscribe(([participants, local]) => {
					this.remoteParticipants.set(participants as CustomParticipantModel[]);
					this.localParticipant.set(local as CustomParticipantModel);

					// Update action handler context if provided
					if (this.actionHandler) {
						this.actionHandler.roomId = this.roomId;
						this.actionHandler.roomSecret = this.roomSecret;
						this.actionHandler.localParticipant = this.localParticipant();
					}

					this.updateVideoPinState();
				});
		} catch (error) {
			console.error('Error accessing meeting:', error);
		}
	}

	onRoomCreated(room: Room) {
		this.eventHandler.setupRoomListeners(room, {
			roomId: this.roomId,
			roomSecret: this.roomSecret,
			participantName: this.participantName,
			localParticipant: () => this.localParticipant(),
			remoteParticipants: () => this.remoteParticipants(),
			onHasRecordingsChanged: (hasRecordings) => {
				this.hasRecordings = hasRecordings;
			},
			onRoomSecretChanged: (secret) => {
				this.roomSecret = secret;
			},
			onParticipantRoleUpdated: () => {
				// Increment version to trigger reactivity in participant panel items
				this.participantsVersion.update((v) => v + 1);
			}
		});
	}

	async leaveMeeting() {
		await this.openviduService.disconnectRoom();
	}

	async endMeeting() {
		if (!this.participantService.isModerator()) return;

		this.eventHandler.setMeetingEndedByMe(true);

		try {
			await this.meetingService.endMeeting(this.roomId);
		} catch (error) {
			console.error('Error ending meeting:', error);
		}
	}

	async onViewRecordingsClicked() {
		window.open(`/room/${this.roomId}/recordings?secret=${this.roomSecret}`, '_blank');
	}

	/**
	 * Centralized logic for managing video pinning based on
	 * remote participants and local screen sharing state.
	 */
	protected updateVideoPinState(): void {
		if (!this.localParticipant) return;

		const isSharing = this.localParticipant()?.isScreenShareEnabled;

		if (this.hasRemoteParticipants && isSharing) {
			// Pin the local screen share to appear bigger
			this.localParticipant()?.setVideoPinnedBySource(Track.Source.ScreenShare, true);
		} else {
			// Unpin everything if no remote participants or not sharing
			this.localParticipant()?.setAllVideoPinned(false);
		}
	}

	/**
	 * Event handler wrappers - delegates to actionHandler if provided, otherwise uses default implementation
	 */
	protected async handleKickParticipant(participant: CustomParticipantModel) {
		if (this.actionHandler) {
			await this.actionHandler.kickParticipant(participant);
		} else {
			// Default implementation
			if (!this.participantService.isModerator()) return;

			try {
				await this.meetingService.kickParticipant(this.roomId, participant.identity);
				console.log('Participant kicked successfully');
			} catch (error) {
				console.error('Error kicking participant:', error);
			}
		}
	}

	protected async handleMakeModerator(participant: CustomParticipantModel) {
		if (this.actionHandler) {
			await this.actionHandler.makeModerator(participant);
		} else {
			// Default implementation
			if (!this.participantService.isModerator()) return;

			try {
				await this.meetingService.changeParticipantRole(
					this.roomId,
					participant.identity,
					MeetRoomMemberRole.MODERATOR
				);
				console.log('Moderator assigned successfully');
			} catch (error) {
				console.error('Error assigning moderator:', error);
			}
		}
	}

	protected async handleUnmakeModerator(participant: CustomParticipantModel) {
		if (this.actionHandler) {
			await this.actionHandler.unmakeModerator(participant);
		} else {
			// Default implementation
			if (!this.participantService.isModerator()) return;

			try {
				await this.meetingService.changeParticipantRole(
					this.roomId,
					participant.identity,
					MeetRoomMemberRole.SPEAKER
				);
				console.log('Moderator unassigned successfully');
			} catch (error) {
				console.error('Error unassigning moderator:', error);
			}
		}
	}

	// private async handleCopyModeratorLink() {
	// 	if (this.actionHandler) {
	// 		await this.actionHandler.copyModeratorLink();
	// 	} else {
	// 		// Default implementation
	// 		try {
	// 			this.clipboard.copy(this.room!.moderatorUrl);
	// 			this.notificationService.showSnackbar('Moderator link copied to clipboard');

	// 			console.log('Moderator link copied to clipboard');
	// 		} catch (error) {
	// 			console.error('Failed to copy moderator link:', error);
	// 		}
	// 	}
	// }

	protected async handleCopySpeakerLink() {
		if (this.actionHandler) {
			await this.actionHandler.copySpeakerLink();
		} else {
			// Default implementation
			try {
				const speakerLink = this.room!.speakerUrl;
				this.clipboard.copy(speakerLink);
				this.notificationService.showSnackbar('Speaker link copied to clipboard');
				console.log('Speaker link copied to clipboard');
			} catch (error) {
				console.error('Failed to copy speaker link:', error);
			}
		}
	}
}
