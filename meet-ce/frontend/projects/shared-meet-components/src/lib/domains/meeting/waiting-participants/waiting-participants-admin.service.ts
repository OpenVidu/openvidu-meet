import { HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
	EmbeddedEventName,
	MeetWaitingParticipantErrorCode,
	MeetWaitingParticipantList,
	MeetWaitingParticipant,
	MeetWaitingParticipantStatusChangedSignalPayload,
	MeetSignalType
} from '@openvidu-meet/typings';
import { filter, Subject } from 'rxjs';
import { HttpService } from '../../../shared/services/http.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { EmbeddedEventBusService } from '../../embedded/services/embedded-event-bus.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { E2eeService } from '../openvidu-components/services/e2ee/e2ee.service';
import { MeetingEventsService } from '../openvidu-components/services/meeting-events/meeting-events.service';
import { MeetingLiveKitService } from '../openvidu-components/services/meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../openvidu-components/services/participant/participant.service';
import { MeetingContextService } from '../services/meeting-context.service';

/** Signals and participant moves this close together make one request for the list. */
const GROUPING_MS = 300;
/** How long the notice of a refused decision stays up. */
const REFUSAL_NOTICE_MS = 6_000;
/** The list is read this often anyway, so a lost signal shows within this time. */
const POLL_INTERVAL_MS = 30_000;

/** A participant waiting to be let in, as the meeting shows them. */
export interface WaitingParticipantView {
	participant: MeetWaitingParticipant;
	/** The name decrypted, or masked, in an encrypted room. */
	name: string;
	/** When they asked to join, in this device's time. */
	knockedAt: number;
	/** The colour of their avatar, which stays the same for the same participant. */
	color: string;
}

const avatarColorOf = (identity: string): string => {
	let hue = 0;

	for (const char of identity) hue = (hue * 31 + char.charCodeAt(0)) % 360;

	return `hsl(${hue}, 100%, 80%)`;
};

const knockOf = ({ participantIdentity, knockDate }: MeetWaitingParticipant) => `${participantIdentity}:${knockDate}`;

/**
 * The side of whoever may let participants into a locked room: holds the waiting list while the local
 * participant is in the meeting with `waitingParticipantAdmin`, tells the host about it, and admits or rejects.
 */
