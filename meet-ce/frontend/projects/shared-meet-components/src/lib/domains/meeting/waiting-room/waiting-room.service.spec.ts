import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmbeddedEventName, MeetLobbyState, MeetLobbyStatus } from '@openvidu-meet/typings';
import { Subject } from 'rxjs';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
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
	readonly states = new Subject<MeetLobbyState>();
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
const TICKET = { lobbyTicket: 'ticket/1', participantIdentity: 'ana-1' };
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

		service = TestBed.inject(WaitingRoomService);
		phase = TestBed.inject(MeetingPhaseService);
		eventBus = TestBed.inject(EmbeddedEventBusService);
		phase.set('connecting');
	});

	const send = (state: MeetLobbyState) => webSocket.states.next(state);

	const lobbyEvents = () =>
		eventBus
			.events()
			.filter(({ event }) => event === EmbeddedEventName.LOBBY_STATUS_CHANGED)
			.map((event) => (event as { payload: unknown }).payload);

	const lobbyStatuses = () => lobbyEvents().map((payload) => (payload as { status: MeetLobbyStatus }).status);

	/** Starts a wait and lets it be admitted, with the token request answering what `answer` settles to. */
	async function admitWith(answer: Deferred<JoinAnswer>): Promise<{ joined: jasmine.Spy }> {
		joinToken.requestWithTicket.and.returnValue(answer.promise);
		const joined = jasmine.createSpy('joined');
		service.join(ANA).then(joined, () => {});
		await flush();
		send({ status: MeetLobbyStatus.ADMITTED });
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
				{ name: 'lobbyTicket', value: TICKET.lobbyTicket },
				{ giveUpAfterMs: 60_000 }
			);
			expect(setIsActiveMeeting).not.toHaveBeenCalled();
		});

		it('shows the full waiting room screen, with no lobby event', async () => {
			joinToken.request.and.rejectWith(refusal(409, { message: "The waiting room of room 'room1' is full" }));

			void service.join(ANA);
			await flush();

			expect(service.outcome()).toBe('full');
			expect(lobbyEvents()).toEqual([]);
		});
	});

	describe('states of the wait', () => {
		beforeEach(async () => {
			void service.join(ANA).catch(() => {});
			await flush();
		});

		it('tells the host nothing until the first state, then each place in line once', () => {
			expect(lobbyEvents()).toEqual([]);

			send({ status: MeetLobbyStatus.WAITING, queuePosition: 2, waitedSeconds: 240, meetingActive: false });
			send({ status: MeetLobbyStatus.WAITING, queuePosition: 2, waitedSeconds: 260, meetingActive: false });
			send({ status: MeetLobbyStatus.WAITING, queuePosition: 1, waitedSeconds: 280, meetingActive: true });

			expect(lobbyEvents()).toEqual([
				{
					roomId: ROOM_ID,
					participantIdentity: TICKET.participantIdentity,
					status: 'waiting',
					queuePosition: 2
				},
				{
					roomId: ROOM_ID,
					participantIdentity: TICKET.participantIdentity,
					status: 'waiting',
					queuePosition: 1
				}
			]);
			expect(service.queuePosition()).toBe(1);
			expect(service.meetingActive()).toBeTrue();
		});

		it('keeps the room fields it shows when the server could not read the room', () => {
			send({ status: MeetLobbyStatus.WAITING, queuePosition: 1, meetingActive: false, message: 'At 10:00' });
			send({ status: MeetLobbyStatus.WAITING, queuePosition: 1 });

			expect(service.meetingActive()).toBeFalse();
			expect(service.message()).toBe('At 10:00');
		});

		it('ends on a final state for good, ignoring a stale state after it', () => {
			send({ status: MeetLobbyStatus.REJECTED });
			send({ status: MeetLobbyStatus.WAITING, queuePosition: 1 });

			expect(service.outcome()).toBe('rejected');
			expect(service.isWaiting()).toBeFalse();
			expect(webSocket.disconnect).toHaveBeenCalled();
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.REJECTED]);
		});

		it('says the place was lost when a newer request replaced the wait, reporting what the server said', () => {
			send({ status: MeetLobbyStatus.LEFT });

			expect(service.outcome()).toBe('expired');
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.LEFT]);
		});

		it('shows the closed room screen when the room closed', () => {
			send({ status: MeetLobbyStatus.ROOM_CLOSED });

			expect(redirectToErrorPage).toHaveBeenCalledOnceWith(NavigationErrorReason.CLOSED_ROOM, true);
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.ROOM_CLOSED]);
		});

		it('says the place was lost when the connection gives up after hearing from the wait', () => {
			send({ status: MeetLobbyStatus.WAITING, queuePosition: 1 });

			webSocket.stopReason.set('gave_up');
			TestBed.tick();

			expect(service.outcome()).toBe('expired');
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.WAITING, MeetLobbyStatus.EXPIRED]);
		});
	});

	describe('a connection that never heard from the wait', () => {
		it('shows the connection error naming the WebSocket address, with no lobby event', async () => {
			const consoleError = spyOn(console, 'error');
			const joining = service.join(ANA);
			await flush();

			webSocket.stopReason.set('gave_up');
			TestBed.tick();

			await expectAsync(joining).toBeRejectedWithError(MeetingConnectionError);
			expect(consoleError).toHaveBeenCalledWith(jasmine.stringContaining(webSocket.endpoint()));
			expect(service.outcome()).toBeUndefined();
			expect(lobbyEvents()).toEqual([]);
		});
	});

	describe('being let in', () => {
		it('asks for the token with the ticket and connects with it', async () => {
			const answer = new Deferred<JoinAnswer>();
			const { joined } = await admitWith(answer);

			answer.resolve(tokenAnswer('admitted-token'));
			await flush();

			expect(joinToken.requestWithTicket).toHaveBeenCalledOnceWith(ANA, TICKET.lobbyTicket);
			expect(joined).toHaveBeenCalledOnceWith('admitted-token');
			expect(webSocket.disconnect).toHaveBeenCalled();
			expect(phase.phase()).toBe('connecting');
			expect(setIsActiveMeeting).toHaveBeenCalledOnceWith(true);
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.ADMITTED]);
		});

		it('sends one token request however often the admission is repeated meanwhile', async () => {
			await admitWith(new Deferred<JoinAnswer>());

			send({ status: MeetLobbyStatus.ADMITTED });
			send({ status: MeetLobbyStatus.WAITING, queuePosition: 3 });
			await flush();

			expect(joinToken.requestWithTicket).toHaveBeenCalledTimes(1);
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.ADMITTED]);
		});

		it('lets a token answer win over a final state that arrived meanwhile', async () => {
			const answer = new Deferred<JoinAnswer>();
			const { joined } = await admitWith(answer);

			send({ status: MeetLobbyStatus.EXPIRED });
			answer.resolve(tokenAnswer());
			await flush();

			expect(joined).toHaveBeenCalledOnceWith('join-token');
			expect(service.outcome()).toBeUndefined();
		});

		it('applies a final state kept during the request once the answer is to keep waiting', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);

			send({ status: MeetLobbyStatus.MEETING_ENDED });
			answer.resolve(WAITING);
			await flush();

			expect(service.outcome()).toBe('meeting_ended');
		});

		it('stays waiting when the answer is to keep waiting', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);

			answer.resolve(WAITING);
			await flush();

			expect(service.status()).toBe(MeetLobbyStatus.WAITING);
			expect(webSocket.disconnect).not.toHaveBeenCalled();
		});

		it('ignores every later state once it holds the token', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);
			answer.resolve(tokenAnswer());
			await flush();

			send({ status: MeetLobbyStatus.REJECTED });

			expect(service.outcome()).toBeUndefined();
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.ADMITTED]);
		});

		it('says the place was lost on a 409 that names the admission, telling the host it expired', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);

			answer.reject(refusal(409, { message: 'The wait has ended', status: MeetLobbyStatus.ADMITTED }));
			await flush();

			expect(service.outcome()).toBe('expired');
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.ADMITTED, MeetLobbyStatus.EXPIRED]);
		});

		it('shows the screen of the status a 409 names', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);

			answer.reject(refusal(409, { message: 'The wait has ended', status: MeetLobbyStatus.REJECTED }));
			await flush();

			expect(service.outcome()).toBe('rejected');
		});

		it('shows the access error of a refused request, with no lobby event after it', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);
			const error = refusal(403, { message: 'Insufficient permissions' });

			answer.reject(error);
			await flush();

			expect(joinToken.showFailure).toHaveBeenCalledOnceWith(error);
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.ADMITTED]);
		});

		it('shows the error screen of a full meeting or a closed room, with no lobby event after it', async () => {
			const answer = new Deferred<JoinAnswer>();
			await admitWith(answer);
			const error = refusal(409, { message: "Room 'room1' has reached its maximum number of participants" });

			answer.reject(error);
			await flush();

			expect(joinToken.showFailure).toHaveBeenCalledOnceWith(error);
			expect(service.outcome()).toBeUndefined();
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.ADMITTED]);
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
			send({ status: MeetLobbyStatus.ADMITTED });
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
			send({ status: MeetLobbyStatus.WAITING, queuePosition: 1 });
			send({ status: MeetLobbyStatus.ADMITTED });
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
			send({ status: MeetLobbyStatus.ADMITTED });
			await flush();

			for (let elapsed = 0; elapsed <= 30_000; elapsed += 3_000) {
				jasmine.clock().tick(3_000);
				await flush();
			}

			await expectAsync(joining).toBeRejectedWithError(MeetingConnectionError);
			expect(joinToken.requestWithTicket.calls.count()).toBeGreaterThan(5);
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.ADMITTED]);
		});
	});

	describe('leaving the waiting room', () => {
		it('tells the server with a keepalive request carrying only the ticket, and disconnects', async () => {
			void service.join(ANA);
			await flush();

			service.leave();

			expect(fetchSpy).toHaveBeenCalledOnceWith(
				`/meet/internal-api/v1/meetings/${ROOM_ID}/lobby/leave?lobbyTicket=ticket%2F1`,
				{ method: 'POST', keepalive: true }
			);
			expect(webSocket.disconnect).toHaveBeenCalled();
			expect(service.outcome()).toBe('left');
			expect(lobbyStatuses()).toEqual([MeetLobbyStatus.LEFT]);
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

		it('only disconnects when the page goes away', async () => {
			void service.join(ANA);
			await flush();

			service.dispose();

			expect(fetchSpy).not.toHaveBeenCalled();
			expect(webSocket.disconnect).toHaveBeenCalled();
			expect(lobbyEvents()).toEqual([]);
		});
	});

	describe('asking again', () => {
		it('asks like the first time, without the ticket', async () => {
			void service.join(ANA);
			await flush();
			send({ status: MeetLobbyStatus.REJECTED });

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
