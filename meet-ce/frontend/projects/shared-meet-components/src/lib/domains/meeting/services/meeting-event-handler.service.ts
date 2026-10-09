import { Injectable, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
	EmbeddedEventName,
	EmbeddedEventPayloadFor,
	handLoweredByOf,
	handRaiseDateOf,
	LeftEventReason,
	MeetEventOrigin,
	MeetParticipantAttribute,
	MeetParticipantMediaMutedPayload,
	MeetParticipantPermissionsUpdatedPayload,
	MeetRecordingStatus,
	MeetRecordingUpdatedPayload,
	MeetRoomMemberRole,
	MeetRoomMemberTokenOptions,
	MeetSignalType
} from '@openvidu-meet/typings';
import type { EmbeddedParticipantHandChangedEvent } from '@openvidu-meet/typings';
import type { NotificationOptions } from '../../../shared/models/notification.model';
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
	DisconnectReason,
	LocalParticipant,
	Participant,
	ParticipantLeftEvent,
	ParticipantModel,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent,
	RemoteParticipant,
	Room
} from '../openvidu-components';
import {
	LocalMediaService,
	ScreenShareService,
	MeetingEndingSoonService,
	ParticipantLeftReason,
	RoomEvent,
	Track,
	parseParticipantMetadata,
	raisedHandQueue
} from '../openvidu-components';
import {
	MeetingEventsService,
	MeetSignal
} from '../openvidu-components/services/meeting-events/meeting-events.service';
import {
	toEmbeddedDepartedParticipant,
	toEmbeddedParticipantInfo,
	toEmbeddedParticipantPayload,
	toParticipantRole
} from '../utils/embedded-participant.utils';
import { toMediaStatusChangedEvent } from '../utils/media-status-event.utils';
import { hasReachedMeetingEnd, parseMeetingEndDate, parseMeetingStartDate } from '../utils/room-metadata.utils';
import { MeetingContextService } from './meeting-context.service';
import { MeetingHandService } from './meeting-hand.service';
import { MeetingStateService } from './meeting-state.service';

const HAND_NOTIFICATION_DURATION_MS = 5000;

/** A raised hand the notice on screen announces. */
interface AnnouncedHand {
	identity: string;
	name: string;
}

/** The raised-hand notice, and the hands it announces in the order they went up. */
interface HandNotice {
	id: number;
	hands: AnnouncedHand[];
}

