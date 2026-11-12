import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	EmbeddedEventName,
	MeetEventOrigin,
	MeetWaitingRoomErrorCode,
	MeetWaitingRoomParticipant,
	MeetWaitingRoomParticipantType,
	MeetWaitingRoomReason,
	MeetWaitingRoomState,
	MeetWaitingRoomStatus
} from '@openvidu-meet/typings';
import { Subject } from 'rxjs';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { EmbeddedEventBusService } from '../../embedded/services/embedded-event-bus.service';
import { MeetingConnectionError } from '../openvidu-components/models/meeting-view-state.model';
import { LocalMediaService } from '../openvidu-components/services/local-media/local-media.service';
import { MeetingPhaseService } from '../openvidu-components/services/meeting-phase/meeting-phase.service';
import { JoinAnswer, JoinRequest, JoinTokenService } from '../services/join-token.service';
import { MeetingContextService } from '../services/meeting-context.service';
import { WebSocketService, WebSocketStopReason } from '../services/websocket.service';
import { WaitingRoomService } from './waiting-room.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

class WebSocketServiceStub {
	readonly states = new Subject<MeetWaitingRoomState>();
	readonly isConnected = signal(true);
	readonly stopReason = signal<WebSocketStopReason | undefined>(undefined);
	readonly connect = jasmine.createSpy('connect');
	readonly disconnect = jasmine.createSpy('disconnect');

	messages$() {
		return this.states.asObservable();
	}

	endpoint(): string {
		return 'wss://meet.test/meet/internal-api/v1/ws';
	}
}

