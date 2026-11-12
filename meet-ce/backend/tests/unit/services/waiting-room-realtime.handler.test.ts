import { describe, expect, it, jest } from '@jest/globals';
import {
	MEET_WAITING_ROOM_STATE_MESSAGE,
	MeetEventOrigin,
	MeetWaitingRoomReason,
	MeetWaitingRoomStatus,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import type { WaitingRoomPresence, WaitingRoomWait } from '../../../src/models/waiting-room.model.js';
import type { WebSocketConnection, WebSocketFeature } from '../../../src/models/websocket.model.js';
import { WaitingRoomRealtimeHandler } from '../../../src/services/waiting-room/waiting-room-realtime.handler.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

const openRoom = (overrides: { status?: MeetRoomStatus; enabled?: boolean; message?: string } = {}) => ({
	status: overrides.status ?? MeetRoomStatus.OPEN,
	config: { waitingRoom: { enabled: overrides.enabled ?? true, message: overrides.message } }
});

const build = () => {
	const registered: WebSocketFeature[] = [];
	let presence: WaitingRoomPresence | null = {
		roomId: 'room-1',
		status: MeetWaitingRoomStatus.WAITING,
		queuePosition: 2,
		waitedSeconds: 30
	};
	let room: unknown = openRoom({ message: 'Hold on' });
	const ends: unknown[][] = [];
	const pageClosed = jest.fn(async (..._args: unknown[]) => {});
	const waitingRoomService = {
		findWait: async (ticket: string) =>
			ticket === 'known' ? ({ waitId: 'wait-ana', roomId: 'room-1' } as WaitingRoomWait) : null,
		pageClosed,
		endWaits: jest.fn(async (...args: unknown[]) => {
			ends.push(args);
			return [{ participantIdentity: 'ana' }];
		})
	};
	const handler = new WaitingRoomRealtimeHandler(
		...([
			{ register: (feature: WebSocketFeature) => registered.push(feature) },
			waitingRoomService,
			{ presence: async () => presence },
			{
				findByRoomId: async () => {
					if (room instanceof Error) throw room;

					return room;
				}
			},
			noopLogger
		] as unknown as ConstructorParameters<typeof WaitingRoomRealtimeHandler>)
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
		waitingRoomService,
		pageClosed,
		setPresence: (value: WaitingRoomPresence | null) => (presence = value),
		setRoom: (value: unknown) => (room = value)
	};
};

describe('WaitingRoomRealtimeHandler', () => {
	it('registers the ticket as the credential of its connections', () => {
		const { handler, registered } = build();

		expect(registered).toEqual([handler]);
		expect(handler.credential).toBe('waitingRoomTicket');
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
			type: MEET_WAITING_ROOM_STATE_MESSAGE,
			data: {
				status: MeetWaitingRoomStatus.WAITING,
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
				type: MEET_WAITING_ROOM_STATE_MESSAGE,
				data: {
					status: MeetWaitingRoomStatus.WAITING,
					queuePosition: 2,
					waitedSeconds: 30,
					meetingActive: true
				}
			}
		]);
	});

	it('sends the outcome of an ended wait again, every time', async () => {
		const { handler, connection, sent, setPresence, ends } = build();
		setPresence({ roomId: 'room-1', status: MeetWaitingRoomStatus.REJECTED });

		await handler.onOpen(connection);
		await handler.onPong(connection);

		expect(sent).toEqual([
			expect.objectContaining({ data: expect.objectContaining({ status: MeetWaitingRoomStatus.REJECTED }) }),
			expect.objectContaining({ data: expect.objectContaining({ status: MeetWaitingRoomStatus.REJECTED }) })
		]);
		expect(ends).toEqual([]);
	});

	it('ends the wait when its page goes away, telling how long ago the connection last answered', async () => {
		const { handler, connection, pageClosed } = build();

		await handler.onClose({ ...connection, lastSeenAt: Date.now() - 12_000 }, 1001);

		expect(pageClosed).toHaveBeenCalledTimes(1);
		expect(pageClosed.mock.calls[0].slice(0, 2)).toEqual(['room-1', 'wait-ana']);
		expect(pageClosed.mock.calls[0][2]).toBeGreaterThanOrEqual(12_000);
		expect(pageClosed.mock.calls[0][2]).toBeLessThan(13_000);
	});

	it.each([1000, 1005, 1006, 4003])('keeps the wait on a connection closed with %s', async (code) => {
		const { handler, connection, pageClosed } = build();

		await handler.onClose(connection, code);

		expect(pageClosed).not.toHaveBeenCalled();
	});

	it('sends nothing for a wait no longer known', async () => {
		const { handler, connection, sent, setPresence } = build();
		setPresence(null);

		await handler.onPong(connection);

		expect(sent).toEqual([]);
	});

	it.each([
		['closed', openRoom({ status: MeetRoomStatus.CLOSED }), MeetWaitingRoomStatus.ROOM_CLOSED, undefined],
		['deleted', null, MeetWaitingRoomStatus.ROOM_CLOSED, undefined],
		[
			'without its waiting room',
			openRoom({ enabled: false }),
			MeetWaitingRoomStatus.ADMITTED,
			MeetWaitingRoomReason.WAITING_ROOM_DISABLED
		]
	])('ends the wait of a room %s whose waits were not ended, as the system', async (_case, room, outcome, reason) => {
		const { handler, connection, sent, ends, setRoom } = build();
		setRoom(room);

		await handler.onPong(connection);

		expect(ends).toEqual([['room-1', outcome, MeetEventOrigin.SYSTEM, ['wait-ana'], reason]]);
		expect(sent).toEqual([
			{ type: MEET_WAITING_ROOM_STATE_MESSAGE, data: expect.objectContaining({ status: outcome }) }
		]);
	});

	it('keeps the state it read when the wait changed before it could be ended', async () => {
		const { handler, connection, sent, setRoom, waitingRoomService } = build();
		setRoom(openRoom({ status: MeetRoomStatus.CLOSED }));
		waitingRoomService.endWaits.mockResolvedValueOnce([]);

		await handler.onPong(connection);

		expect(sent).toEqual([
			{
				type: MEET_WAITING_ROOM_STATE_MESSAGE,
				data: expect.objectContaining({ status: MeetWaitingRoomStatus.WAITING })
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
			{ status: MeetWaitingRoomStatus.WAITING, queuePosition: 2, waitedSeconds: 30 },
			{
				status: MeetWaitingRoomStatus.WAITING,
				queuePosition: 2,
				waitedSeconds: 30,
				meetingActive: false,
				message: 'Hold on'
			},
			{
				status: MeetWaitingRoomStatus.WAITING,
				queuePosition: 2,
				waitedSeconds: 30,
				meetingActive: false,
				message: 'Hold on'
			}
		]);
	});
});
