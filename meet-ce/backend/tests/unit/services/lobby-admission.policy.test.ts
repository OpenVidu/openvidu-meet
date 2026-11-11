import { describe, expect, it } from '@jest/globals';
import { MEET_PERMISSION_KEYS, MeetLobbyParticipantType, MeetLobbyStatus } from '@openvidu-meet/typings';
import { MeetRoomMemberHelper } from '../../../src/helpers/room-member.helper.js';
import type { LobbyWait } from '../../../src/models/lobby.model.js';
import { LobbyAdmissionPolicy } from '../../../src/services/lobby/lobby-admission.policy.js';

const policy = new LobbyAdmissionPolicy();
const withLobby = { lobby: { enabled: true } };
const withoutLobby = { lobby: { enabled: false } };

const wait = (overrides: Partial<LobbyWait> = {}): LobbyWait => ({
	waitId: 'wait-1',
	roomId: 'room-1',
	participant: {
		participantIdentity: 'ana-1',
		participantName: 'Ana',
		type: MeetLobbyParticipantType.ANONYMOUS,
		knockDate: 1,
		roomName: 'Room 1'
	},
	status: MeetLobbyStatus.WAITING,
	ended: false,
	...overrides
});

describe('LobbyAdmissionPolicy', () => {
	describe('who waits', () => {
		it('makes a participant without lobbyBypass wait in a room with the waiting room on', () => {
			const speaker = { ...MeetRoomMemberHelper.allPermissions(), lobbyBypass: false };

			expect(policy.mustWait(withLobby, speaker)).toBe(true);
			expect(policy.mustWait(withoutLobby, speaker)).toBe(false);
		});

		it('lets a holder of lobbyBypass join directly, whatever their other permissions', () => {
			const bypass = { ...MeetRoomMemberHelper.noPermissions(), lobbyBypass: true };

			expect(policy.mustWait(withLobby, bypass)).toBe(false);
		});
	});

	describe('permissions of a room member token', () => {
		const all = MeetRoomMemberHelper.allPermissions();

		it('keeps only the recording permissions and roomShareAccessLinks for a token without identity', () => {
			const granted = Object.entries(policy.permissionsOf(withLobby, all))
				.filter(([, value]) => value)
				.map(([key]) => key)
				.sort();

			expect(granted).toEqual(
				[
					'recordingDelete',
					'recordingDownload',
					'recordingList',
					'recordingPlay',
					'roomShareAccessLinks'
				].sort()
			);
		});

		it('keeps a kept permission only when the token holds it', () => {
			const listOnly = { ...MeetRoomMemberHelper.noPermissions(), recordingList: true, meetingRead: true };

			expect(policy.permissionsOf(withLobby, listOnly)).toEqual({
				...MeetRoomMemberHelper.noPermissions(),
				recordingList: true
			});
		});

		it('denies every permission added later, since what is kept is a list', () => {
			const narrowed = policy.permissionsOf(withLobby, all);

			expect(Object.keys(narrowed).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
			expect(narrowed.lobbyAdmin).toBe(false);
			expect(narrowed.meetingEnd).toBe(false);
		});

		it('leaves the token of a participant who joined, and every token of a room without the waiting room, as it is', () => {
			expect(policy.permissionsOf(withLobby, all, 'ana-1')).toBe(all);
			expect(policy.permissionsOf(withoutLobby, all)).toBe(all);
		});
	});

	describe('who asks', () => {
		it('tells the participant type from the credential, a user first', () => {
			expect(policy.participantTypeOf({ userId: 'alice', memberId: 'alice' })).toBe(
				MeetLobbyParticipantType.USER
			);
			expect(policy.participantTypeOf({ memberId: 'guest-1' })).toBe(MeetLobbyParticipantType.IDENTIFIED_GUEST);
			expect(policy.participantTypeOf({})).toBe(MeetLobbyParticipantType.ANONYMOUS);
		});

		it('binds a wait to the member or user who asked, and an anonymous one to nobody', () => {
			expect(policy.principalOf({ memberId: 'guest-1' })).toBe('guest-1');
			expect(policy.principalOf({ userId: 'alice' })).toBe('alice');
			expect(policy.principalOf({})).toBeUndefined();
		});
	});

	describe('what a ticket gets', () => {
		it('answers ended, without a status, for an unknown ticket and for one of another room', () => {
			expect(policy.answerTicket(null, 'room-1', {})).toEqual({ kind: 'ended' });
			expect(policy.answerTicket(wait({ roomId: 'room-2' }), 'room-1', {})).toEqual({ kind: 'ended' });
		});

		it('refuses a ticket presented with another principal than the one that asked', () => {
			const memberWait = wait({ principal: 'guest-1' });

			expect(policy.answerTicket(memberWait, 'room-1', { memberId: 'guest-2' })).toEqual({ kind: 'forbidden' });
			expect(policy.answerTicket(memberWait, 'room-1', {})).toEqual({ kind: 'forbidden' });
			expect(policy.answerTicket(wait(), 'room-1', { userId: 'alice' })).toEqual({ kind: 'forbidden' });
			expect(policy.answerTicket(memberWait, 'room-1', { memberId: 'guest-1' })).toEqual({ kind: 'waiting' });
		});

		it('lets any anonymous link present the ticket of an anonymous wait', () => {
			expect(policy.answerTicket(wait(), 'room-1', {})).toEqual({ kind: 'waiting' });
		});

		it('runs the join steps for an admission not used yet, and an ordinary join for a wait ended as admitted', () => {
			expect(policy.answerTicket(wait({ status: MeetLobbyStatus.ADMITTED }), 'room-1', {})).toEqual({
				kind: 'admitted'
			});
			expect(policy.answerTicket(wait({ status: MeetLobbyStatus.ADMITTED, ended: true }), 'room-1', {})).toEqual({
				kind: 'rejoin'
			});
		});

		it.each([
			MeetLobbyStatus.REJECTED,
			MeetLobbyStatus.LEFT,
			MeetLobbyStatus.EXPIRED,
			MeetLobbyStatus.MEETING_ENDED,
			MeetLobbyStatus.ROOM_CLOSED
		])('answers a wait ended as %s with its status, never a token', (status) => {
			expect(policy.answerTicket(wait({ status, ended: true }), 'room-1', {})).toEqual({ kind: 'ended', status });
		});
	});
});
