import { Injectable, effect, inject, untracked } from '@angular/core';
import {
	EmbeddedEventName,
	LeftEventReason,
	MeetEventOrigin,
	MeetMeetingEndedByModeratorPayload,
	MeetMeetingEndingSoonPayload,
	MeetParticipantMediaMutedPayload,
	MeetParticipantPermissionsUpdatedPayload,
	MeetParticipantRoleUpdatedPayload,
	MeetRecordingStatus,
	MeetRecordingUpdatedPayload,
	MeetRoomMemberTokenOptions,
	MeetRoomMemberUIBadge,
	MeetSignalType
} from '@openvidu-meet/typings';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { TranslateService } from '../../../shared/services/i18n/translate.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { SoundService } from '../../../shared/services/sound.service';
import { EmbeddedEventBusService } from '../../embedded/services/embedded-event-bus.service';
import { RecordingService } from '../../recordings/services/recording.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomFeatureService } from '../../rooms/services/room-feature.service';
import type {
	DataPacket_Kind,
	LocalParticipant,
	ParticipantLeftEvent,
	ParticipantModel,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent,
	RemoteParticipant,
	Room
} from '../openvidu-components';
import {
	LocalMediaControlService,
	LocalMediaIntentService,
	LocalMediaStateService,
	MeetingEndingSoonService,
	ParticipantLeftReason,
	RoomEvent,
	Track,
	parseParticipantMetadata
} from '../openvidu-components';
import { toEmbeddedParticipantPayload } from '../utils/embedded-participant.utils';
import { toMediaStatusChangedEvent } from '../utils/media-status-event.utils';
import { MeetingContextService } from './meeting-context.service';
import { MeetingStateService } from './meeting-state.service';

/**
 * Service that handles all LiveKit/OpenVidu room events.
 *
 * This service encapsulates all event handling logic and updates the MeetingContextService
 * as the single source of truth for meeting state.
 */
@Injectable()
export class MeetingEventHandlerService {
	protected meetingContext = inject(MeetingContextService);
	protected meetingState = inject(MeetingStateService);
	protected roomFeatureService = inject(RoomFeatureService);
	protected recordingService = inject(RecordingService);
	protected roomMemberContextService = inject(RoomMemberContextService);
	protected eventBus = inject(EmbeddedEventBusService);
	protected navigationService = inject(NavigationService);
	protected notificationService = inject(NotificationService);
	protected soundService = inject(SoundService);
	protected runtimeConfigService = inject(RuntimeConfigService);
	protected translateService = inject(TranslateService);
	protected localMediaState = inject(LocalMediaStateService);
	protected localMediaControl = inject(LocalMediaControlService);
	protected mediaIntent = inject(LocalMediaIntentService);
	protected meetingEndingSoon = inject(MeetingEndingSoonService);

	// ============================================
	// PUBLIC METHODS - Room Event Handlers
	// ============================================

