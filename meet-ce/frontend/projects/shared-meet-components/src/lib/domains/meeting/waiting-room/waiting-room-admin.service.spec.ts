import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	EmbeddedEventName,
	MeetWaitingRoomList,
	MeetWaitingRoomParticipant,
	MeetWaitingRoomParticipantType,
	MeetRoomMemberPermissions,
	MeetSignalType
} from '@openvidu-meet/typings';
import { Subject } from 'rxjs';
import { HttpService } from '../../../shared/services/http.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { EmbeddedEventBusService } from '../../embedded/services/embedded-event-bus.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { E2eeService } from '../openvidu-components/services/e2ee/e2ee.service';
import {
	MeetingEventsService,
	MeetSignal
} from '../openvidu-components/services/meeting-events/meeting-events.service';
import { MeetingLiveKitService } from '../openvidu-components/services/meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../openvidu-components/services/participant/participant.service';
import { MeetingContextService } from '../services/meeting-context.service';
import { WaitingRoomAdminService, WaitingRoomWaiter } from './waiting-room-admin.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const ROOM_ID = 'room-1';
const WAITING_ROOM_PATH = `${HttpService.API_PATH_PREFIX}/meetings/${ROOM_ID}/waiting-room`;

const waiter = (identity: string, knockDate = 1000): MeetWaitingRoomParticipant => ({
	participantIdentity: identity,
	participantName: identity.toUpperCase(),
	type: MeetWaitingRoomParticipantType.ANONYMOUS,
	knockDate
});

const list = (
	participants: MeetWaitingRoomParticipant[],
	availablePlaces: number | null = null
): MeetWaitingRoomList => ({
	participants,
	availablePlaces
});

