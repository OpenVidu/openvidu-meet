import { HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
	EmbeddedEventName,
	MeetLobbyDecisionOptions,
	MeetLobbyDecisionResponse,
	MeetLobbyList,
	MeetLobbyParticipant,
	MeetSignalType
} from '@openvidu-meet/typings';
import { filter, Subject } from 'rxjs';
import { HttpService } from '../../../shared/services/http.service';
import { LoggerService } from '../../../shared/services/logger.service';
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
/** The list is read this often anyway, so a lost signal shows within this time. */
const POLL_INTERVAL_MS = 30_000;

/** A participant waiting to be let in, as the meeting shows them. */
export interface LobbyWaiter {
	participant: MeetLobbyParticipant;
	/** The name decrypted, or masked, in an encrypted room. */
	name: string;
	/** When they asked to join, in this device's time. */
	knockedAt: number;
}

export type LobbyDecision = 'admit' | 'reject';

const knockOf = ({ participantIdentity, knockDate }: MeetLobbyParticipant) => `${participantIdentity}:${knockDate}`;

/**
 * The side of the waiting room of whoever may let participants in: holds the waiting list while the local
 * participant is in the meeting with `lobbyAdmin`, tells the host about it, and admits or rejects.
 */
@Service()
export class LobbyAdminService {
	private readonly http = inject(HttpService);
	private readonly meetingContext = inject(MeetingContextService);
	private readonly roomMemberContext = inject(RoomMemberContextService);
	private readonly meetingLiveKit = inject(MeetingLiveKitService);
	private readonly participantService = inject(ParticipantService);
	private readonly e2ee = inject(E2eeService);
	private readonly eventBus = inject(EmbeddedEventBusService);
	private readonly runtimeConfig = inject(RuntimeConfigService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - LobbyAdminService');

	private readonly _waiting = signal<LobbyWaiter[]>([]);
	private readonly _availablePlaces = signal<number | null>(null);
	private readonly arrivals = new Subject<LobbyWaiter[]>();

	/** Whether the local participant is in the meeting and may let others in. */
	readonly isAdmitting = computed(
		() => this.meetingLiveKit.isSessionActive() && this.roomMemberContext.hasPermission('lobbyAdmin')
	);
	/** Those waiting, in arrival order. */
	readonly waiting = this._waiting.asReadonly();
	/** Free places of the meeting; `null` without a participant limit. */
	readonly availablePlaces = this._availablePlaces.asReadonly();
	/** How many of those waiting fit in the free places, first in line first. */
	readonly admittable = computed(() => {
		const places = this._availablePlaces();
		const count = this._waiting().length;
		return places === null ? count : Math.min(count, places);
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
	private participantsInMeeting = 0;
	private refreshTimer?: ReturnType<typeof setTimeout>;
	private pollTimer?: ReturnType<typeof setInterval>;

	constructor() {
		effect(() => {
			const admitting = this.isAdmitting();
			const connected = this.meetingLiveKit.isConnected();

			untracked(() => {
				if (!admitting) {
					this.reset();
				} else if (connected) {
					this.startPolling();
					void this.refresh();
				} else {
					this.stopPolling();
				}
			});
		});

		effect(() => {
			const participantsInMeeting = this.participantService.remoteParticipants().length;
			untracked(() => this.onParticipantsInMeeting(participantsInMeeting));
		});

		inject(MeetingEventsService)
			.meetSignals$.pipe(
				filter(({ topic }) => topic === MeetSignalType.MEET_LOBBY_UPDATED),
				takeUntilDestroyed()
			)
			.subscribe(() => {
				if (this.isAdmitting()) this.scheduleRefresh();
			});
	}

	/** Reads the waiting list again. Only the answer to the latest request is applied. */
	async refresh(): Promise<void> {
		const roomId = this.meetingContext.roomId();

		if (!roomId || !this.isAdmitting()) return;

		const request = ++this.requests;
		let list: MeetLobbyList;

		try {
			list = await this.http.getRequest<MeetLobbyList>(this.lobbyPath(roomId));
		} catch (error) {
			this.log.w('The waiting list could not be read:', error);
			return;
		}

		const waiting = await Promise.all(list.participants.map((participant) => this.toWaiter(participant)));

		if (request <= this.applied || !this.isAdmitting()) return;

		this.applied = request;
		this.apply(roomId, list, waiting);
	}

	/** Admits the participants named, or everyone waiting up to the free places when none is named. */
	admit(participantIdentities?: string[]): Promise<MeetLobbyParticipant[]> {
		return this.decide('admit', participantIdentities);
	}

	/** Rejects the participants named, or everyone waiting when none is named. */
	reject(participantIdentities?: string[]): Promise<MeetLobbyParticipant[]> {
		return this.decide('reject', participantIdentities);
	}

	/** Admits the first in line shown that fit in the free places. */
	async admitShown(): Promise<MeetLobbyParticipant[]> {
		const shown = this._waiting().slice(0, this.admittable());

		if (shown.length === 0) return [];

		return this.admit(shown.map(({ participant }) => participant.participantIdentity));
	}

	/** A decision the line no longer allows (someone left, or no longer fits) shows the new line instead. */
	private async decide(decision: LobbyDecision, participantIdentities?: string[]): Promise<MeetLobbyParticipant[]> {
		const roomId = this.meetingContext.roomId();

		if (!roomId) throw new Error(`Cannot ${decision} participants outside a meeting`);

		const body: MeetLobbyDecisionOptions = participantIdentities === undefined ? {} : { participantIdentities };

		try {
			const { participants } = await this.http.postRequest<MeetLobbyDecisionResponse>(
				`${this.lobbyPath(roomId)}/${decision}`,
				body
			);
			return participants;
		} catch (error) {
			if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 409)) {
				void this.refresh();
			}

			throw error;
		}
	}

	private apply(roomId: string, list: MeetLobbyList, waiting: LobbyWaiter[]): void {
		const isFirstList = !this.hasList;
		const arrived = waiting.filter(({ participant }) => !this.knocksSeen.has(knockOf(participant)));

		this.hasList = true;
		arrived.forEach(({ participant }) => this.knocksSeen.add(knockOf(participant)));
		this._waiting.set(waiting);
		this._availablePlaces.set(list.availablePlaces);

		if (arrived.length > 0) this.arrivals.next(arrived);

		this.report(roomId, list, isFirstList ? [] : arrived);
	}

	/** Tells the host each new request to join and every list that differs from the last one it was told. */
	private report(roomId: string, list: MeetLobbyList, knocked: LobbyWaiter[]): void {
		if (!this.runtimeConfig.isEmbeddedMode()) return;

		for (const { participant } of knocked) {
			this.eventBus.emit({ event: EmbeddedEventName.PARTICIPANT_KNOCKED, payload: { roomId, participant } });
		}

		const payload = { roomId, participants: list.participants, availablePlaces: list.availablePlaces };
		const reported = JSON.stringify(payload);

		if (reported === this.lastReported) return;

		this.lastReported = reported;
		this.eventBus.emit({ event: EmbeddedEventName.LOBBY_UPDATED, payload });
	}

	private async toWaiter(participant: MeetLobbyParticipant): Promise<LobbyWaiter> {
		return {
			participant,
			name: await this.e2ee.decryptOrMask(participant.participantName, participant.participantIdentity),
			knockedAt: participant.knockDate - this.roomMemberContext.serverTimeSkewMs()
		};
	}

	/** The free places follow the meeting: someone leaving it makes room for those waiting. */
	private onParticipantsInMeeting(count: number): void {
		if (count === this.participantsInMeeting) return;

		this.participantsInMeeting = count;

		if (this.isAdmitting() && this._waiting().length > 0) this.scheduleRefresh();
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
		this._availablePlaces.set(null);
	}

	private lobbyPath(roomId: string): string {
		return `${HttpService.API_PATH_PREFIX}/meetings/${encodeURIComponent(roomId)}/lobby`;
	}
}