	/**
	 * Sets up all room event listeners when room is created.
	 * This is the main entry point for room event handling.
	 *
	 * @param room The LiveKit Room instance
	 */
	setupRoomListeners(room: Room): void {
		room.on(
			RoomEvent.DataReceived,
			async (payload: Uint8Array, participant?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string) => {
				// Only process topics that this handler is responsible for
				const relevantTopics: string[] = [
					MeetSignalType.MEET_RECORDING_UPDATED,
					MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED,
					MeetSignalType.MEET_PARTICIPANT_PERMISSIONS_UPDATED,
					MeetSignalType.MEET_PARTICIPANT_MEDIA_MUTED,
					MeetSignalType.MEET_MEETING_ENDING_SOON,
					MeetSignalType.MEET_MEETING_ENDED_BY_MODERATOR
				];

				if (!topic || !relevantTopics.includes(topic)) {
					return;
				}

				// These signals carry moderation authority, so only the server may send them: a packet
				// relayed from a participant arrives with that participant, one sent by the server does not.
				if (participant) {
					return;
				}

				try {
					const event = JSON.parse(new TextDecoder().decode(payload));

					switch (topic) {
						case MeetSignalType.MEET_RECORDING_UPDATED:
							this.handleRecordingUpdated(event as MeetRecordingUpdatedPayload);
							break;

						case MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED: {
							const roleUpdateEvent = event as MeetParticipantRoleUpdatedPayload;
							await this.handleParticipantRoleUpdated(roleUpdateEvent);
							break;
						}

						case MeetSignalType.MEET_PARTICIPANT_PERMISSIONS_UPDATED: {
							const permissionsUpdateEvent = event as MeetParticipantPermissionsUpdatedPayload;
							await this.handleParticipantPermissionsUpdated(permissionsUpdateEvent);
							break;
						}

						case MeetSignalType.MEET_PARTICIPANT_MEDIA_MUTED: {
							const mediaMutedEvent = event as MeetParticipantMediaMutedPayload;
							await this.handleParticipantMediaMuted(mediaMutedEvent);
							break;
						}

						case MeetSignalType.MEET_MEETING_ENDING_SOON:
							this.handleMeetingEndingSoon(event as MeetMeetingEndingSoonPayload);
							break;

						case MeetSignalType.MEET_MEETING_ENDED_BY_MODERATOR:
							this.handleMeetingEndedByModerator(event as MeetMeetingEndedByModeratorPayload);
							break;
					}
				} catch (error) {
					console.warn(`Failed to parse data message for topic: ${topic}`, error);
				}
			}
		);

		room.on(
			RoomEvent.ParticipantMetadataChanged,
			(_prevMetadata: string | undefined, participant: LocalParticipant | RemoteParticipant) => {
				this.handleParticipantMetadataChanged(participant.identity, participant.metadata);
			}
		);

		// LiveKit fires these for REMOTE participants only; the local participant's own lifecycle
		// is notified through meetingJoined/meetingLeft instead.
		room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
			this.onRemoteParticipantConnected(participant);
		});

		room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
			this.onRemoteParticipantDisconnected(participant);
		});
	}

	// What the host has been told about each local device's status in the current entry.
	private mediaStatusLedger: Partial<Record<EmbeddedEventName, boolean>> = {};

	/**
	 * Notifies the host of the local participant's media status (embedded modes only) from the state
	 * itself, so the prejoin screen — where there is no Room to listen to — reports like the meeting
	 * does. Only that state is a dependency: what the host was told and what was asked for are read
	 * untracked, being inputs to the decision rather than triggers.
	 */
	private readonly localMediaStatusEffect = effect(() => {
		const microphone = this.localMediaState.microphoneEnabled();
		const camera = this.localMediaState.cameraEnabled();
		const screenShare = this.localMediaState.screenShareEnabled();

		untracked(() => {
			this.notifyMediaStatus(Track.Source.Microphone, microphone, this.mediaIntent.microphoneEnabled());
			this.notifyMediaStatus(Track.Source.Camera, camera, this.mediaIntent.cameraEnabled());
			// A screen share has no intent to disagree with: it is on exactly while its track is published.
			this.notifyMediaStatus(Track.Source.ScreenShare, screenShare);
		});
	});

	/**
	 * Notifies the host of a local media status change (embedded modes only) if it is a transition
	 * from the last known state. Only a reading that matches the intended state (the one that will
	 * be applied when the next track is created) counts — the local participant object briefly
	 * reports its own last-known value again right after connecting, before the prejoin track is
	 * handed off to it, and that transient reading must not overwrite the real one.
	 * @param source The media source (microphone, camera, screen share)
	 * @param live The current state of the media source (enabled/disabled)
	 * @param intended The intended state of the media source (enabled/disabled). Defaults to `live` if not provided.
	 * @param origin Who caused the change. Defaults to the local participant acting on themselves.
	 * @returns
	 */
	protected notifyMediaStatus(
		source: Track.Source,
		live: boolean,
		intended: boolean = live,
		origin: MeetEventOrigin = MeetEventOrigin.PARTICIPANT
	): void {
		if (!this.runtimeConfigService.isEmbeddedMode()) return;

		const event = toMediaStatusChangedEvent(source, live, origin);

		if (!event) return;

		if (live !== intended) return;

		const eventName = event.event;
		const previous = this.mediaStatusLedger[eventName];
		this.mediaStatusLedger[eventName] = live;

		// First reading: only start tracking, nothing to compare against yet.
		if (previous === undefined) return;

		// No change.
		if (previous === live) return;

		this.eventBus.emit(event);
	}

	/**
	 * Reacts to a moderator turning off the local participant's devices: attributes the change to the
	 * moderator and turns each device off through the same control service the participant's own
	 * toggles go through, so the intent deciding whether the next track reopens a device keeps a
	 * single writer. LiveKit's mute leaves a screen-share publication in place, so only that path
	 * actually stops a share.
	 *
	 * The host is notified before the local state is touched: the status effect then sees no
	 * transition left to report and cannot attribute it to the participant.
	 *
	 * Each device settles independently: LiveKit has already muted every requested track
	 * server-side, so one failing control (e.g. a microphone re-acquire error) must not keep the
	 * other devices from latching their intent off.
	 */
	protected async handleParticipantMediaMuted({ media }: MeetParticipantMediaMutedPayload): Promise<void> {
		const controls: Promise<void>[] = [];

		if (media.audioActive === false) {
			this.notifyMediaStatus(Track.Source.Microphone, false, false, MeetEventOrigin.MODERATOR);
			controls.push(this.localMediaControl.setMicrophoneEnabled(false));
		}

		if (media.videoActive === false) {
			this.notifyMediaStatus(Track.Source.Camera, false, false, MeetEventOrigin.MODERATOR);
			controls.push(this.localMediaControl.setCameraEnabled(false));
		}

		if (media.screenShareActive === false) {
			this.notifyMediaStatus(Track.Source.ScreenShare, false, false, MeetEventOrigin.MODERATOR);
			controls.push(this.localMediaControl.setScreenShareEnabled(false));
		}

		if (controls.length > 0) {
			this.notificationService.showSnackbar(this.translateService.translate('MODERATION.MUTED_BY_MODERATOR'));
		}

		const results = await Promise.allSettled(controls);

		for (const result of results) {
			if (result.status === 'rejected') {
				console.warn('A device could not be turned off after a moderator mute', result.reason);
			}
		}
	}

	/**
	 * Forwards a remote participant's join to the host as a `participantJoined` event (embedded
	 * modes only). Only live transitions are notified: participants already in the meeting when
	 * the local one joins are not replayed.
	 */
	protected onRemoteParticipantConnected(participant: RemoteParticipant): void {
		if (!this.runtimeConfigService.isEmbeddedMode()) {
			return;
		}

		this.eventBus.emit({
			event: EmbeddedEventName.PARTICIPANT_JOINED,
			payload: {
				roomId: this.meetingContext.roomId() ?? '',
				participant: toEmbeddedParticipantPayload(participant)
			}
		});
	}

	/**
	 * Forwards a remote participant's departure to the host as a `participantLeft` event (embedded
	 * modes only). The departure reason is not part of the payload: it is only known server-side
	 * and travels on the `participantLeft` webhook.
	 */
	protected onRemoteParticipantDisconnected(participant: RemoteParticipant): void {
		if (!this.runtimeConfigService.isEmbeddedMode()) {
			return;
		}

		this.eventBus.emit({
			event: EmbeddedEventName.PARTICIPANT_LEFT,
			payload: {
				roomId: this.meetingContext.roomId() ?? '',
				participant: toEmbeddedParticipantPayload(participant)
			}
		});
	}

	/**
	 * Forwards the participant-connected event to the host as a `meetingJoined` lifecycle event
	 * (embedded modes only). The bus only ever queues the canonical name; each shell is
	 * responsible for also dispatching the deprecated `joined` alias alongside it.
	 */
	onParticipantConnected = (event: ParticipantModel): void => {
		if (!this.runtimeConfigService.isEmbeddedMode()) {
			return;
		}

		this.eventBus.emit({
			event: EmbeddedEventName.MEETING_JOINED,
			payload: {
				roomId: event.roomName ?? '',
				participantIdentity: event.identity
			}
		});
	};

	/**
	 * Maps the technical leave reason to a {@link LeftEventReason}, clears context, emits the
	 * host `meetingLeft` lifecycle event (paired with the `meetingJoined` emit in
	 * {@link onParticipantConnected}), and delegates the post-leave view transition to
	 * {@link NavigationService.goToDisconnected}.
	 */
	onParticipantLeft = async (event: ParticipantLeftEvent): Promise<void> => {
		let leftReason = this.mapLeftReason(event.reason);

		// The backend can't tell apart why the meeting ended (see extractLeftReason's own doc
		// comment), so it's left as the generic MEETING_ENDED; only this participant's own local
		// knowledge — set from intent, not derived from the server — can narrow it further.
		if (leftReason === LeftEventReason.MEETING_ENDED) {
			const meetingEndedBy = this.meetingContext.meetingEndedBy();

			if (meetingEndedBy === 'self') {
				leftReason = LeftEventReason.MEETING_ENDED_BY_SELF;
			} else if (meetingEndedBy === 'duration') {
				leftReason = LeftEventReason.MEETING_ENDED_BY_DURATION_LIMIT;
			}
		}

		// Clear meeting context but keep session storage intact
		this.meetingContext.clearMeetingContext(false);
		this.meetingState.clear();
		// Per entry: the next one starts up again, against its own initial state.
		this.mediaStatusLedger = {};

		// Notify the host that the local participant left (embedded modes only; the bus is drained there).
		if (this.runtimeConfigService.isEmbeddedMode()) {
			this.eventBus.emit({
				event: EmbeddedEventName.MEETING_LEFT,
				payload: {
					roomId: event.roomName,
					participantIdentity: event.identity,
					reason: leftReason
				}
			});
		}

		await this.navigationService.goToDisconnected(leftReason);
	};

	/**
	 * Handles recording start request event.
	 *
	 * @param event Recording start requested event from OpenVidu
	 */
	onRecordingStartRequested = async (event: RecordingStartRequestedEvent): Promise<void> => {
		try {
			await this.recordingService.startRecording(event.roomName);
		} catch (error: any) {
			if (error.status === 503) {
				console.error(
					'No egress service available. Check CPU usage or Media Node capacity. ' +
						'By default, a recording uses 2 CPUs per room.'
				);
			} else {
				console.error('Error starting recording:', error);
			}
		}
	};

	/**
	 * Handles recording stop request event.
	 *
	 * @param event Recording stop requested event from OpenVidu
	 */
	onRecordingStopRequested = async (event: RecordingStopRequestedEvent): Promise<void> => {
		try {
			await this.recordingService.stopRecording(event.recordingId);
		} catch (error) {
			console.error('Error stopping recording:', error);
		}
	};

	// ============================================
	// PRIVATE METHODS - Event Handlers
	// ============================================

	/**
	 * Handles role updated event for the local participant by refreshing the room member token to get updated permissions.
	 * Also shows a notification to the user about their new role.
	 *
	 * @param event Participant role updated event payload
	 */
	private async handleParticipantRoleUpdated(event: MeetParticipantRoleUpdatedPayload): Promise<void> {
		const { roomId, participantIdentity, newBadge } = event;
		const local = this.meetingState.localParticipant();

		if (!roomId || !local || local.identity !== participantIdentity) {
			return;
		}

		try {
			// Refresh room member token to get updated permissions based on new role
			await this.roomMemberContextService.refreshToken(roomId);

			const isPromotedModerator = newBadge === MeetRoomMemberUIBadge.MODERATOR;
			this.showParticipantRoleUpdatedNotification(isPromotedModerator);
		} catch (error) {
			console.error('Error refreshing room member token after role update:', error);
			await this.navigationService.redirectToErrorPage(NavigationErrorReason.ROOM_ACCESS_REVOKED, true);
		}
	}

	/**
	 * Warns the user that the meeting is about to reach its room's duration limit
	 * (`maxDurationMinutes`) and will be ended for every participant, through
	 * {@link MeetingEndingSoonService}, which drives both the notice and the status rail's countdown.
	 * The backend sends this signal once per meeting to the whole room, so everyone sees the same
	 * warning. Also records the cause locally
	 * (see {@link MeetingEndedBy}) so the eventual `left`/`meetingLeft` event this participant
	 * receives is attributed correctly instead of reading as a moderator's end.
	 */
	private handleMeetingEndingSoon(event: MeetMeetingEndingSoonPayload): void {
		const roomId = this.meetingContext.roomId();

		if (roomId && event.roomId !== roomId) {
			return;
		}

		this.meetingContext.setMeetingEndedBy('duration');
		this.meetingEndingSoon.start(event.remainingMs);
		this.soundService.playMeetingEndingSoonSound();
	}

	/**
	 * A moderator's own end-meeting request was just validated server-side, moments before the room
	 * closes. Corrects a `'duration'` attribution this participant may have recorded from an earlier
	 * ending-soon warning, now that a moderator has beaten the duration GC to it. Never downgrades
	 * `'self'`: the moderator who actually clicked already set that synchronously, before their own
	 * request even reached the server, so it's guaranteed to still be set when their own broadcast
	 * echoes back to them.
	 */
	private handleMeetingEndedByModerator(event: MeetMeetingEndedByModeratorPayload): void {
		const roomId = this.meetingContext.roomId();

		if (roomId && event.roomId !== roomId) {
			return;
		}

		if (this.meetingContext.meetingEndedBy() !== 'self') {
			this.meetingContext.setMeetingEndedBy('other');
		}
	}

	private handleRecordingUpdated(event: MeetRecordingUpdatedPayload): void {
		const roomId = this.meetingContext.roomId();

		if (roomId && event.roomId !== roomId) {
			return;
		}

		if (event.recording.status === MeetRecordingStatus.COMPLETE) {
			this.meetingContext.setHasRecordings(true);
		}
	}

	/**
	 * Handles permissions updated event for the local participant by regenerating the room member token to get updated permissions.
	 *
	 * @param event Participant permissions updated event payload
	 */
	private async handleParticipantPermissionsUpdated(event: MeetParticipantPermissionsUpdatedPayload): Promise<void> {
		const { participantIdentity } = event;
		const roomId = this.meetingContext.roomId();
		const local = this.meetingState.localParticipant();

		if (!roomId || !local || local.identity !== participantIdentity) {
			return;
		}

		try {
			const roomSecret = this.meetingContext.roomSecret();
			const tokenOptions: MeetRoomMemberTokenOptions = {
				secret: roomSecret,
				joinMeeting: true
			};
			await this.roomMemberContextService.generateToken(roomId, tokenOptions);

			this.notificationService.showSnackbar('Your permissions have been updated');
		} catch (error) {
			console.error('Error regenerating room member token after permissions update:', error);
			await this.navigationService.redirectToErrorPage(NavigationErrorReason.ROOM_ACCESS_REVOKED, true);
		}
	}

	/**
	 * Handles LiveKit participant metadata updates to synchronize participant badge and moderation state.
	 * This is necessary to reflect role changes (e.g. promoted to moderator) in the UI based on metadata updates from the backend.
	 *
	 * @param participantIdentity - The identity of the participant whose metadata changed
	 * @param metadata - The new metadata string, expected to be a JSON string containing badge and promotedModerator properties
	 */
	private handleParticipantMetadataChanged(participantIdentity: string, metadata: string | undefined): void {
		const parsedMetadata = parseParticipantMetadata(metadata);

		if (!parsedMetadata) {
			return;
		}

		const local = this.meetingState.localParticipant();

		if (local && local.identity === participantIdentity) {
			local.badge = parsedMetadata.badge;
			local.promotedModerator = Boolean(parsedMetadata.isPromotedModerator);
			return;
		}

		const remoteParticipants = this.meetingState.remoteParticipants();
		const participant = remoteParticipants.find((p) => p.identity === participantIdentity);

		if (participant) {
			participant.badge = parsedMetadata.badge;
			participant.promotedModerator = Boolean(parsedMetadata.isPromotedModerator);
		}
	}

	private showParticipantRoleUpdatedNotification(isPromotedModerator: boolean): void {
		const message = isPromotedModerator
			? 'You have been promoted to moderator'
			: 'Your moderator role has been removed';
		this.notificationService.showSnackbar(message);

		if (isPromotedModerator) {
			this.soundService.playParticipantRoleUpgradedSound();
		} else {
			this.soundService.playParticipantRoleDowngradedSound();
		}
	}

	/**
	 * Maps technical ParticipantLeftReason to user-friendly LeftEventReason.
	 * This provides better messaging to users about why they left the room.
	 */
	private mapLeftReason(reason: ParticipantLeftReason): LeftEventReason {
		const reasonMap: Record<ParticipantLeftReason, LeftEventReason> = {
			[ParticipantLeftReason.LEAVE]: LeftEventReason.VOLUNTARY_LEAVE,
			[ParticipantLeftReason.BROWSER_UNLOAD]: LeftEventReason.VOLUNTARY_LEAVE,
			[ParticipantLeftReason.NETWORK_DISCONNECT]: LeftEventReason.NETWORK_DISCONNECT,
			[ParticipantLeftReason.SIGNAL_CLOSE]: LeftEventReason.NETWORK_DISCONNECT,
			[ParticipantLeftReason.SERVER_SHUTDOWN]: LeftEventReason.SERVER_SHUTDOWN,
			[ParticipantLeftReason.PARTICIPANT_REMOVED]: LeftEventReason.PARTICIPANT_KICKED,
			[ParticipantLeftReason.ROOM_DELETED]: LeftEventReason.MEETING_ENDED,
			[ParticipantLeftReason.DUPLICATE_IDENTITY]: LeftEventReason.DUPLICATE_IDENTITY,
			[ParticipantLeftReason.OTHER]: LeftEventReason.UNKNOWN
		};
		return reasonMap[reason] ?? LeftEventReason.UNKNOWN;
	}
}
