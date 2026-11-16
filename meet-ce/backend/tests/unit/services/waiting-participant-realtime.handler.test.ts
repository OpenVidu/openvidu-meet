import { describe, expect, it, jest } from '@jest/globals';
import {
	MEET_WAITING_PARTICIPANT_STATE_MESSAGE,
	MeetEventOrigin,
	MeetWaitingParticipantReason,
	MeetWaitingParticipantStatus,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import type { WaitingPresence, ParticipantWait } from '../../../src/models/waiting-participant.model.js';
import type { WebSocketConnection, WebSocketFeature } from '../../../src/models/websocket.model.js';
import { WaitingParticipantRealtimeHandler } from '../../../src/services/waiting-participants/waiting-participant-realtime.handler.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

const openRoom = (overrides: { status?: MeetRoomStatus; enabled?: boolean; message?: string } = {}) => ({
	status: overrides.status ?? MeetRoomStatus.OPEN,
	access: { lock: { enabled: overrides.enabled ?? true, message: overrides.message } }
});

const build = () => {
	const registered: WebSocketFeature[] = [];
	let presence: WaitingPresence | null = {
		roomId: 'room-1',
		status: MeetWaitingParticipantStatus.WAITING,
		waitedSeconds: 30
	};
	let room: unknown = openRoom({ message: 'Hold on' });
	const ends: unknown[][] = [];
	const waitingParticipantService = {
		findWait: async (ticket: string) =>
			ticket === 'known' ? ({ waitId: 'wait-ana', roomId: 'room-1' } as ParticipantWait) : null,
		endWaits: jest.fn(async (...args: unknown[]) => {
			ends.push(args);
			return [{ participantIdentity: 'ana' }];
		})
	};
	const handler = new WaitingParticipantRealtimeHandler(
		...([
			{ register: (feature: WebSocketFeature) => registered.push(feature) },
			waitingParticipantService,
			{ presence: async () => presence },
			{
				findByRoomId: async () => {
					if (room instanceof Error) throw room;

					return room;
				}
			},
			noopLogger
		] as unknown as ConstructorParameters<typeof WaitingParticipantRealtimeHandler>)
	);
	const sent: unknown[] = [];
	const connection: WebSocketConnection = {
		roomId: 'room-1',
		address: 'wait-ana',
		lastSeenAt: 0,
		send: (type: string, data?: unknown) => sent.push({ type, data })
	};
	return {
		handler,
		registered,
		connection,
		sent,
		ends,
		waitingParticipantService,
		setPresence: (value: WaitingPresence | null) => (presence = value),
		setRoom: (value: unknown) => (room = value)
	};
};

describe('WaitingParticipantRealtimeHandler', () => {
	it('registers the ticket as the credential of its connections', () => {
		const { handler, registered } = build();

		expect(registered).toEqual([handler]);
		expect(handler.credential).toBe('waitingTicket');
	});

	it('addresses a connection by its wait, and refuses an unknown ticket', async () => {
		const { handler } = build();

		expect(await handler.resolve('known')).toEqual({ roomId: 'room-1', address: 'wait-ana' });
		expect(await handler.resolve('unknown')).toBeNull();
	});

	it('sends the state of the wait straight to the connection on open and on every answered ping', async () => {
		const { handler, connection, sent } = build();

		await handler.onOpen(connection);
		await handler.onPong(connection);

		const state = {
			type: MEET_WAITING_PARTICIPANT_STATE_MESSAGE,
			data: {
				status: MeetWaitingParticipantStatus.WAITING,
				waitedSeconds: 30,
				meetingActive: false,
				message: 'Hold on'
			}
		};
		expect(sent).toEqual([state, state]);
	});

	it('says when the meeting runs, and holds nothing about the room besides', async () => {
		const { handler, connection, sent, setRoom } = build();
		setRoom(openRoom({ status: MeetRoomStatus.ACTIVE_MEETING }));

		await handler.onPong(connection);

		expect(sent).toEqual([
			{
				type: MEET_WAITING_PARTICIPANT_STATE_MESSAGE,
				data: {
					status: MeetWaitingParticipantStatus.WAITING,
					waitedSeconds: 30,
					meetingActive: true
				}
			}
		]);
	});

	it('sends the outcome of an ended wait again, every time', async () => {
		const { handler, connection, sent, setPresence, ends } = build();
		setPresence({ roomId: 'room-1', status: MeetWaitingParticipantStatus.REJECTED });

		await handler.onOpen(connection);
		await handler.onPong(connection);

		expect(sent).toEqual([
			expect.objectContaining({
				data: expect.objectContaining({ status: MeetWaitingParticipantStatus.REJECTED })
			}),
			expect.objectContaining({
				data: expect.objectContaining({ status: MeetWaitingParticipantStatus.REJECTED })
			})
		]);
		expect(ends).toEqual([]);
	});

	it('sends nothing for a wait no longer known', async () => {
		const { handler, connection, sent, setPresence } = build();
		setPresence(null);

		await handler.onPong(connection);

		expect(sent).toEqual([]);
	});

	it.each([
		['closed', openRoom({ status: MeetRoomStatus.CLOSED }), MeetWaitingParticipantStatus.ROOM_CLOSED, undefined],
		['deleted', null, MeetWaitingParticipantStatus.ROOM_CLOSED, undefined],
		[
			'unlocked',
			openRoom({ enabled: false }),
			MeetWaitingParticipantStatus.ADMITTED,
			MeetWaitingParticipantReason.ROOM_UNLOCKED
		]
	])('ends the wait of a room %s whose waits were not ended, as the system', async (_case, room, outcome, reason) => {
		const { handler, connection, sent, ends, setRoom } = build();
		setRoom(room);

		await handler.onPong(connection);

		expect(ends).toEqual([['room-1', outcome, MeetEventOrigin.SYSTEM, ['wait-ana'], reason]]);
		expect(sent).toEqual([
			{ type: MEET_WAITING_PARTICIPANT_STATE_MESSAGE, data: expect.objectContaining({ status: outcome }) }
		]);
	});

	it('keeps the state it read when the wait changed before it could be ended', async () => {
		const { handler, connection, sent, setRoom, waitingParticipantService } = build();
		setRoom(openRoom({ status: MeetRoomStatus.CLOSED }));
		waitingParticipantService.endWaits.mockResolvedValueOnce([]);

		await handler.onPong(connection);

		expect(sent).toEqual([
			{
				type: MEET_WAITING_PARTICIPANT_STATE_MESSAGE,
				data: expect.objectContaining({ status: MeetWaitingParticipantStatus.WAITING })
			}
		]);
	});

	it('reconciles nothing when the room cannot be read, sending the room fields it last sent', async () => {
		const { handler, connection, sent, ends, setRoom } = build();

		setRoom(new Error('MongoDB down'));
		await handler.onOpen(connection);
		setRoom(openRoom({ message: 'Hold on' }));
		await handler.onPong(connection);
		setRoom(new Error('MongoDB down'));
		await handler.onPong(connection);

		expect(ends).toEqual([]);
		expect(sent.map((message) => (message as { data: object }).data)).toEqual([
			{ status: MeetWaitingParticipantStatus.WAITING, waitedSeconds: 30 },
			{
				status: MeetWaitingParticipantStatus.WAITING,
				waitedSeconds: 30,
				meetingActive: false,
				message: 'Hold on'
			},
			{
				status: MeetWaitingParticipantStatus.WAITING,
				waitedSeconds: 30,
				meetingActive: false,
				message: 'Hold on'
			}
		]);
	});
});