const RECORDING_STATUS_ORDER: Record<MeetRecordingStatus, number> = {
	[MeetRecordingStatus.STARTING]: 0,
	[MeetRecordingStatus.ACTIVE]: 1,
	[MeetRecordingStatus.ENDING]: 2,
	[MeetRecordingStatus.COMPLETE]: 3,
	[MeetRecordingStatus.FAILED]: 3,
	[MeetRecordingStatus.ABORTED]: 3,
	[MeetRecordingStatus.LIMIT_REACHED]: 3
};

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
	protected localMedia = inject(LocalMediaService);
	protected screenShare = inject(ScreenShareService);
	protected meetingEndingSoon = inject(MeetingEndingSoonService);
	protected meetingHand = inject(MeetingHandService);

	/**
	 * Role changes and permission signals each replace the room member token, so they are applied one
	 * at a time, in the order they arrived: otherwise a slower refresh could install an older role.
	 */
	private tokenUpdates = Promise.resolve();

	constructor() {
		// The server signals flow from the moment the room is bound, before it connects, so what the
		// server sends a participant on joining (the recording in progress) is not missed.
		inject(MeetingEventsService)
			.meetSignals$.pipe(takeUntilDestroyed())
			.subscribe((meetSignal) =>
				this.handleMeetSignal(meetSignal).catch((error) =>
					console.warn(`Failed to handle the '${meetSignal.topic}' signal`, error)
				)
			);
	}

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
			RoomEvent.ParticipantMetadataChanged,
			(_prevMetadata: string | undefined, participant: LocalParticipant | RemoteParticipant) => {
				this.handleParticipantMetadataChanged(participant.identity, participant.metadata);

				if (participant === room.localParticipant) {
					this.syncLocalRole(room.localParticipant);
				}
			}
		);

		// LiveKit fires these for REMOTE participants only; the local participant's own lifecycle
		// is notified through meetingJoined/meetingLeft instead.
		room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
			this.onRemoteParticipantConnected(participant);
		});

		room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant, reason?: DisconnectReason) => {
			this.onRemoteParticipantDisconnected(participant, reason);
		});

		room.on(
			RoomEvent.ParticipantAttributesChanged,
			(changedAttributes: Record<string, string>, participant: Participant) => {
				this.handleParticipantAttributesChanged(changedAttributes, participant);
			}
		);

		// What the join response brought and what changed while connecting landed before these listeners
		// existed (LiveKit even seeds the room metadata silently), so the meeting's start and deadline and
		// the local participant's role are read here as well as listened for.
		this.handleRoomMetadataChanged(room.metadata);
		this.syncLocalRole(room.localParticipant);
		room.on(RoomEvent.RoomMetadataChanged, (metadata: string) => this.handleRoomMetadataChanged(metadata));
	}

	/**
	 * Hands the meeting's start to the meeting context and its deadline to
	 * {@link MeetingEndingSoonService}, both converted from the server clock the metadata carries
	 * them in to this device's, so the elapsed time and the countdown are right however far off this
	 * device's own clock is.
	 */
	private handleRoomMetadataChanged(metadata?: string): void {
		const skewMs = this.roomMemberContextService.serverTimeSkewMs();
		const toDeviceClock = (serverMs: number | undefined) =>
			serverMs === undefined ? undefined : serverMs - skewMs;
		const endsAt = toDeviceClock(parseMeetingEndDate(metadata));

		this.meetingContext.setMeetingStartedAt(toDeviceClock(parseMeetingStartDate(metadata)));
		this.meetingContext.setMeetingEndsAt(endsAt);
		this.meetingEndingSoon.trackMeetingEnd(endsAt);
	}

	// What the host has been told about each local device's status in the current entry.
	private mediaStatusLedger: Partial<Record<EmbeddedEventName, boolean>> = {};
	// The furthest status each recording has reached in the current entry.
	private recordingStatusLedger = new Map<string, MeetRecordingStatus>();
	// A hand that goes up while the notice is on screen joins it; one that goes down or leaves drops out.
	private handNotice?: HandNotice;

	// The notice offers to lower the hand, so it goes when the permission to do that does.
	private readonly handNoticePermissionEffect = effect(() => {
		if (!this.roomMemberContextService.hasPermission('participantHandLower')) {
			untracked(() => this.dismissHandNotice());
		}
	});
	private meetingJoinedNotified = false;
	// Whether the local participant's metadata said they were promoted to moderator, in the current entry.
	private localPromotedModerator = false;
	// The notice of the role now in effect: a newer role change replaces it rather than stacking on it.
	private roleNoticeId?: number;

	/**
	 * Notifies the host of the local participant's media status (embedded modes only) from the state
	 * itself, so the prejoin screen — where there is no Room to listen to — reports like the meeting
	 * does. Only that state is a dependency: what the host was told and what was asked for are read
	 * untracked, being inputs to the decision rather than triggers.
	 */
	private readonly localMediaStatusEffect = effect(() => {
		const microphone = this.localMedia.microphone.enabled();
		const camera = this.localMedia.camera.enabled();
		const screenShare = this.screenShare.enabled();

		untracked(() => {
			this.notifyMediaStatus(Track.Source.Microphone, microphone, this.localMedia.microphone.wanted());
			this.notifyMediaStatus(Track.Source.Camera, camera, this.localMedia.camera.wanted());
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
			controls.push(this.localMedia.setMicrophoneEnabled(false));
		}

		if (media.videoActive === false) {
			this.notifyMediaStatus(Track.Source.Camera, false, false, MeetEventOrigin.MODERATOR);
			controls.push(this.localMedia.setCameraEnabled(false));
		}

		if (media.screenShareActive === false) {
			this.notifyMediaStatus(Track.Source.ScreenShare, false, false, MeetEventOrigin.MODERATOR);
			controls.push(this.screenShare.setEnabled(false));
		}

		if (controls.length > 0) {
			this.notificationService.showMessage(this.translateService.translate('MODERATION.MUTED_BY_MODERATOR'));
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
	 * the local one joins are not replayed. LiveKit announces a participant before it applies the
	 * participant's info, in the same task, so the event is built a microtask later.
	 */
	protected onRemoteParticipantConnected(participant: RemoteParticipant): void {
		if (!this.runtimeConfigService.isEmbeddedMode()) {
			return;
		}

		queueMicrotask(() =>
			this.eventBus.emit({
				event: EmbeddedEventName.PARTICIPANT_JOINED,
				payload: {
					roomId: this.meetingContext.roomId() ?? '',
					participant: toEmbeddedParticipantPayload(participant)
				}
			})
		);
	}

	/**
	 * Drops a remote participant who leaves from the raised-hand notice, and forwards the departure
	 * to the host as a `participantLeft` event (embedded modes only), with the reason LiveKit gives.
	 */
	protected onRemoteParticipantDisconnected(participant: RemoteParticipant, reason?: DisconnectReason): void {
		this.withdrawHand(participant.identity);

		if (!this.runtimeConfigService.isEmbeddedMode()) {
			return;
		}

		this.eventBus.emit({
			event: EmbeddedEventName.PARTICIPANT_LEFT,
			payload: {
				roomId: this.meetingContext.roomId() ?? '',
				participant: toEmbeddedDepartedParticipant(participant, reason)
			}
		});
	}

	/**
	 * Forwards the participant-connected event to the host as a `meetingJoined` lifecycle event
	 * (embedded modes only), followed by the status of every recording the meeting already has. The
	 * bus only ever queues the canonical name; each shell is responsible for also dispatching the
	 * deprecated `joined` alias alongside it.
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
		this.meetingJoinedNotified = true;

		for (const [recordingId, status] of this.recordingStatusLedger) {
			this.eventBus.emit({ event: EmbeddedEventName.RECORDING_STATUS_CHANGED, payload: { recordingId, status } });
		}

		for (const participant of this.raisedHandQueue()) {
			this.eventBus.emit(this.participantHandChangedEvent(participant, MeetEventOrigin.PARTICIPANT));
		}
	};

	/**
	 * Reacts to a hand going up or down. The attribute the server wrote says whether the hand is
	 * raised and who lowered it, so a moderator lower reaches the affected participant, the holders
	 * of `participantHandLower` and the host without any further exchange.
	 */
	private handleParticipantAttributesChanged(
		changedAttributes: Record<string, string>,
		participant: Participant
	): void {
		if (!(MeetParticipantAttribute.HAND_RAISE_DATE in changedAttributes)) return;

		const raised = handRaiseDateOf(participant.attributes) !== undefined;
		const origin = raised ? MeetEventOrigin.PARTICIPANT : handLoweredByOf(participant.attributes);

		if (participant.isLocal) {
			if (origin === MeetEventOrigin.MODERATOR) {
				this.notificationService.showMessage(this.translateService.translate('HAND.LOWERED_BY_MODERATOR'));
			}
		} else if (!raised) {
			this.withdrawHand(participant.identity);
		} else if (this.roomMemberContextService.hasPermission('participantHandLower')) {
			this.announceRaisedHand(participant);
		}

		if (!this.runtimeConfigService.isEmbeddedMode()) return;

		this.eventBus.emit(this.participantHandChangedEvent(participant, origin));
	}

	private announceRaisedHand(participant: Participant): void {
		this.soundService.playHandRaisedSound();
		const earlier = this.shownHandNotice()?.hands.filter(({ identity }) => identity !== participant.identity);
		const name = participant.name ?? participant.identity;
		this.showHandNotice([...(earlier ?? []), { identity: participant.identity, name }]);
	}

	private withdrawHand(participantIdentity: string): void {
		const hands = this.shownHandNotice()?.hands ?? [];

		if (!hands.some(({ identity }) => identity === participantIdentity)) return;

		this.showHandNotice(hands.filter(({ identity }) => identity !== participantIdentity));
	}

	/** The raised-hand notice while it is on screen: it times out, and the participant can close it. */
	private shownHandNotice(): HandNotice | undefined {
		const notice = this.handNotice;
		return notice && this.notificationService.notifications().some(({ id }) => id === notice.id)
			? notice
			: undefined;
	}

	/** Shows the notice for these hands, rewriting the one on screen, or takes it away for none. */
	private showHandNotice(hands: AnnouncedHand[]): void {
		if (hands.length === 0) {
			this.dismissHandNotice();
			return;
		}

		const shown = this.shownHandNotice();
		const options = this.handNoticeOptions(hands);

		if (shown) {
			this.notificationService.updateNotification(shown.id, options);
		}

		this.handNotice = { id: shown?.id ?? this.notificationService.showNotification(options), hands };
	}

	/** One hand is named, with the offer to lower it; several are the first one's name and how many more. */
	private handNoticeOptions([first, ...others]: AnnouncedHand[]): NotificationOptions {
		const notice = { kind: 'hand-raised', icon: 'front_hand', durationMs: HAND_NOTIFICATION_DURATION_MS };

		if (others.length > 0) {
			const params = { name: first.name, count: others.length };
			return { ...notice, message: { key: 'HAND.RAISED_NOTIFICATION_MANY', params } };
		}

		return {
			...notice,
			message: { key: 'HAND.RAISED_NOTIFICATION', params: { name: first.name } },
			action: {
				label: { key: 'HAND.LOWER_PARTICIPANT' },
				run: () =>
					void this.meetingHand
						.lower(first.identity)
						.catch((error) => console.warn('The hand could not be lowered', error))
			}
		};
	}

	private dismissHandNotice(): void {
		if (!this.handNotice) return;

		this.notificationService.dismissNotification(this.handNotice.id);
		this.handNotice = undefined;
	}

	/** Every raised hand in the meeting in queue order, read straight off the LiveKit participants. */
	private raisedHandQueue(): Participant[] {
		const room = this.meetingState.lkRoom();

		if (!room) return [];

		return raisedHandQueue([room.localParticipant, ...room.remoteParticipants.values()], (participant) =>
			handRaiseDateOf(participant.attributes)
		);
	}

	private participantHandChangedEvent(
		participant: Participant,
		origin: EmbeddedParticipantHandChangedEvent['payload']['origin']
	): EmbeddedParticipantHandChangedEvent {
		return {
			event: EmbeddedEventName.PARTICIPANT_HAND_CHANGED,
			payload: {
				roomId: this.meetingContext.roomId() ?? '',
				participant: toEmbeddedParticipantInfo(participant),
				origin
			}
		};
	}

	/**
	 * Maps the technical leave reason to a {@link LeftEventReason}, clears context, emits the
	 * host `meetingLeft` lifecycle event (paired with the `meetingJoined` emit in
	 * {@link onParticipantConnected}), and delegates the post-leave view transition to
	 * {@link NavigationService.goToDisconnected}.
	 */
	onParticipantLeft = async (event: ParticipantLeftEvent): Promise<void> => {
		let leftReason = this.mapLeftReason(event.reason);

		// LiveKit reports the same room deletion whoever caused it, so the generic MEETING_ENDED is
		// narrowed here from what this participant knows: their own intent first, then the meeting's
		// end date, which every participant can see for themselves.
		if (leftReason === LeftEventReason.MEETING_ENDED) {
			if (this.meetingContext.endedBySelf()) {
				leftReason = LeftEventReason.MEETING_ENDED_BY_SELF;
			} else if (hasReachedMeetingEnd(this.meetingContext.meetingEndsAt())) {
				leftReason = LeftEventReason.MEETING_ENDED_BY_DURATION_LIMIT;
			}
		}

		// Clear meeting context but keep session storage intact
		this.meetingContext.clearMeetingContext(false);
		this.meetingState.clear();
		// Per entry: the next one starts up again, against its own initial state.
		this.mediaStatusLedger = {};
		this.recordingStatusLedger.clear();
		this.handNotice = undefined;
		this.meetingJoinedNotified = false;
		this.localPromotedModerator = false;

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
		} catch (error) {
			console.error('Error starting recording:', error);
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

	private async handleMeetSignal({ topic, payload }: MeetSignal): Promise<void> {
		switch (topic) {
			case MeetSignalType.MEET_RECORDING_UPDATED:
				this.handleRecordingUpdated(payload as MeetRecordingUpdatedPayload);
				break;

			case MeetSignalType.MEET_PARTICIPANT_PERMISSIONS_UPDATED:
				await this.inArrivalOrder(() =>
					this.handleParticipantPermissionsUpdated(payload as MeetParticipantPermissionsUpdatedPayload)
				);
				break;

			case MeetSignalType.MEET_PARTICIPANT_MEDIA_MUTED:
				await this.handleParticipantMediaMuted(payload as MeetParticipantMediaMutedPayload);
				break;
		}
	}

	private syncLocalRole(participant: LocalParticipant): void {
		this.inArrivalOrder(() => this.handleLocalParticipantRole(participant)).catch((error) =>
			console.warn('Failed to apply the local participant role', error)
		);
	}

	/**
	 * Applies a promotion or demotion the local participant's metadata carries: refreshes the room
	 * member token, which holds the permissions, then notifies the participant and, in embedded modes,
	 * the host about the role now in effect.
	 */
	private async handleLocalParticipantRole(participant: LocalParticipant): Promise<void> {
		const metadata = parseParticipantMetadata(participant.metadata);
		const roomId = this.meetingContext.roomId();

		if (!metadata || !roomId) {
			return;
		}

		const promoted = Boolean(metadata.isPromotedModerator);
		const role = toParticipantRole(metadata.badge);
		const wasPromoted = this.localPromotedModerator;
		this.localPromotedModerator = promoted;

		// A promotion that gives way to a base role that is moderator itself leaves the role as it was.
		if (promoted === wasPromoted || (!promoted && role === MeetRoomMemberRole.MODERATOR)) {
			return;
		}

		const refreshed = await this.roomMemberContextService.updateTokenInMeeting(() =>
			this.roomMemberContextService.refreshToken(roomId)
		);

		if (!refreshed) {
			return;
		}

		this.showParticipantRoleUpdatedNotification(promoted);

		if (this.runtimeConfigService.isEmbeddedMode()) {
			this.eventBus.emit({
				event: EmbeddedEventName.PARTICIPANT_ROLE_CHANGED,
				payload: { roomId, participant: toEmbeddedParticipantInfo(participant) }
			});
		}
	}

	private inArrivalOrder(tokenUpdate: () => Promise<void>): Promise<void> {
		const applied = this.tokenUpdates.then(tokenUpdate);
		this.tokenUpdates = applied.catch(() => undefined);
		return applied;
	}

	private handleRecordingUpdated(event: MeetRecordingUpdatedPayload): void {
		const roomId = this.meetingContext.roomId();

		if (roomId && event.roomId !== roomId) {
			return;
		}

		const { recordingId, status } = event.recording;

		if (status === MeetRecordingStatus.COMPLETE) {
			this.meetingContext.setHasRecordings(true);
		}

		this.notifyRecordingStatus({ recordingId, status });
	}

	/**
	 * Notifies the host of the recording's status (embedded modes only) only when it moves that
	 * recording forward: the server repeats the current status to a participant who joins
	 * mid-recording or reconnects, and the egress webhooks it relays can arrive late. That repeat
	 * reaches a joining participant before `meetingJoined` does, so until then the status is only
	 * recorded, for {@link onParticipantConnected} to report.
	 */
	private notifyRecordingStatus(payload: EmbeddedEventPayloadFor<EmbeddedEventName.RECORDING_STATUS_CHANGED>): void {
		if (!this.runtimeConfigService.isEmbeddedMode()) return;

		const { recordingId, status } = payload;
		const known = this.recordingStatusLedger.get(recordingId);

		if (known !== undefined && RECORDING_STATUS_ORDER[status] <= RECORDING_STATUS_ORDER[known]) return;

		this.recordingStatusLedger.set(recordingId, status);

		if (this.meetingJoinedNotified) {
			this.eventBus.emit({ event: EmbeddedEventName.RECORDING_STATUS_CHANGED, payload });
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

		const tokenOptions: MeetRoomMemberTokenOptions = {
			secret: this.meetingContext.roomSecret(),
			joinMeeting: true
		};
		const regenerated = await this.roomMemberContextService.updateTokenInMeeting(() =>
			this.roomMemberContextService.generateToken(roomId, tokenOptions)
		);

		if (regenerated) {
			this.notificationService.showMessage(this.translateService.translate('MODERATION.PERMISSIONS_UPDATED'));
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
		const messageKey = isPromotedModerator
			? 'MODERATION.PROMOTED_TO_MODERATOR'
			: 'MODERATION.MODERATOR_ROLE_REMOVED';

		if (this.roleNoticeId !== undefined) {
			this.notificationService.dismissNotification(this.roleNoticeId);
		}

		this.roleNoticeId = this.notificationService.showMessage(this.translateService.translate(messageKey));

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