@Service()
export class WaitingParticipantsAdminService {
	private readonly http = inject(HttpService);
	private readonly meetingContext = inject(MeetingContextService);
	private readonly roomMemberContext = inject(RoomMemberContextService);
	private readonly meetingLiveKit = inject(MeetingLiveKitService);
	private readonly participantService = inject(ParticipantService);
	private readonly e2ee = inject(E2eeService);
	private readonly eventBus = inject(EmbeddedEventBusService);
	private readonly runtimeConfig = inject(RuntimeConfigService);
	private readonly notificationService = inject(NotificationService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - WaitingParticipantsAdminService');

	private readonly _waiting = signal<WaitingParticipantView[]>([]);
	private readonly arrivals = new Subject<WaitingParticipantView[]>();

	/** Whether the local participant is in the meeting and may let others in. */
	readonly isAdmitting = computed(
		() => this.meetingLiveKit.isSessionActive() && this.roomMemberContext.hasPermission('waitingParticipantAdmin')
	);
	/** Those waiting, by the time they asked to join. */
	readonly waiting = this._waiting.asReadonly();
	/**
	 * Free places of the meeting as this meeting sees it; `null` without a participant limit. An admission
	 * not used yet holds a place it cannot see, so the server has the last word.
	 */
	readonly freePlaces = computed(() => {
		const maxParticipants = this.meetingContext.maxParticipants();

		if (maxParticipants === null) return null;

		return Math.max(0, maxParticipants - this.participantService.totalParticipantsSignal());
	});
	/** Whether everyone waiting fits in the free places. */
	readonly canAdmitAll = computed(() => {
		const places = this.freePlaces();
		return places === null || this._waiting().length <= places;
	});
	/**
	 * Who the local participant has not been told about yet: everyone waiting in the first list, then each
	 * new request to join.
	 */
	readonly arrivals$ = this.arrivals.asObservable();

	private readonly knocksSeen = new Set<string>();
	private hasList = false;
	private lastReported?: string;
	private requests = 0;
	private applied = 0;
	private refreshTimer?: ReturnType<typeof setTimeout>;
	private pollTimer?: ReturnType<typeof setInterval>;

	constructor() {
		// An unlocked room is read only when a signal says its list changed.
		effect(() => {
			const admitting = this.isAdmitting();
			const connected = this.meetingLiveKit.isConnected();
			const locked = !!this.meetingContext.roomLock()?.enabled;

			untracked(() => {
				if (!admitting) {
					this.reset();
				} else if (connected && locked) {
					this.startPolling();
					void this.refresh();
				} else {
					this.stopPolling();
				}
			});
		});

		const meetSignals$ = inject(MeetingEventsService).meetSignals$.pipe(
			filter(() => this.isAdmitting()),
			takeUntilDestroyed()
		);
		meetSignals$
			.pipe(filter(({ topic }) => topic === MeetSignalType.MEET_WAITING_PARTICIPANT_LIST_UPDATED))
			.subscribe(() => this.scheduleRefresh());
		meetSignals$
			.pipe(filter(({ topic }) => topic === MeetSignalType.MEET_WAITING_PARTICIPANT_STATUS_CHANGED))
			.subscribe(({ payload }) =>
				this.reportStatusChange(payload as MeetWaitingParticipantStatusChangedSignalPayload)
			);
	}

	/** Reads the waiting list again. Only the answer to the latest request is applied. */
	async refresh(): Promise<void> {
		const roomId = this.meetingContext.roomId();

		if (!roomId || !this.isAdmitting()) return;

		const request = ++this.requests;
		let participants: MeetWaitingParticipant[];

		try {
			const list = await this.http.getRequest<MeetWaitingParticipantList>(this.waitingParticipantsPath(roomId));
			participants = [...list.participants].sort((a, b) => a.knockDate - b.knockDate);
		} catch (error) {
			this.log.w('The waiting list could not be read:', error);
			return;
		}

		const waiting = await Promise.all(participants.map((participant) => this.toView(participant)));

		if (request <= this.applied || !this.isAdmitting()) return;

		this.applied = request;
		this.apply(roomId, participants, waiting);
	}

	/** Admits one participant waiting. */
	async admit(participantIdentity: string): Promise<void> {
		await this.decide(
			(path) => this.http.postRequest(`${path}/${encodeURIComponent(participantIdentity)}/admit`),
			participantIdentity
		);
	}

	/** Rejects one participant waiting. */
	async reject(participantIdentity: string): Promise<void> {
		await this.decide(
			(path) => this.http.deleteRequest(`${path}/${encodeURIComponent(participantIdentity)}`),
			participantIdentity
		);
	}

	/** Admits everyone waiting, or nobody when they do not all fit. */
	async admitAll(): Promise<void> {
		await this.decide((path) => this.http.postRequest<{ message: string }>(`${path}/admit`));
	}

	/**
	 * Rejects everyone the list shows waiting. Those who stopped waiting meanwhile are already where a rejection
	 * would leave them, so they are no failure.
	 */
	async rejectAll(): Promise<void> {
		const identities = this._waiting().map(({ participant }) => participant.participantIdentity);

		if (identities.length === 0) return;

		const query = identities.map(encodeURIComponent).join(',');

		try {
			await this.decide((path) => this.http.deleteRequest(`${path}?participantIdentities=${query}`));
		} catch (error) {
			if (!(error instanceof HttpErrorResponse && error.status === 400)) throw error;
		}
	}

	/**
	 * Shows the list as the decision left it. A decision the list no longer allows (someone left, or not
	 * everyone fits) or allowed only in part shows the new list instead, and says why.
	 */
	private async decide<T>(request: (path: string) => Promise<T>, participantIdentity?: string): Promise<T> {
		const roomId = this.meetingContext.roomId();

		if (!roomId) throw new Error('Cannot decide on waiting participants outside a meeting');

		const name = this._waiting().find(
			({ participant }) => participant.participantIdentity === participantIdentity
		)?.name;

		try {
			const answer = await request(this.waitingParticipantsPath(roomId));
			await this.refresh();
			return answer;
		} catch (error) {
			if (error instanceof HttpErrorResponse && [400, 404, 409].includes(error.status)) {
				void this.refresh();
				this.tellRefusal(error, participantIdentity === undefined ? undefined : (name ?? participantIdentity));
			}

			throw error;
		}
	}

	/** Says who no longer waits, or that not everyone waiting fits. */
	private tellRefusal(error: HttpErrorResponse, name?: string): void {
		const code = (error.error as { error?: string } | null)?.error;

		if (code === MeetWaitingParticipantErrorCode.PARTICIPANT_NOT_WAITING && name !== undefined) {
			this.notificationService.showNotification({
				kind: 'waiting-participant-not-waiting',
				icon: 'person_off',
				tone: 'warning',
				title: { key: 'WAITING_PARTICIPANTS.ADMIN.GONE_TITLE', params: { name } },
				message: { key: 'WAITING_PARTICIPANTS.ADMIN.GONE_MESSAGE' },
				durationMs: REFUSAL_NOTICE_MS
			});
		} else if (code === MeetWaitingParticipantErrorCode.NOT_ENOUGH_PLACES && name === undefined) {
			this.notificationService.showNotification({
				kind: 'waiting-participants-not-enough-places',
				icon: 'group_off',
				tone: 'warning',
				title: { key: 'WAITING_PARTICIPANTS.ADMIN.NOT_ENOUGH_PLACES_TITLE' },
				message: { key: 'WAITING_PARTICIPANTS.ADMIN.NOT_ENOUGH_PLACES_MESSAGE' },
				durationMs: REFUSAL_NOTICE_MS
			});
		}
	}

	private apply(roomId: string, participants: MeetWaitingParticipant[], waiting: WaitingParticipantView[]): void {
		const isFirstList = !this.hasList;
		const arrived = waiting.filter(({ participant }) => !this.knocksSeen.has(knockOf(participant)));

		this.hasList = true;
		arrived.forEach(({ participant }) => this.knocksSeen.add(knockOf(participant)));
		this._waiting.set(waiting);

		if (arrived.length > 0) this.arrivals.next(arrived);

		this.report(roomId, participants, isFirstList ? [] : arrived);
	}

	/** Tells the host each new request to join and every list that differs from the last one it was told. */
	private report(roomId: string, participants: MeetWaitingParticipant[], knocked: WaitingParticipantView[]): void {
		if (!this.runtimeConfig.isEmbeddedMode()) return;

		for (const { participant } of knocked) {
			this.eventBus.emit({
				event: EmbeddedEventName.WAITING_PARTICIPANT_KNOCKED,
				payload: { roomId, participant }
			});
		}

		const payload = { roomId, participants };
		const reported = JSON.stringify(payload);

		if (reported === this.lastReported) return;

		this.lastReported = reported;
		this.eventBus.emit({ event: EmbeddedEventName.WAITING_PARTICIPANT_LIST_UPDATED, payload });
	}

	/** Tells the host how a wait of the room changed, whoever changed it. */
	private reportStatusChange({
		timestamp: _timestamp,
		...payload
	}: MeetWaitingParticipantStatusChangedSignalPayload): void {
		if (!this.runtimeConfig.isEmbeddedMode()) return;

		this.eventBus.emit({ event: EmbeddedEventName.WAITING_PARTICIPANT_STATUS_CHANGED, payload });
	}

	private async toView(participant: MeetWaitingParticipant): Promise<WaitingParticipantView> {
		return {
			participant,
			name: await this.e2ee.decryptOrMask(participant.participantName, participant.participantIdentity),
			knockedAt: participant.knockDate - this.roomMemberContext.serverTimeSkewMs(),
			color: avatarColorOf(participant.participantIdentity)
		};
	}

	private scheduleRefresh(): void {
		if (this.refreshTimer) return;

		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = undefined;
			void this.refresh();
		}, GROUPING_MS);
	}

	private startPolling(): void {
		this.stopPolling();
		this.pollTimer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
	}

	private stopPolling(): void {
		clearInterval(this.pollTimer);
		this.pollTimer = undefined;
	}

	/** Forgets everything at once: whatever answer is still on its way is dropped. */
	private reset(): void {
		this.stopPolling();
		clearTimeout(this.refreshTimer);
		this.refreshTimer = undefined;
		this.applied = this.requests;
		this.knocksSeen.clear();
		this.hasList = false;
		this.lastReported = undefined;
		this._waiting.set([]);
	}

	private waitingParticipantsPath(roomId: string): string {
		return `${HttpService.API_PATH_PREFIX}/meetings/${encodeURIComponent(roomId)}/waiting-participants`;
	}
}
