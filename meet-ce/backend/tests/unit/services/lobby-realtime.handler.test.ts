import { describe, expect, it, jest } from '@jest/globals';
import { MEET_LOBBY_STATE_MESSAGE, MeetEventOrigin, MeetLobbyStatus, MeetRoomStatus } from '@openvidu-meet/typings';
import type { LobbyPresence, LobbyWait } from '../../../src/models/lobby.model.js';
import type { WebSocketConnection, WebSocketFeature } from '../../../src/models/websocket.model.js';
import { LobbyRealtimeHandler } from '../../../src/services/lobby/lobby-realtime.handler.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

const openRoom = (overrides: { status?: MeetRoomStatus; enabled?: boolean; message?: string } = {}) => ({
	status: overrides.status ?? MeetRoomStatus.OPEN,
	config: { lobby: { enabled: overrides.enabled ?? true, message: overrides.message } }
});

const build = () => {
	const registered: WebSocketFeature[] = [];
	let presence: LobbyPresence | null = {
		roomId: 'room-1',
		status: MeetLobbyStatus.WAITING,
		queuePosition: 2,
		waitedSeconds: 30
	};
	let room: unknown = openRoom({ message: 'Hold on' });
	const ends: unknown[][] = [];
	const lobbyService = {
		findWait: async (ticket: string) =>
			ticket === 'known' ? ({ waitId: 'wait-ana', roomId: 'room-1' } as LobbyWait) : null,
		endWaits: jest.fn(async (...args: unknown[]) => {
			ends.push(args);
			return [{ participantIdentity: 'ana' }];
		})
	};
	const handler = new LobbyRealtimeHandler(
		...([
			{ register: (feature: WebSocketFeature) => registered.push(feature) },
			lobbyService,
			{ presence: async () => presence },
			{
				findByRoomId: async () => {
					if (room instanceof Error) throw room;

					return room;
				}
			},
			noopLogger
		] as unknown as ConstructorParameters<typeof LobbyRealtimeHandler>)
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
		lobbyService,
		setPresence: (value: LobbyPresence | null) => (presence = value),
		setRoom: (value: unknown) => (room = value)
	};
};

describe('LobbyRealtimeHandler', () => {
	it('registers the ticket as the credential of its connections', () => {
		const { handler, registered } = build();

		expect(registered).toEqual([handler]);
		expect(handler.credential).toBe('lobbyTicket');
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
			type: MEET_LOBBY_STATE_MESSAGE,
			data: {
				status: MeetLobbyStatus.WAITING,
				queuePosition: 2,
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
				type: MEET_LOBBY_STATE_MESSAGE,
				data: { status: MeetLobbyStatus.WAITING, queuePosition: 2, waitedSeconds: 30, meetingActive: true }
			}
		]);
	});

	it('sends the outcome of an ended wait again, every time', async () => {
		const { handler, connection, sent, setPresence, ends } = build();
		setPresence({ roomId: 'room-1', status: MeetLobbyStatus.REJECTED });

		await handler.onOpen(connection);
		await handler.onPong(connection);

		expect(sent).toEqual([
			expect.objectContaining({ data: expect.objectContaining({ status: MeetLobbyStatus.REJECTED }) }),
			expect.objectContaining({ data: expect.objectContaining({ status: MeetLobbyStatus.REJECTED }) })
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
		['closed', openRoom({ status: MeetRoomStatus.CLOSED }), MeetLobbyStatus.ROOM_CLOSED],
		['deleted', null, MeetLobbyStatus.ROOM_CLOSED],
		['without its waiting room', openRoom({ enabled: false }), MeetLobbyStatus.ADMITTED]
	])('ends the wait of a room %s whose waits were not ended, as the system', async (_case, room, outcome) => {
		const { handler, connection, sent, ends, setRoom } = build();
		setRoom(room);

		await handler.onPong(connection);

		expect(ends).toEqual([['room-1', outcome, MeetEventOrigin.SYSTEM, ['wait-ana']]]);
		expect(sent).toEqual([{ type: MEET_LOBBY_STATE_MESSAGE, data: expect.objectContaining({ status: outcome }) }]);
	});

	it('keeps the state it read when the wait changed before it could be ended', async () => {
		const { handler, connection, sent, setRoom, lobbyService } = build();
		setRoom(openRoom({ status: MeetRoomStatus.CLOSED }));
		lobbyService.endWaits.mockResolvedValueOnce([]);

		await handler.onPong(connection);

		expect(sent).toEqual([
			{ type: MEET_LOBBY_STATE_MESSAGE, data: expect.objectContaining({ status: MeetLobbyStatus.WAITING }) }
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
			{ status: MeetLobbyStatus.WAITING, queuePosition: 2, waitedSeconds: 30 },
			{
				status: MeetLobbyStatus.WAITING,
				queuePosition: 2,
				waitedSeconds: 30,
				meetingActive: false,
				message: 'Hold on'
			},
			{
				status: MeetLobbyStatus.WAITING,
				queuePosition: 2,
				waitedSeconds: 30,
				meetingActive: false,
				message: 'Hold on'
			}
		]);
	});
});