/** Lets every continuation chained onto a settled promise run before the expectations read it. */
async function flush(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

class Deferred<T> {
	resolve!: (value: T) => void;
	reject!: (error: unknown) => void;
	readonly promise = new Promise<T>((resolve, reject) => {
		this.resolve = resolve;
		this.reject = reject;
	});
}

const ROOM_ID = 'room1';
const PARTICIPANT: MeetWaitingRoomParticipant = {
	participantIdentity: 'ana-1',
	participantName: 'Ana',
	type: MeetWaitingRoomParticipantType.ANONYMOUS,
	knockDate: 1_800_000_000_000
};
const TICKET = { waitingRoomTicket: 'ticket/1', participant: PARTICIPANT };
const ANA: JoinRequest = { participantName: 'Ana', e2eeKey: '', nameTypedByParticipant: true };
const WAITING: JoinAnswer = { kind: 'waiting', ticket: TICKET };
const tokenAnswer = (token = 'join-token'): JoinAnswer => ({ kind: 'token', token });
const refusal = (status: number, error: object = {}, headers?: HttpHeaders) =>
	new HttpErrorResponse({ status, error, headers });

/**
 * The participant who waits to be let in. The server's states may arrive in any order and be
 * repeated, so what is asserted is that only the answer to the token request decides an admission,
 * that a final state is final, and that the host hears each state once.
 */
describe('WaitingRoomService', () => {
	let service: WaitingRoomService;
	let joinToken: jasmine.SpyObj<JoinTokenService>;
	let webSocket: WebSocketServiceStub;
	let phase: MeetingPhaseService;
	let eventBus: EmbeddedEventBusService;
	let setIsActiveMeeting: jasmine.Spy;
	let setMicrophoneEnabled: jasmine.Spy;
	let stopWaitingForDevices: jasmine.Spy;
	let redirectToErrorPage: jasmine.Spy;
	let fetchSpy: jasmine.Spy;

	beforeEach(() => {
		joinToken = jasmine.createSpyObj<JoinTokenService>('JoinTokenService', [
			'request',
			'requestWithTicket',
			'showFailure'
		]);
		joinToken.request.and.resolveTo(WAITING);
		joinToken.showFailure.and.resolveTo();
		webSocket = new WebSocketServiceStub();
		setIsActiveMeeting = jasmine.createSpy('setIsActiveMeeting');
		setMicrophoneEnabled = jasmine.createSpy('setMicrophoneEnabled').and.resolveTo();
		stopWaitingForDevices = jasmine.createSpy('stopWaitingForDevices');
		redirectToErrorPage = jasmine.createSpy('redirectToErrorPage').and.resolveTo();
		fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 204 }));

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: JoinTokenService, useValue: joinToken },
				{ provide: WebSocketService, useValue: webSocket },
				{ provide: MeetingContextService, useValue: { roomId: () => ROOM_ID, setIsActiveMeeting } },
				{ provide: LocalMediaService, useValue: { setMicrophoneEnabled, stopWaitingForDevices } },
				{ provide: NavigationService, useValue: { redirectToErrorPage } },
				{
					provide: RuntimeConfigService,
					useValue: { isEmbeddedMode: () => true, resolveUrl: (path: string) => `/meet/${path}` }
				}
			]
		});

		TestBed.inject(SessionStorageService).removeWaitingRoomTicket();
		service = TestBed.inject(WaitingRoomService);
		phase = TestBed.inject(MeetingPhaseService);
		eventBus = TestBed.inject(EmbeddedEventBusService);
		phase.set('connecting');
	});

	const send = (state: MeetWaitingRoomState) => webSocket.states.next(state);

	const waitingRoomEvents = () =>
		eventBus
			.events()
			.filter(({ event }) => event === EmbeddedEventName.PARTICIPANT_WAITING_CHANGED)
			.map((event) => (event as { payload: unknown }).payload);

	const waitingRoomStatuses = () =>
		waitingRoomEvents().map((payload) => (payload as { status: MeetWaitingRoomStatus }).status);

	const waitingRoomOrigins = () =>
		waitingRoomEvents().map((payload) => (payload as { origin?: MeetEventOrigin }).origin);

	/** Starts a wait and lets it be admitted, with the token request answering what `answer` settles to. */
	async function admitWith(answer: Deferred<JoinAnswer>): Promise<{ joined: jasmine.Spy }> {
		joinToken.requestWithTicket.and.returnValue(answer.promise);
		const joined = jasmine.createSpy('joined');
		service.join(ANA).then(joined, () => {});
		await flush();
		send({ status: MeetWaitingRoomStatus.ADMITTED });
		await flush();
		return { joined };
	}

	describe('asking to join', () => {
		it('connects at once with a token answered to the request', async () => {
			joinToken.request.and.resolveTo(tokenAnswer());

			await expectAsync(service.join(ANA)).toBeResolvedTo('join-token');

			expect(webSocket.connect).not.toHaveBeenCalled();
			expect(setIsActiveMeeting).toHaveBeenCalledOnceWith(true);
		});

		it('waits on a ticket, connecting with it at once, without marking the meeting active', async () => {
			void service.join(ANA);
			await flush();

			expect(phase.phase()).toBe('waiting');
			expect(service.isWaiting()).toBeTrue();
			expect(webSocket.connect).toHaveBeenCalledOnceWith(
				{ name: 'waitingRoomTicket', value: TICKET.waitingRoomTicket },
				{ giveUpAfterMs: 60_000 }
			);
			expect(setIsActiveMeeting).not.toHaveBeenCalled();
		});

		it('shows the full waiting room screen, with no waiting room event', async () => {
			joinToken.request.and.rejectWith(refusal(409, { error: MeetWaitingRoomErrorCode.WAITING_ROOM_FULL }));

			void service.join(ANA);
			await flush();

			expect(service.outcome()).toBe('full');
			expect(waitingRoomEvents()).toEqual([]);
		});

		it('shows nothing when the full waiting room answers after the page went away', async () => {
			joinToken.request.and.rejectWith(refusal(409, { error: MeetWaitingRoomErrorCode.WAITING_ROOM_FULL }));

			service.join(ANA).catch(() => undefined);
			service.dispose();
			await flush();

			expect(service.outcome()).toBeUndefined();
			expect(phase.phase()).not.toBe('disconnected');
		});
	});

	describe('after a reload', () => {
		const leaveWaitBehind = () => TestBed.inject(SessionStorageService).setWaitingRoomTicket(ROOM_ID, TICKET);

		it('remembers the wait while it lasts, and forgets it when it ends', async () => {
			expect(service.hasPendingWait()).toBeFalse();

			void service.join(ANA);
			await flush();

			expect(service.hasPendingWait()).toBeTrue();

			service.leave();

			expect(service.hasPendingWait()).toBeFalse();
		});

		it('continues the wait with its ticket instead of asking again', async () => {
			leaveWaitBehind();
			joinToken.requestWithTicket.and.resolveTo(WAITING);

			expect(service.hasPendingWait()).toBeTrue();

			void service.join(ANA);
			await flush();

			expect(joinToken.requestWithTicket).toHaveBeenCalledOnceWith(ANA, TICKET.waitingRoomTicket);
			expect(joinToken.request).not.toHaveBeenCalled();
			expect(webSocket.connect).toHaveBeenCalledOnceWith(
				{ name: 'waitingRoomTicket', value: TICKET.waitingRoomTicket },
				{ giveUpAfterMs: 60_000 }
			);
			expect(service.isWaiting()).toBeTrue();
		});

		it('joins with the token the ticket answers once the participant was let in', async () => {
			leaveWaitBehind();
			joinToken.requestWithTicket.and.resolveTo(tokenAnswer());

			await expectAsync(service.join(ANA)).toBeResolvedTo('join-token');

			expect(joinToken.request).not.toHaveBeenCalled();
			expect(service.hasPendingWait()).toBeFalse();
		});

		it('asks again when the wait is over', async () => {
			leaveWaitBehind();
			joinToken.requestWithTicket.and.rejectWith(refusal(409, { error: MeetWaitingRoomErrorCode.WAIT_ENDED }));

			void service.join(ANA);
			await flush();

			expect(joinToken.request).toHaveBeenCalledOnceWith(ANA);
			expect(service.isWaiting()).toBeTrue();
		});

		it('does not continue the wait of another room', () => {
			TestBed.inject(SessionStorageService).setWaitingRoomTicket('other-room', TICKET);

			expect(service.hasPendingWait()).toBeFalse();
		});
	});

	describe('states of the wait', () => {
		beforeEach(async () => {
			void service.join(ANA).catch(() => {});
			await flush();
		});

		it('tells the host nothing until the first state, then each place in line once', () => {
			expect(waitingRoomEvents()).toEqual([]);

			send({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 2, waitedSeconds: 240, meetingActive: false });
			send({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 2, waitedSeconds: 260, meetingActive: false });
			send({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 1, waitedSeconds: 280, meetingActive: true });

			expect(waitingRoomEvents()).toEqual([
				{
					roomId: ROOM_ID,
					participant: PARTICIPANT,
					status: 'waiting',
					queuePosition: 2
				},
				{
					roomId: ROOM_ID,
					participant: PARTICIPANT,
					status: 'waiting',
					queuePosition: 1
				}
			]);
			expect(service.queuePosition()).toBe(1);
			expect(service.meetingActive()).toBeTrue();
		});

		it('keeps the room fields it shows when the server could not read the room', () => {
			send({
				status: MeetWaitingRoomStatus.WAITING,
				queuePosition: 1,
				meetingActive: false,
				message: 'At 10:00'
			});
			send({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 1 });

			expect(service.meetingActive()).toBeFalse();
			expect(service.message()).toBe('At 10:00');
		});

		it('ends on a final state for good, ignoring a stale state after it', () => {
			send({ status: MeetWaitingRoomStatus.REJECTED, origin: MeetEventOrigin.MODERATOR });
			send({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 1 });

			expect(service.outcome()).toBe('rejected');
			expect(service.isWaiting()).toBeFalse();
			expect(webSocket.disconnect).toHaveBeenCalled();
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.REJECTED]);
			expect(waitingRoomOrigins()).toEqual([MeetEventOrigin.MODERATOR]);
		});

		it('says the place was lost when a newer request replaced the wait, reporting what the server said', () => {
			send({ status: MeetWaitingRoomStatus.LEFT });

			expect(service.outcome()).toBe('expired');
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.LEFT]);
		});

		it('shows the closed room screen when the room closed', () => {
			send({ status: MeetWaitingRoomStatus.ROOM_CLOSED });

			expect(redirectToErrorPage).toHaveBeenCalledOnceWith(NavigationErrorReason.CLOSED_ROOM, true);
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.ROOM_CLOSED]);
		});

		it('says the place was lost when the connection gives up after hearing from the wait', () => {
			send({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 1 });

			webSocket.stopReason.set('gave_up');
			TestBed.tick();

			expect(service.outcome()).toBe('expired');
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.WAITING, MeetWaitingRoomStatus.EXPIRED]);
			expect(waitingRoomOrigins()).toEqual([undefined, MeetEventOrigin.SYSTEM]);
			expect(waitingRoomEvents()[1]).toEqual(
				jasmine.objectContaining({ reason: MeetWaitingRoomReason.CONNECTION_LOST })
			);
		});

		it('tells the host why the wait ended when the server says it', () => {
			send({
				status: MeetWaitingRoomStatus.LEFT,
				origin: MeetEventOrigin.PARTICIPANT,
				reason: MeetWaitingRoomReason.REPLACED
			});

			expect(waitingRoomEvents()).toEqual([
				jasmine.objectContaining({
					status: MeetWaitingRoomStatus.LEFT,
					origin: MeetEventOrigin.PARTICIPANT,
					reason: MeetWaitingRoomReason.REPLACED
				})
			]);
		});
	});

	describe('a connection that never heard from the wait', () => {
		it('shows the connection error naming the WebSocket address, with no waiting room event', async () => {
			const consoleError = spyOn(console, 'error');
			const joining = service.join(ANA);
			await flush();

			webSocket.stopReason.set('gave_up');
			TestBed.tick();

			await expectAsync(joining).toBeRejectedWithError(MeetingConnectionError);
			expect(consoleError).toHaveBeenCalledWith(jasmine.stringContaining(webSocket.endpoint()));
			expect(service.outcome()).toBeUndefined();
			expect(waitingRoomEvents()).toEqual([]);
		});
	});

	describe('being let in', () => {
		it('asks for the token with the ticket and connects with it', async () => {
			const answer = new Deferred<JoinAnswer>();
			const { joined } = await admitWith(answer);

			answer.resolve(tokenAnswer('admitted-token'));
			await flush();

			expect(joinToken.requestWithTicket).toHaveBeenCalledOnceWith(ANA, TICKET.waitingRoomTicket);
			expect(joined).toHaveBeenCalledOnceWith('admitted-token');
			expect(webSocket.disconnect).toHaveBeenCalled();
			expect(phase.phase()).toBe('connecting');
			expect(setIsActiveMeeting).toHaveBeenCalledOnceWith(true);
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.ADMITTED]);
		});

		it('sends one token request however often the admission is repeated meanwhile', async () => {
			await admitWith(new Deferred<JoinAnswer>());

			send({ status: MeetWaitingRoomStatus.ADMITTED });
			send({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 3 });
			await flush();

			expect(joinToken.requestWithTicket).toHaveBeenCalledTimes(1);
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.ADMITTED]);
		});

		it('lets a token answer win over a final state that arrived meanwhile', async () => {
			const answer = new Deferred<JoinAnswer>();
			const { joined } = await admitWith(answer);

			send({ status: MeetWaitingRoomStatus.EXPIRED });
			answer.resolve(tokenAnswer());
			await flush();

			expect(joined).toHaveBeenCalledOnceWith('join-token');
			expect(service.outcome()).toBeUndefined();
		});

		it('applies a final state kept during the request once the answer is to keep waiting', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);

			send({ status: MeetWaitingRoomStatus.MEETING_ENDED });
			answer.resolve(WAITING);
			await flush();

			expect(service.outcome()).toBe('meeting_ended');
		});

		it('stays waiting when the answer is to keep waiting', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);

			answer.resolve(WAITING);
			await flush();

			expect(service.status()).toBe(MeetWaitingRoomStatus.WAITING);
			expect(webSocket.disconnect).not.toHaveBeenCalled();
		});

		it('tells the host at once that the participant is back in line, in the place a state gave meanwhile', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);
			send({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 2 });

			answer.resolve(WAITING);
			await flush();

			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.ADMITTED, MeetWaitingRoomStatus.WAITING]);
			expect(waitingRoomEvents()[1]).toEqual(jasmine.objectContaining({ queuePosition: 2 }));
			expect(service.queuePosition()).toBe(2);
		});

		it('tells the host at once that the participant is back in line, before knowing the place', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);

			answer.resolve(WAITING);
			await flush();
			send({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 3 });

			expect(waitingRoomStatuses()).toEqual([
				MeetWaitingRoomStatus.ADMITTED,
				MeetWaitingRoomStatus.WAITING,
				MeetWaitingRoomStatus.WAITING
			]);
			expect(waitingRoomEvents()[1]).not.toEqual(jasmine.objectContaining({ queuePosition: jasmine.anything() }));
			expect(waitingRoomEvents()[2]).toEqual(jasmine.objectContaining({ queuePosition: 3 }));
		});

		it('ignores every later state once it holds the token', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);
			answer.resolve(tokenAnswer());
			await flush();

			send({ status: MeetWaitingRoomStatus.REJECTED });

			expect(service.outcome()).toBeUndefined();
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.ADMITTED]);
		});

		it('says the place was lost on a 409 that names the admission, telling the host it expired', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);

			answer.reject(
				refusal(409, { error: MeetWaitingRoomErrorCode.WAIT_ENDED, status: MeetWaitingRoomStatus.ADMITTED })
			);
			await flush();

			expect(service.outcome()).toBe('expired');
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.ADMITTED, MeetWaitingRoomStatus.EXPIRED]);
		});

		it('shows the screen of the status a 409 names', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);

			answer.reject(
				refusal(409, { error: MeetWaitingRoomErrorCode.WAIT_ENDED, status: MeetWaitingRoomStatus.REJECTED })
			);
			await flush();

			expect(service.outcome()).toBe('rejected');
		});

		it('shows the access error of a refused request, with no waiting room event after it', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);
			const error = refusal(403, { message: 'Insufficient permissions' });

			answer.reject(error);
			await flush();

			expect(joinToken.showFailure).toHaveBeenCalledOnceWith(error);
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.ADMITTED]);
		});

		it('shows the error screen of a full meeting or a closed room, with no waiting room event after it', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);
			const error = refusal(409, { message: "Room 'room1' has reached its maximum number of participants" });

			answer.reject(error);
			await flush();

			expect(joinToken.showFailure).toHaveBeenCalledOnceWith(error);
			expect(service.outcome()).toBeUndefined();
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.ADMITTED]);
		});

		it('joins without waiting for the browser to answer a device prompt', async () => {
			const answer = new Deferred<JoinAnswer>();
			const { joined } = await admitWith(answer);

			expect(stopWaitingForDevices).not.toHaveBeenCalled();

			answer.resolve(tokenAnswer());
			await flush();

			expect(stopWaitingForDevices).toHaveBeenCalledBefore(joined);
		});

		it('joins with the microphone off when let in while the page is hidden', async () => {
			spyOnProperty(document, 'visibilityState').and.returnValue('hidden');
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);

			answer.resolve(tokenAnswer());
			await flush();

			expect(setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
		});
	});

	describe('a token request that fails', () => {
		beforeEach(() => jasmine.clock().install());

		afterEach(() => jasmine.clock().uninstall());

		it('waits for the reset a 429 gives before asking again', async () => {
			joinToken.requestWithTicket.and.returnValues(
				Promise.reject(refusal(429, {}, new HttpHeaders({ RateLimit: 'limit=200, remaining=0, reset=7' }))),
				Promise.resolve(tokenAnswer())
			);
			const joined = jasmine.createSpy('joined');
			service.join(ANA).then(joined);
			await flush();
			send({ status: MeetWaitingRoomStatus.ADMITTED });
			await flush();

			jasmine.clock().tick(6_999);
			await flush();
			expect(joinToken.requestWithTicket).toHaveBeenCalledTimes(1);

			jasmine.clock().tick(1);
			await flush();
			expect(joined).toHaveBeenCalledOnceWith('join-token');
		});

		it('stops asking again once the realtime connection is lost', async () => {
			joinToken.requestWithTicket.and.callFake(() =>
				Promise.reject(refusal(429, {}, new HttpHeaders({ RateLimit: 'limit=200, remaining=0, reset=7' })))
			);
			void service.join(ANA);
			await flush();
			send({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 1 });
			send({ status: MeetWaitingRoomStatus.ADMITTED });
			await flush();

			webSocket.stopReason.set('gave_up');
			TestBed.tick();
			jasmine.clock().tick(7_000);
			await flush();

			expect(joinToken.requestWithTicket).toHaveBeenCalledTimes(1);
			expect(service.outcome()).toBe('expired');
		});

		it('retries a server failure for 30 seconds, then shows the connection error', async () => {
			jasmine.clock().mockDate(new Date('2026-11-11T10:00:00Z'));
			joinToken.requestWithTicket.and.callFake(() => Promise.reject(refusal(503)));
			const joining = service.join(ANA);
			joining.catch(() => {});
			await flush();
			send({ status: MeetWaitingRoomStatus.ADMITTED });
			await flush();

			for (let elapsed = 0; elapsed <= 30_000; elapsed += 3_000) {
				jasmine.clock().tick(3_000);
				await flush();
			}

			await expectAsync(joining).toBeRejectedWithError(MeetingConnectionError);
			expect(joinToken.requestWithTicket.calls.count()).toBeGreaterThan(5);
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.ADMITTED]);
		});
	});

	describe('leaving the waiting room', () => {
		it('tells the server with a keepalive request carrying only the ticket, and disconnects', async () => {
			void service.join(ANA);
			await flush();

			service.leave();

			expect(fetchSpy).toHaveBeenCalledOnceWith(
				`/meet/internal-api/v1/meetings/${ROOM_ID}/waiting-room/leave?waitingRoomTicket=ticket%2F1`,
				{ method: 'POST', keepalive: true }
			);
			expect(webSocket.disconnect).toHaveBeenCalled();
			expect(service.outcome()).toBe('left');
			expect(waitingRoomStatuses()).toEqual([MeetWaitingRoomStatus.LEFT]);
			expect(waitingRoomOrigins()).toEqual([MeetEventOrigin.PARTICIPANT]);
		});

		it('discards a token answered after leaving', async () => {
			const answer = new Deferred<JoinAnswer>();
			const { joined } = await admitWith(answer);

			service.leave();
			answer.resolve(tokenAnswer());
			await flush();

			expect(joined).not.toHaveBeenCalled();
			expect(service.outcome()).toBe('left');
		});

		it('only disconnects when the meeting page is destroyed', async () => {
			void service.join(ANA);
			await flush();

			service.dispose();

			expect(fetchSpy).not.toHaveBeenCalled();
			expect(webSocket.disconnect).toHaveBeenCalled();
			expect(waitingRoomEvents()).toEqual([]);
		});
	});

	describe('when the page closes', () => {
		const pageHide = () => window.dispatchEvent(new PageTransitionEvent('pagehide'));

		it('tells the server the page closed, with a keepalive request', async () => {
			void service.join(ANA);
			await flush();

			pageHide();

			expect(fetchSpy).toHaveBeenCalledOnceWith(
				`/meet/internal-api/v1/meetings/${ROOM_ID}/waiting-room/leave?waitingRoomTicket=ticket%2F1&reason=page_closed`,
				{ method: 'POST', keepalive: true }
			);
		});

		it('asks again after the reload, without the ticket of the wait it ended', async () => {
			void service.join(ANA);
			await flush();
			pageHide();
			joinToken.request.calls.reset();

			expect(service.hasPendingWait()).toBeTrue();

			void service.join(ANA);
			await flush();

			expect(joinToken.requestWithTicket).not.toHaveBeenCalled();
			expect(joinToken.request).toHaveBeenCalledOnceWith(ANA);
		});

		it('tells nothing without a wait', () => {
			pageHide();

			expect(fetchSpy).not.toHaveBeenCalled();
			expect(service.hasPendingWait()).toBeFalse();
		});
	});

	describe('asking again', () => {
		it('asks like the first time, without the ticket', async () => {
			void service.join(ANA);
			await flush();
			send({ status: MeetWaitingRoomStatus.REJECTED });

			service.askAgain();
			void service.join(ANA);
			await flush();

			expect(service.outcome()).toBeUndefined();
			expect(service.hasWaited()).toBeTrue();
			expect(joinToken.request).toHaveBeenCalledTimes(2);
			expect(joinToken.requestWithTicket).not.toHaveBeenCalled();
		});
	});
});