async function flush(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('WaitingRoomAdminService', () => {
	let service: WaitingRoomAdminService;
	let http: jasmine.SpyObj<HttpService>;
	let waitingRoom: MeetWaitingRoomList;
	let waitingRoomAdmin: ReturnType<typeof signal<boolean>>;
	let sessionActive: ReturnType<typeof signal<boolean>>;
	let connected: ReturnType<typeof signal<boolean>>;
	let remoteParticipants: ReturnType<typeof signal<unknown[]>>;
	let signals: Subject<MeetSignal>;
	let eventBus: EmbeddedEventBusService;
	let arrivals: WaitingRoomWaiter[][];

	beforeEach(() => {
		jasmine.clock().install();
		waitingRoom = list([]);
		http = jasmine.createSpyObj<HttpService>('HttpService', ['getRequest', 'postRequest']);
		http.getRequest.and.callFake(async () => structuredClone(waitingRoom) as never);
		http.postRequest.and.resolveTo({ participants: [] } as never);
		waitingRoomAdmin = signal(true);
		sessionActive = signal(false);
		connected = signal(false);
		remoteParticipants = signal<unknown[]>([]);
		signals = new Subject<MeetSignal>();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: HttpService, useValue: http },
				{ provide: MeetingContextService, useValue: { roomId: () => ROOM_ID } },
				{
					provide: RoomMemberContextService,
					useValue: {
						hasPermission: (permission: keyof MeetRoomMemberPermissions) =>
							permission === 'waitingRoomAdmin' && waitingRoomAdmin(),
						serverTimeSkewMs: () => 0
					}
				},
				{
					provide: MeetingLiveKitService,
					useValue: { isSessionActive: sessionActive, isConnected: connected }
				},
				{ provide: ParticipantService, useValue: { remoteParticipants } },
				{ provide: E2eeService, useValue: { decryptOrMask: async (text: string) => text } },
				{ provide: MeetingEventsService, useValue: { meetSignals$: signals.asObservable() } },
				{ provide: RuntimeConfigService, useValue: { isEmbeddedMode: () => true } }
			]
		});

		service = TestBed.inject(WaitingRoomAdminService);
		eventBus = TestBed.inject(EmbeddedEventBusService);
		arrivals = [];
		service.arrivals$.subscribe((arrived) => arrivals.push(arrived));
	});

	afterEach(() => jasmine.clock().uninstall());

	async function join(): Promise<void> {
		sessionActive.set(true);
		connected.set(true);
		TestBed.tick();
		await flush();
	}

	const signalWaitingRoomUpdated = () =>
		signals.next({ topic: MeetSignalType.MEET_WAITING_ROOM_UPDATED, payload: { roomId: ROOM_ID, timestamp: 1 } });

	const hostEvents = (name: EmbeddedEventName) =>
		eventBus
			.events()
			.filter(({ event }) => event === name)
			.map((event) => (event as { payload: unknown }).payload);

	const identities = () => service.waiting().map(({ participant }) => participant.participantIdentity);

	describe('reading the list', () => {
		it('reads the list on joining, and shows the free places', async () => {
			waitingRoom = list([waiter('ana'), waiter('ben', 2000)], 2);

			await join();

			expect(http.getRequest).toHaveBeenCalledOnceWith(WAITING_ROOM_PATH);
			expect(identities()).toEqual(['ana', 'ben']);
			expect(service.availablePlaces()).toBe(2);
		});

		it('groups the signals of 300 ms into one request', async () => {
			await join();
			http.getRequest.calls.reset();

			signalWaitingRoomUpdated();
			signalWaitingRoomUpdated();
			jasmine.clock().tick(299);
			signalWaitingRoomUpdated();

			expect(http.getRequest).not.toHaveBeenCalled();

			jasmine.clock().tick(1);
			await flush();

			expect(http.getRequest).toHaveBeenCalledTimes(1);
		});

		it('reads it every 30 seconds, so a lost signal shows', async () => {
			await join();
			http.getRequest.calls.reset();
			waitingRoom = list([waiter('zoe')]);

			jasmine.clock().tick(30_000);
			await flush();

			expect(identities()).toEqual(['zoe']);
		});

		it('reads it again after a reconnection', async () => {
			await join();
			http.getRequest.calls.reset();

			connected.set(false);
			TestBed.tick();
			jasmine.clock().tick(30_000);
			expect(http.getRequest).not.toHaveBeenCalled();

			connected.set(true);
			TestBed.tick();
			await flush();

			expect(http.getRequest).toHaveBeenCalledTimes(1);
		});

		it('refreshes the free places when a participant leaves the meeting while someone waits', async () => {
			remoteParticipants.set([{}, {}]);
			waitingRoom = list([waiter('zoe')], 0);
			await join();

			waitingRoom = list([waiter('zoe')], 1);
			remoteParticipants.set([{}]);
			TestBed.tick();
			jasmine.clock().tick(300);
			await flush();

			expect(service.availablePlaces()).toBe(1);
		});

		it('leaves the participants in the meeting alone while nobody waits', async () => {
			await join();
			http.getRequest.calls.reset();

			remoteParticipants.set([{}]);
			TestBed.tick();
			jasmine.clock().tick(300);

			expect(http.getRequest).not.toHaveBeenCalled();
		});

		it('never reads it without waitingRoomAdmin, and ignores the signal', async () => {
			waitingRoomAdmin.set(false);
			await join();

			signalWaitingRoomUpdated();
			jasmine.clock().tick(30_000);

			expect(http.getRequest).not.toHaveBeenCalled();
		});

		it('reads it at once when the local participant gains waitingRoomAdmin', async () => {
			waitingRoomAdmin.set(false);
			waitingRoom = list([waiter('ana')]);
			await join();

			waitingRoomAdmin.set(true);
			TestBed.tick();
			await flush();

			expect(identities()).toEqual(['ana']);
		});
	});

	describe('losing waitingRoomAdmin', () => {
		beforeEach(async () => {
			waitingRoom = list([waiter('ana')]);
			await join();
		});

		it('drops the list at once and stops reading it', async () => {
			http.getRequest.calls.reset();

			waitingRoomAdmin.set(false);
			TestBed.tick();
			signalWaitingRoomUpdated();
			jasmine.clock().tick(60_000);
			await flush();

			expect(service.waiting()).toEqual([]);
			expect(http.getRequest).not.toHaveBeenCalled();
		});

		it('drops an answer that was still on its way, telling the host nothing more', async () => {
			let answer!: (list: MeetWaitingRoomList) => void;
			http.getRequest.and.returnValue(new Promise((resolve) => (answer = resolve as never)));
			signalWaitingRoomUpdated();
			jasmine.clock().tick(300);
			const eventsBefore = eventBus.events().length;

			waitingRoomAdmin.set(false);
			TestBed.tick();
			answer(list([waiter('ana'), waiter('zoe')]));
			await flush();

			expect(service.waiting()).toEqual([]);
			expect(eventBus.events().length).toBe(eventsBefore);
		});
	});

	describe('telling the host and the meeting', () => {
		it('reports the first list as it is, with no knock, and announces everyone in it once', async () => {
			waitingRoom = list([waiter('ana'), waiter('ben')], 3);

			await join();

			expect(hostEvents(EmbeddedEventName.WAITING_ROOM_UPDATED)).toEqual([{ roomId: ROOM_ID, ...waitingRoom }]);
			expect(hostEvents(EmbeddedEventName.PARTICIPANT_KNOCKED)).toEqual([]);
			expect(
				arrivals.map((arrived) => arrived.map(({ participant }) => participant.participantIdentity))
			).toEqual([['ana', 'ben']]);
		});

		it('reports a knock for a new request only, and a list only when it changed', async () => {
			waitingRoom = list([waiter('ana')]);
			await join();

			signalWaitingRoomUpdated();
			jasmine.clock().tick(300);
			await flush();

			waitingRoom = list([waiter('ana'), waiter('zoe', 5000)]);
			signalWaitingRoomUpdated();
			jasmine.clock().tick(300);
			await flush();

			expect(hostEvents(EmbeddedEventName.WAITING_ROOM_UPDATED).length).toBe(2);
			expect(hostEvents(EmbeddedEventName.PARTICIPANT_KNOCKED)).toEqual([
				{ roomId: ROOM_ID, participant: waiter('zoe', 5000) }
			]);
		});

		it('does not report a return to the line as a knock', async () => {
			waitingRoom = list([waiter('zoe')]);
			await join();

			waitingRoom = list([]);
			signalWaitingRoomUpdated();
			jasmine.clock().tick(300);
			await flush();

			waitingRoom = list([waiter('zoe')]);
			signalWaitingRoomUpdated();
			jasmine.clock().tick(300);
			await flush();

			expect(hostEvents(EmbeddedEventName.WAITING_ROOM_UPDATED).length).toBe(3);
			expect(hostEvents(EmbeddedEventName.PARTICIPANT_KNOCKED)).toEqual([]);
		});

		it('reports a new request of the same participant as a knock', async () => {
			waitingRoom = list([waiter('zoe', 1000)]);
			await join();

			waitingRoom = list([waiter('zoe', 9000)]);
			signalWaitingRoomUpdated();
			jasmine.clock().tick(300);
			await flush();

			expect(hostEvents(EmbeddedEventName.PARTICIPANT_KNOCKED).length).toBe(1);
		});
	});

	describe('deciding', () => {
		beforeEach(async () => {
			waitingRoom = list([waiter('ana'), waiter('ben'), waiter('zoe')], 2);
			await join();
			http.getRequest.calls.reset();
		});

		it('sends the identities given, or none for everyone waiting', async () => {
			await service.admit(['ben']);
			await service.reject();

			expect(http.postRequest.calls.allArgs()).toEqual([
				[`${WAITING_ROOM_PATH}/admit`, { participantIdentities: ['ben'] }],
				[`${WAITING_ROOM_PATH}/reject`, {}]
			]);
		});

		it('admits the first in line that fit in the free places', async () => {
			expect(service.admittable()).toBe(2);

			await service.admitShown();

			expect(http.postRequest).toHaveBeenCalledOnceWith(`${WAITING_ROOM_PATH}/admit`, {
				participantIdentities: ['ana', 'ben']
			});
		});

		it('admits nobody while no place is free', async () => {
			waitingRoom = list([waiter('ana')], 0);
			signalWaitingRoomUpdated();
			jasmine.clock().tick(300);
			await flush();

			await service.admitShown();

			expect(http.postRequest).not.toHaveBeenCalled();
		});

		for (const status of [404, 409]) {
			it(`reads the list again on a ${status}, resending nothing`, async () => {
				http.postRequest.and.rejectWith(new HttpErrorResponse({ status }));

				await expectAsync(service.admitShown()).toBeRejected();
				await flush();

				expect(http.postRequest).toHaveBeenCalledTimes(1);
				expect(http.getRequest).toHaveBeenCalledOnceWith(WAITING_ROOM_PATH);
			});
		}
	});
});
