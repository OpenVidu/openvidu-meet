import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	EmbeddedEventName,
	MeetWaitingParticipantErrorCode,
	MeetWaitingParticipantList,
	MeetEventOrigin,
	MeetWaitingParticipant,
	MeetWaitingParticipantStatus,
	MeetParticipantType,
	MeetRoomMemberRole,
	MeetRoomMemberPermissions,
	MeetSignalType
} from '@openvidu-meet/typings';
import { Subject } from 'rxjs';
import { HttpService } from '../../../shared/services/http.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { NotificationService } from '../../../shared/services/notification.service';
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
import { WaitingParticipantsAdminService, WaitingParticipantView } from './waiting-participants-admin.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const ROOM_ID = 'room-1';
const WAITING_PATH = `${HttpService.API_PATH_PREFIX}/meetings/${ROOM_ID}/waiting-participants`;

const waiter = (identity: string, knockDate = 1000): MeetWaitingParticipant => ({
	participantIdentity: identity,
	participantName: identity.toUpperCase(),
	type: MeetParticipantType.ANONYMOUS,
	role: MeetRoomMemberRole.SPEAKER,
	knockDate
});

const list = (participants: MeetWaitingParticipant[]): MeetWaitingParticipantList => ({ participants });

async function flush(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('WaitingParticipantsAdminService', () => {
	let service: WaitingParticipantsAdminService;
	let http: jasmine.SpyObj<HttpService>;
	let listed: MeetWaitingParticipantList;
	let waitingParticipantAdmin: ReturnType<typeof signal<boolean>>;
	let lockedEnabled: ReturnType<typeof signal<boolean>>;
	let maxParticipants: ReturnType<typeof signal<number | null>>;
	let sessionActive: ReturnType<typeof signal<boolean>>;
	let connected: ReturnType<typeof signal<boolean>>;
	let participantsInMeeting: ReturnType<typeof signal<number>>;
	let signals: Subject<MeetSignal>;
	let eventBus: EmbeddedEventBusService;
	let arrivals: WaitingParticipantView[][];
	let showNotification: jasmine.Spy;
	let decryptOrMask: jasmine.Spy;

	beforeEach(() => {
		jasmine.clock().install();
		listed = list([]);
		http = jasmine.createSpyObj<HttpService>('HttpService', ['getRequest', 'postRequest', 'deleteRequest']);
		http.getRequest.and.callFake(async () => structuredClone(listed) as never);
		http.postRequest.and.resolveTo({ message: 'ok' } as never);
		http.deleteRequest.and.resolveTo({ message: 'ok' } as never);
		waitingParticipantAdmin = signal(true);
		lockedEnabled = signal(true);
		maxParticipants = signal<number | null>(null);
		sessionActive = signal(false);
		connected = signal(false);
		participantsInMeeting = signal(1);
		signals = new Subject<MeetSignal>();
		showNotification = jasmine.createSpy('showNotification');
		decryptOrMask = jasmine.createSpy('decryptOrMask').and.callFake(async (text: string) => text);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: HttpService, useValue: http },
				{
					provide: MeetingContextService,
					useValue: {
						roomId: () => ROOM_ID,
						roomLock: () => ({ enabled: lockedEnabled() }),
						maxParticipants
					}
				},
				{
					provide: RoomMemberContextService,
					useValue: {
						hasPermission: (permission: keyof MeetRoomMemberPermissions) =>
							permission === 'waitingParticipantAdmin' && waitingParticipantAdmin(),
						serverTimeSkewMs: () => 0
					}
				},
				{
					provide: MeetingLiveKitService,
					useValue: { isSessionActive: sessionActive, isConnected: connected }
				},
				{ provide: ParticipantService, useValue: { totalParticipantsSignal: participantsInMeeting } },
				{ provide: E2eeService, useValue: { decryptOrMask } },
				{ provide: MeetingEventsService, useValue: { meetSignals$: signals.asObservable() } },
				{ provide: RuntimeConfigService, useValue: { isEmbeddedMode: () => true } },
				{ provide: NotificationService, useValue: { showNotification } }
			]
		});

		service = TestBed.inject(WaitingParticipantsAdminService);
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

	const signalListUpdated = () =>
		signals.next({
			topic: MeetSignalType.MEET_WAITING_PARTICIPANT_LIST_UPDATED,
			payload: { roomId: ROOM_ID, timestamp: 1 }
		});

	const hostEvents = (name: EmbeddedEventName) =>
		eventBus
			.events()
			.filter(({ event }) => event === name)
			.map((event) => (event as { payload: unknown }).payload);

	const identities = () => service.waiting().map(({ participant }) => participant.participantIdentity);

	describe('reading the list', () => {
		it('reads the list on joining, and shows it by the time each one asked', async () => {
			listed = list([waiter('ben', 2000), waiter('ana')]);

			await join();

			expect(http.getRequest).toHaveBeenCalledOnceWith(WAITING_PATH);
			expect(identities()).toEqual(['ana', 'ben']);
		});

		it('shows the names decrypted with the viewer key or masked, and tells the host the names as sent', async () => {
			decryptOrMask.and.callFake(async (_text: string, identity: string) =>
				identity === 'ana' ? 'Ana' : '******'
			);
			listed = list([waiter('ana'), waiter('ben', 2000)]);

			await join();

			expect(decryptOrMask).toHaveBeenCalledWith('ANA', 'ana');
			expect(service.waiting().map(({ name }) => name)).toEqual(['Ana', '******']);
			expect(hostEvents(EmbeddedEventName.WAITING_PARTICIPANT_LIST_UPDATED)).toEqual([
				{ roomId: ROOM_ID, participants: [waiter('ana'), waiter('ben', 2000)] }
			]);
		});

		it('groups the signals of 300 ms into one request', async () => {
			await join();
			http.getRequest.calls.reset();

			signalListUpdated();
			signalListUpdated();
			jasmine.clock().tick(299);
			signalListUpdated();

			expect(http.getRequest).not.toHaveBeenCalled();

			jasmine.clock().tick(1);
			await flush();

			expect(http.getRequest).toHaveBeenCalledTimes(1);
		});

		it('reads it every 30 seconds, so a lost signal shows', async () => {
			await join();
			http.getRequest.calls.reset();
			listed = list([waiter('zoe')]);

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

		it('works out the free places from the participant limit and the participants in the meeting', async () => {
			maxParticipants.set(3);
			participantsInMeeting.set(3);
			listed = list([waiter('zoe')]);
			await join();
			http.getRequest.calls.reset();

			expect(service.freePlaces()).toBe(0);
			expect(service.canAdmitAll()).toBeFalse();

			participantsInMeeting.set(2);

			expect(service.freePlaces()).toBe(1);
			expect(service.canAdmitAll()).toBeTrue();
			expect(http.getRequest).not.toHaveBeenCalled();
		});

		it('has no free places to count without a participant limit, and lets everyone in', async () => {
			participantsInMeeting.set(40);
			listed = list([waiter('ana'), waiter('ben')]);
			await join();

			expect(service.freePlaces()).toBeNull();
			expect(service.canAdmitAll()).toBeTrue();
		});

		it('never reads it without waitingParticipantAdmin, and ignores the signal', async () => {
			waitingParticipantAdmin.set(false);
			await join();

			signalListUpdated();
			jasmine.clock().tick(30_000);

			expect(http.getRequest).not.toHaveBeenCalled();
		});

		it('reads nothing in an unlocked room until a signal says its list changed', async () => {
			lockedEnabled.set(false);
			await join();
			jasmine.clock().tick(30_000);
			await flush();

			expect(http.getRequest).not.toHaveBeenCalled();
			expect(hostEvents(EmbeddedEventName.WAITING_PARTICIPANT_LIST_UPDATED)).toEqual([]);

			listed = list([waiter('zoe')]);
			signalListUpdated();
			jasmine.clock().tick(300);
			await flush();

			expect(identities()).toEqual(['zoe']);
		});

		it('reads it at once when the local participant gains waitingParticipantAdmin', async () => {
			waitingParticipantAdmin.set(false);
			listed = list([waiter('ana')]);
			await join();

			waitingParticipantAdmin.set(true);
			TestBed.tick();
			await flush();

			expect(identities()).toEqual(['ana']);
		});
	});

	describe('losing waitingParticipantAdmin', () => {
		beforeEach(async () => {
			listed = list([waiter('ana')]);
			await join();
		});

		it('drops the list at once and stops reading it', async () => {
			http.getRequest.calls.reset();

			waitingParticipantAdmin.set(false);
			TestBed.tick();
			signalListUpdated();
			jasmine.clock().tick(60_000);
			await flush();

			expect(service.waiting()).toEqual([]);
			expect(http.getRequest).not.toHaveBeenCalled();
		});

		it('drops an answer that was still on its way, telling the host nothing more', async () => {
			let answer!: (list: MeetWaitingParticipantList) => void;
			http.getRequest.and.returnValue(new Promise((resolve) => (answer = resolve as never)));
			signalListUpdated();
			jasmine.clock().tick(300);
			const eventsBefore = eventBus.events().length;

			waitingParticipantAdmin.set(false);
			TestBed.tick();
			answer(list([waiter('ana'), waiter('zoe')]));
			await flush();

			expect(service.waiting()).toEqual([]);
			expect(eventBus.events().length).toBe(eventsBefore);
		});
	});

	describe('telling the host and the meeting', () => {
		it('reports the first list as it is, with no knock, and announces everyone in it once', async () => {
			listed = list([waiter('ana'), waiter('ben')]);

			await join();

			expect(hostEvents(EmbeddedEventName.WAITING_PARTICIPANT_LIST_UPDATED)).toEqual([
				{ roomId: ROOM_ID, ...listed }
			]);
			expect(hostEvents(EmbeddedEventName.WAITING_PARTICIPANT_KNOCKED)).toEqual([]);
			expect(
				arrivals.map((arrived) => arrived.map(({ participant }) => participant.participantIdentity))
			).toEqual([['ana', 'ben']]);
		});

		it('reports a knock for a new request only, and a list only when it changed', async () => {
			listed = list([waiter('ana')]);
			await join();

			signalListUpdated();
			jasmine.clock().tick(300);
			await flush();

			listed = list([waiter('ana'), waiter('zoe', 5000)]);
			signalListUpdated();
			jasmine.clock().tick(300);
			await flush();

			expect(hostEvents(EmbeddedEventName.WAITING_PARTICIPANT_LIST_UPDATED).length).toBe(2);
			expect(hostEvents(EmbeddedEventName.WAITING_PARTICIPANT_KNOCKED)).toEqual([
				{ roomId: ROOM_ID, participant: waiter('zoe', 5000) }
			]);
		});

		it('does not report a return to waiting as a knock', async () => {
			listed = list([waiter('zoe')]);
			await join();

			listed = list([]);
			signalListUpdated();
			jasmine.clock().tick(300);
			await flush();

			listed = list([waiter('zoe')]);
			signalListUpdated();
			jasmine.clock().tick(300);
			await flush();

			expect(hostEvents(EmbeddedEventName.WAITING_PARTICIPANT_LIST_UPDATED).length).toBe(3);
			expect(hostEvents(EmbeddedEventName.WAITING_PARTICIPANT_KNOCKED)).toEqual([]);
		});

		it('reports a new request of the same participant as a knock', async () => {
			listed = list([waiter('zoe', 1000)]);
			await join();

			listed = list([waiter('zoe', 9000)]);
			signalListUpdated();
			jasmine.clock().tick(300);
			await flush();

			expect(hostEvents(EmbeddedEventName.WAITING_PARTICIPANT_KNOCKED).length).toBe(1);
		});

		it('reports how each wait changed, whoever changed it, while the local participant may admit', async () => {
			const signalStatusChanged = (identity: string) =>
				signals.next({
					topic: MeetSignalType.MEET_WAITING_PARTICIPANT_STATUS_CHANGED,
					payload: {
						roomId: ROOM_ID,
						participant: waiter(identity),
						status: MeetWaitingParticipantStatus.ADMITTED,
						origin: MeetEventOrigin.MODERATOR,
						timestamp: 1
					}
				});
			await join();

			signalStatusChanged('zoe');
			waitingParticipantAdmin.set(false);
			signalStatusChanged('ana');

			expect(hostEvents(EmbeddedEventName.WAITING_PARTICIPANT_STATUS_CHANGED)).toEqual([
				{
					roomId: ROOM_ID,
					participant: waiter('zoe'),
					status: MeetWaitingParticipantStatus.ADMITTED,
					origin: MeetEventOrigin.MODERATOR
				}
			]);
		});
	});

	describe('deciding', () => {
		beforeEach(async () => {
			listed = list([waiter('ana'), waiter('ben'), waiter('zoe')]);
			await join();
			http.getRequest.calls.reset();
		});

		it('names one participant in the path, and decides on everyone waiting on the collection, naming them to reject them', async () => {
			await service.admit('ben');
			await service.admitAll();
			await service.reject('ana');
			await service.rejectAll();

			expect(http.postRequest.calls.allArgs()).toEqual([
				[`${WAITING_PATH}/ben/admit`],
				[`${WAITING_PATH}/admit`]
			]);
			expect(http.deleteRequest.calls.allArgs()).toEqual([
				[`${WAITING_PATH}/ana`],
				[`${WAITING_PATH}?participantIdentities=ana,ben,zoe`]
			]);
		});

		it('rejects nobody, sending no request, when nobody waits', async () => {
			listed = list([]);
			await service.refresh();

			await service.rejectAll();

			expect(http.deleteRequest).not.toHaveBeenCalled();
		});

		it('takes a rejection of everyone that found some no longer waiting as done, reading the list again', async () => {
			http.deleteRequest.and.rejectWith(
				new HttpErrorResponse({
					status: 400,
					error: { deleted: ['ana'], failed: [{ participantIdentity: 'ben', error: 'not waiting' }] }
				})
			);

			await expectAsync(service.rejectAll()).toBeResolved();
			await flush();

			expect(http.getRequest).toHaveBeenCalledOnceWith(WAITING_PATH);
			expect(showNotification).not.toHaveBeenCalled();
		});

		it('fails a rejection of everyone refused for another reason', async () => {
			http.deleteRequest.and.rejectWith(new HttpErrorResponse({ status: 403 }));

			await expectAsync(service.rejectAll()).toBeRejected();
		});

		it('shows the list as the decision left it before answering', async () => {
			listed = list([waiter('ana'), waiter('zoe')]);

			await service.admit('ben');

			expect(identities()).toEqual(['ana', 'zoe']);
		});

		it('says which participant is no longer waiting, by name, when a decision names one who left', async () => {
			http.postRequest.and.rejectWith(
				new HttpErrorResponse({
					status: 404,
					error: { error: MeetWaitingParticipantErrorCode.PARTICIPANT_NOT_WAITING }
				})
			);

			await expectAsync(service.admit('ben')).toBeRejected();

			expect(showNotification).toHaveBeenCalledOnceWith(
				jasmine.objectContaining({
					kind: 'waiting-participant-not-waiting',
					title: { key: 'WAITING_PARTICIPANTS.ADMIN.GONE_TITLE', params: { name: 'BEN' } },
					message: { key: 'WAITING_PARTICIPANTS.ADMIN.GONE_MESSAGE' }
				})
			);
		});

		it('says not everyone fits when admitting everyone is refused for lack of places', async () => {
			http.postRequest.and.rejectWith(
				new HttpErrorResponse({
					status: 409,
					error: { error: MeetWaitingParticipantErrorCode.NOT_ENOUGH_PLACES }
				})
			);

			await expectAsync(service.admitAll()).toBeRejected();

			expect(showNotification).toHaveBeenCalledOnceWith(
				jasmine.objectContaining({
					kind: 'waiting-participants-not-enough-places',
					title: { key: 'WAITING_PARTICIPANTS.ADMIN.NOT_ENOUGH_PLACES_TITLE' },
					message: { key: 'WAITING_PARTICIPANTS.ADMIN.NOT_ENOUGH_PLACES_MESSAGE' }
				})
			);
		});

		it('says nothing about a refusal without its code, nor about one participant who does not fit', async () => {
			http.postRequest.and.rejectWith(new HttpErrorResponse({ status: 404 }));
			await expectAsync(service.admit('ana')).toBeRejected();
			http.postRequest.and.rejectWith(new HttpErrorResponse({ status: 409 }));
			await expectAsync(service.admitAll()).toBeRejected();
			http.postRequest.and.rejectWith(
				new HttpErrorResponse({
					status: 409,
					error: { error: MeetWaitingParticipantErrorCode.NOT_ENOUGH_PLACES }
				})
			);
			await expectAsync(service.admit('ana')).toBeRejected();

			expect(showNotification).not.toHaveBeenCalled();
		});

		for (const status of [404, 409]) {
			it(`reads the list again on a ${status}, resending nothing`, async () => {
				http.postRequest.and.rejectWith(new HttpErrorResponse({ status }));

				await expectAsync(service.admitAll()).toBeRejected();
				await flush();

				expect(http.postRequest).toHaveBeenCalledTimes(1);
				expect(http.getRequest).toHaveBeenCalledOnceWith(WAITING_PATH);
			});
		}
	});
});
