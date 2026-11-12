import { HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import {
	EmbeddedEventName,
	MEET_WAITING_ROOM_STATE_MESSAGE,
	MeetEventOrigin,
	MeetWaitingRoomReason,
	MeetWaitingRoomState,
	MeetWaitingRoomStatus,
	MeetWaitingRoomTicketResponse
} from '@openvidu-meet/typings';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { HttpService } from '../../../shared/services/http.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { EmbeddedEventBusService } from '../../embedded/services/embedded-event-bus.service';
import { ACCESS_DENIED_STATUSES } from '../../room-members/services/room-member-context.service';
import { isWaitingRoomWaitEnded, isWaitingRoomFull } from '../../room-members/utils/room-member-token-failure.utils';
import { MeetingConnectionError } from '../openvidu-components/models/meeting-view-state.model';
import { LocalMediaService } from '../openvidu-components/services/local-media/local-media.service';
import { MeetingPhaseService } from '../openvidu-components/services/meeting-phase/meeting-phase.service';
import { JoinAnswer, JoinRequest, JoinTokenService } from '../services/join-token.service';
import { MeetingContextService } from '../services/meeting-context.service';
import { WebSocketService, WebSocketStopReason } from '../services/websocket.service';

/** How a wait ended without the participant being let in, as the screen that follows tells it. */
export type WaitingRoomOutcome = 'rejected' | 'left' | 'expired' | 'meeting_ended' | 'full';

/** The client gives up this long after the last message of the wait's connection: the server's minute. */
const GIVE_UP_AFTER_MS = 60_000;
/** A token request that keeps failing for another reason than an answer is retried this long. */
const FAILING_REQUEST_RETRY_MS = 30_000;
const FAILING_REQUEST_RETRY_DELAY_MS = 3_000;
const RATE_LIMIT_DEFAULT_RESET_MS = 10_000;

/** How a wait ended: its status and, when the meeting knows it, who caused it. */
type WaitingRoomEnd = Pick<MeetWaitingRoomState, 'status' | 'origin' | 'reason'>;

/** What the host is told of a state of the wait. */
type Reported = Pick<MeetWaitingRoomState, 'status' | 'queuePosition' | 'origin' | 'reason'>;

/** One participant's way through the waiting room, from asking to join until they connect or the wait ends. */
interface Entry {
	request: JoinRequest;
	resolve: (token: string) => void;
	reject: (error: unknown) => void;
	ticket?: MeetWaitingRoomTicketResponse;
	tokenRequestInFlight?: boolean;
	endedWhileRequesting?: WaitingRoomEnd;
	waitingWhileRequesting?: MeetWaitingRoomState;
	lastReported?: string;
}

/**
 * The participant who waits to be let in: asks to join, holds the ticket of the wait and its realtime
 * connection, follows the states the server sends and, once let in, asks for the token to join with.
 */
@Service()
export class WaitingRoomService {
	private readonly joinToken = inject(JoinTokenService);
	private readonly webSocket = inject(WebSocketService);
	private readonly meetingPhase = inject(MeetingPhaseService);
	private readonly meetingContext = inject(MeetingContextService);
	private readonly localMedia = inject(LocalMediaService);
	private readonly navigation = inject(NavigationService);
	private readonly runtimeConfig = inject(RuntimeConfigService);
	private readonly sessionStorage = inject(SessionStorageService);
	private readonly eventBus = inject(EmbeddedEventBusService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - WaitingRoomService');

	private entry?: Entry;

	private readonly _status = signal<MeetWaitingRoomStatus.WAITING | MeetWaitingRoomStatus.ADMITTED | undefined>(
		undefined
	);
	private readonly _queuePosition = signal<number | undefined>(undefined);
	private readonly _knockedAt = signal<number | undefined>(undefined);
	private readonly _meetingActive = signal<boolean | undefined>(undefined);
	private readonly _message = signal<string | undefined>(undefined);
	private readonly _heard = signal(false);
	private readonly _outcome = signal<WaitingRoomOutcome | undefined>(undefined);
	private readonly _hasWaited = signal(false);

	/** `waiting` or `admitted` while the participant waits; undefined otherwise. */
	readonly status = this._status.asReadonly();
	readonly isWaiting = computed(() => this._status() !== undefined);
	/** Place in line, from 1. */
	readonly queuePosition = this._queuePosition.asReadonly();
	/** When the participant asked to join, in this device's time. */
	readonly knockedAt = this._knockedAt.asReadonly();
	/** Whether a meeting runs in the room; undefined until the server could tell. */
	readonly meetingActive = this._meetingActive.asReadonly();
	readonly message = this._message.asReadonly();
	readonly isReconnecting = computed(() => this.isWaiting() && this._heard() && !this.webSocket.isConnected());
	/** How the last wait ended without admission, while its screen shows. */
	readonly outcome = this._outcome.asReadonly();
	/** Whether a wait ended during this visit, so asking again skips the device setup screen. */
	readonly hasWaited = this._hasWaited.asReadonly();

	constructor() {
		this.webSocket
			.messages$<MeetWaitingRoomState>(MEET_WAITING_ROOM_STATE_MESSAGE)
			.pipe(takeUntilDestroyed())
			.subscribe((state) => this.onState(state));

		effect(() => {
			const reason = this.webSocket.stopReason();

			if (reason) untracked(() => this.onConnectionStopped(reason));
		});

		fromEvent(window, 'pagehide')
			.pipe(takeUntilDestroyed())
			.subscribe(() => this.onPageHide());
	}

	/**
	 * Asks to join and resolves to the token to connect with: at once, or once the participant is let in.
	 * A wait that ends otherwise never resolves: its outcome screen takes over.
	 */
	join(request: JoinRequest): Promise<string> {
		return new Promise((resolve, reject) => {
			const entry: Entry = { request, resolve, reject };
			this.entry = entry;
			this.ask(entry).catch(reject);
		});
	}

	/** Whether a wait of this room is unfinished in this tab, as a reload leaves it. The next request to join continues it. */
	hasPendingWait(): boolean {
		return !!this.pendingWait();
	}

	/** Leaves the waiting room: tells the server even while the connection is down, and disconnects. */
	leave(): void {
		const entry = this.entry;

		if (!entry?.ticket) return;

		this.sendLeave(entry.ticket);
		this.finish(entry);
		this.report(entry, { status: MeetWaitingRoomStatus.LEFT, origin: MeetEventOrigin.PARTICIPANT });
		this.show('left');
	}

	/** Leaves the outcome screen, so the meeting asks to join again like the first time. */
	askAgain(): void {
		this._outcome.set(undefined);
	}

	/** The meeting page is gone: the place is lost a minute later, as for a closed page. */
	dispose(): void {
		if (this.entry) this.finish(this.entry);

		this._outcome.set(undefined);
		this._hasWaited.set(false);
	}

	/**
	 * The page closes, reloads or navigates away: the wait ends at once, and the tab keeps only that it was
	 * waiting, so a reload asks again on its own. A page the system discards without this event keeps its
	 * place until the server's minute.
	 */
	private onPageHide(): void {
		const ticket = this.entry?.ticket;

		if (!ticket) return;

		this.sendLeave(ticket, MeetWaitingRoomReason.PAGE_CLOSED);
		this.sessionStorage.setWaitingRoomTicket(this.meetingContext.roomId() ?? '');
	}

	/** Not through HttpService: its XHR has no keepalive, and its room member header would force a preflight. */
	private sendLeave(ticket: MeetWaitingRoomTicketResponse, reason?: MeetWaitingRoomReason.PAGE_CLOSED): void {
		const roomId = encodeURIComponent(this.meetingContext.roomId() ?? '');
		const query = `waitingRoomTicket=${encodeURIComponent(ticket.waitingRoomTicket)}${reason ? `&reason=${reason}` : ''}`;
		const url = this.runtimeConfig.resolveUrl(
			`${HttpService.INTERNAL_API_PATH_PREFIX}/meetings/${roomId}/waiting-room/leave?${query}`
		);
		fetch(url, { method: 'POST', keepalive: true }).catch((error) =>
			this.log.w('The request to leave the waiting room failed:', error)
		);
	}

	private async ask(entry: Entry): Promise<void> {
		let answer: JoinAnswer;

		try {
			answer = await this.requestAnswer(entry);
		} catch (error) {
			if (this.entry !== entry || !isWaitingRoomFull(error)) throw error;

			this.finish(entry);
			this.show('full');
			return;
		}

		if (this.entry !== entry) return;

		if (answer.kind === 'token') {
			this.connect(entry, answer.token);
		} else {
			this.wait(entry, answer.ticket);
		}
	}

	/**
	 * Continues the wait a reload interrupted without the page telling Meet, which keeps its place and
	 * identity, and starts a new one when that wait is over, cannot be continued or has no ticket.
	 */
	private async requestAnswer(entry: Entry): Promise<JoinAnswer> {
		const ticket = this.pendingWait()?.ticket;

		if (ticket) {
			try {
				return await this.joinToken.requestWithTicket(entry.request, ticket.waitingRoomTicket);
			} catch (error) {
				this.log.d('The wait left by the reload cannot be continued:', error);
			}
		}

		this.sessionStorage.removeWaitingRoomTicket();
		return this.joinToken.request(entry.request);
	}

	private pendingWait(): { ticket?: MeetWaitingRoomTicketResponse } | null {
		return this.sessionStorage.getWaitingRoomWait(this.meetingContext.roomId() ?? '');
	}

	private wait(entry: Entry, ticket: MeetWaitingRoomTicketResponse): void {
		entry.ticket = ticket;
		this.sessionStorage.setWaitingRoomTicket(this.meetingContext.roomId() ?? '', ticket);
		this._status.set(MeetWaitingRoomStatus.WAITING);
		this._queuePosition.set(undefined);
		this._knockedAt.set(Date.now());
		this._meetingActive.set(undefined);
		this._message.set(undefined);
		this._heard.set(false);
		this.meetingPhase.set('waiting');
		this.webSocket.connect(
			{ name: 'waitingRoomTicket', value: ticket.waitingRoomTicket },
			{ giveUpAfterMs: GIVE_UP_AFTER_MS }
		);
	}

	private onState(state: MeetWaitingRoomState): void {
		const entry = this.entry;

		if (!entry?.ticket) return;

		this._heard.set(true);

		// A room the server could read carries meetingActive; without it, what is shown stays.
		if (state.meetingActive !== undefined) {
			this._meetingActive.set(state.meetingActive);
			this._message.set(state.message);
		}

		if (state.status !== MeetWaitingRoomStatus.WAITING && state.status !== MeetWaitingRoomStatus.ADMITTED) {
			if (entry.tokenRequestInFlight) {
				entry.endedWhileRequesting ??= { status: state.status, origin: state.origin, reason: state.reason };
			} else {
				this.end(entry, state);
			}

			return;
		}

		if (entry.tokenRequestInFlight) {
			if (state.status === MeetWaitingRoomStatus.WAITING) entry.waitingWhileRequesting = state;

			return;
		}

		this._status.set(state.status);

		if (state.status === MeetWaitingRoomStatus.ADMITTED) {
			this.report(entry, { status: state.status, origin: state.origin, reason: state.reason });
			void this.requestToken(entry);
			return;
		}

		this._queuePosition.set(state.queuePosition);

		if (state.waitedSeconds !== undefined) {
			this._knockedAt.set(Date.now() - state.waitedSeconds * 1000);
		}

		this.report(entry, { status: state.status, queuePosition: state.queuePosition });
	}

	/** Asks for the token with the ticket, one request at a time; only its answer decides. */
	private async requestToken(entry: Entry): Promise<void> {
		entry.tokenRequestInFlight = true;
		const failingSince = Date.now();

		for (;;) {
			if (entry.endedWhileRequesting) {
				entry.tokenRequestInFlight = false;
				return this.end(entry, entry.endedWhileRequesting);
			}

			let answer: JoinAnswer;

			try {
				answer = await this.joinToken.requestWithTicket(entry.request, entry.ticket!.waitingRoomTicket);
			} catch (error) {
				if (this.entry !== entry) return;

				const retryInMs = this.retryDelay(error, failingSince);

				if (retryInMs === undefined) {
					entry.tokenRequestInFlight = false;
					return this.onTokenRequestFailed(entry, error);
				}

				await new Promise((resolve) => setTimeout(resolve, retryInMs));

				if (this.entry !== entry) return;

				continue;
			}

			// Left or gone meanwhile: the token is discarded.
			if (this.entry !== entry) return;

			entry.tokenRequestInFlight = false;

			if (answer.kind === 'token') {
				this.localMedia.stopWaitingForDevices();

				if (document.visibilityState === 'hidden') {
					this.localMedia
						.setMicrophoneEnabled(false)
						.catch((error) => this.log.w('Could not turn the microphone off:', error));
				}

				return this.connect(entry, answer.token);
			}

			if (entry.endedWhileRequesting) return this.end(entry, entry.endedWhileRequesting);

			const backInLine = entry.waitingWhileRequesting ?? { status: MeetWaitingRoomStatus.WAITING };
			entry.waitingWhileRequesting = undefined;
			return this.onState(backInLine);
		}
	}

	private retryDelay(error: unknown, failingSince: number): number | undefined {
		if (!(error instanceof HttpErrorResponse)) return undefined;

		if (error.status === 429) {
			const resetSeconds = /reset=(\d+)/.exec(error.headers?.get('RateLimit') ?? '')?.[1];
			return resetSeconds ? Number(resetSeconds) * 1000 : RATE_LIMIT_DEFAULT_RESET_MS;
		}

		const failed = error.status === 0 || error.status >= 500;
		return failed && Date.now() - failingSince < FAILING_REQUEST_RETRY_MS
			? FAILING_REQUEST_RETRY_DELAY_MS
			: undefined;
	}

	private onTokenRequestFailed(entry: Entry, error: unknown): void {
		const status = error instanceof HttpErrorResponse ? error.status : undefined;

		if (entry.endedWhileRequesting) return this.end(entry, entry.endedWhileRequesting);

		if (isWaitingRoomWaitEnded(error)) {
			const endedAs: MeetWaitingRoomStatus | undefined = (error as HttpErrorResponse).error?.status;
			return this.end(entry, { status: endedAs ?? MeetWaitingRoomStatus.EXPIRED });
		}

		this.finish(entry);

		if (status !== undefined && [...ACCESS_DENIED_STATUSES, 400, 409, 422].includes(status)) {
			void this.joinToken.showFailure(error);
		} else {
			this.log.e('The token to join after being let in could not be requested:', error);
			entry.reject(new MeetingConnectionError('The token to join could not be requested', { cause: error }));
		}
	}

	private onConnectionStopped(reason: WebSocketStopReason): void {
		const entry = this.entry;

		if (!entry?.ticket) return;

		if (reason === 'gave_up' && !this._heard()) {
			console.error(
				`[OpenVidu Meet] The waiting room could not connect to ${this.webSocket.endpoint()}. ` +
					'A proxy or network between this browser and OpenVidu Meet may be blocking WebSocket connections.'
			);
			this.finish(entry);
			entry.reject(new MeetingConnectionError('The waiting room could not connect'));
			return;
		}

		const expired = {
			status: MeetWaitingRoomStatus.EXPIRED,
			origin: MeetEventOrigin.SYSTEM,
			reason: MeetWaitingRoomReason.CONNECTION_LOST
		};

		if (entry.tokenRequestInFlight) {
			entry.endedWhileRequesting ??= expired;
		} else {
			this.end(entry, expired);
		}
	}

	/** Ends the wait with the status the server reported or the client concluded, and shows its screen. */
	private end(entry: Entry, ended: WaitingRoomEnd): void {
		const { status } = ended;
		this.finish(entry);

		// A 409 after an admission means its answer was lost: the place is, too.
		if (status === MeetWaitingRoomStatus.ADMITTED) {
			this.report(entry, { status: MeetWaitingRoomStatus.EXPIRED, origin: MeetEventOrigin.SYSTEM });
		} else {
			this.report(entry, ended);
		}

		switch (status) {
			case MeetWaitingRoomStatus.ROOM_CLOSED:
				void this.navigation.redirectToErrorPage(NavigationErrorReason.CLOSED_ROOM, true);
				break;
			case MeetWaitingRoomStatus.REJECTED:
				this.show('rejected');
				break;
			case MeetWaitingRoomStatus.MEETING_ENDED:
				this.show('meeting_ended');
				break;
			default:
				// The server reports `left` only to a wait that a newer request of the same participant replaced.
				this.show('expired');
		}
	}

	private connect(entry: Entry, token: string): void {
		this.finish(entry);
		this.meetingPhase.set('connecting');
		this.meetingContext.setIsActiveMeeting(true);
		entry.resolve(token);
	}

	private finish(entry: Entry): void {
		if (this.entry === entry) this.entry = undefined;

		if (entry.ticket) this.webSocket.disconnect();

		this.sessionStorage.removeWaitingRoomTicket();

		this._status.set(undefined);
	}

	private show(outcome: WaitingRoomOutcome): void {
		// The preview closes with the screen: device commands must not reopen it.
		this.meetingPhase.set('disconnected');
		this._hasWaited.set(true);
		this._outcome.set(outcome);
	}

	/** Tells the host each state shown, once, with the participant as the server answered when they asked. */
	private report(entry: Entry, { status, queuePosition, origin, reason }: Reported): void {
		const reported = `${status}:${queuePosition ?? ''}`;

		if (!entry.ticket || entry.lastReported === reported || !this.runtimeConfig.isEmbeddedMode()) return;

		entry.lastReported = reported;
		this.eventBus.emit({
			event: EmbeddedEventName.PARTICIPANT_WAITING_CHANGED,
			payload: {
				roomId: this.meetingContext.roomId() ?? '',
				participant: entry.ticket.participant,
				status,
				...(queuePosition !== undefined && { queuePosition }),
				...(origin !== undefined && { origin }),
				...(reason !== undefined && { reason })
			}
		});
	}
}
