import { describe, expect, it } from '@jest/globals';
import {
	MEET_PERMISSION_KEYS,
	MeetParticipantType,
	MeetRoomMemberRole,
	MeetWaitingParticipantStatus
} from '@openvidu-meet/typings';
import { MeetRoomMemberHelper } from '../../../src/helpers/room-member.helper.js';
import type { ParticipantWait } from '../../../src/models/waiting-participant.model.js';
import { WaitingParticipantAdmissionPolicy } from '../../../src/services/waiting-participants/waiting-participant-admission.policy.js';

const policy = new WaitingParticipantAdmissionPolicy();
const lockedRoom = { enabled: true };
const unlockedRoom = { enabled: false };

const wait = (overrides: Partial<ParticipantWait> = {}): ParticipantWait => ({
	waitId: 'wait-1',
	roomId: 'room-1',
	participant: {
		participantIdentity: 'ana-1',
		participantName: 'Ana',
		type: MeetParticipantType.ANONYMOUS,
		role: MeetRoomMemberRole.SPEAKER,
		knockDate: 1,
		roomName: 'Room 1'
	},
	status: MeetWaitingParticipantStatus.WAITING,
	ended: false,
	...overrides
});

describe('WaitingParticipantAdmissionPolicy', () => {
	describe('who waits', () => {
		it('makes a participant without accessBypassLock wait in a locked room', () => {
			const speaker = { ...MeetRoomMemberHelper.allPermissions(), accessBypassLock: false };

			expect(policy.mustWait(lockedRoom, speaker)).toBe(true);
			expect(policy.mustWait(unlockedRoom, speaker)).toBe(false);
		});

		it('lets a holder of accessBypassLock join directly, whatever their other permissions', () => {
			const bypass = { ...MeetRoomMemberHelper.noPermissions(), accessBypassLock: true };

			expect(policy.mustWait(lockedRoom, bypass)).toBe(false);
		});
	});

	describe('permissions of a room member token', () => {
		const all = MeetRoomMemberHelper.allPermissions();

		it('keeps only the recording permissions and roomShareAccessLinks for a token without identity', () => {
			const granted = Object.entries(policy.permissionsOf(lockedRoom, all))
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

			expect(policy.permissionsOf(lockedRoom, listOnly)).toEqual({
				...MeetRoomMemberHelper.noPermissions(),
				recordingList: true
			});
		});

		it('denies every permission added later, since what is kept is a list', () => {
			const narrowed = policy.permissionsOf(lockedRoom, all);

			expect(Object.keys(narrowed).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
			expect(narrowed.waitingParticipantAdmin).toBe(false);
			expect(narrowed.meetingEnd).toBe(false);
		});

		it('leaves the token of a participant who joined, and every token of an unlocked room, as it is', () => {
			expect(policy.permissionsOf(lockedRoom, all, 'ana-1')).toBe(all);
			expect(policy.permissionsOf(unlockedRoom, all)).toBe(all);
		});
	});

	describe('who asks', () => {
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
			expect(policy.answerTicket(wait({ status: MeetWaitingParticipantStatus.ADMITTED }), 'room-1', {})).toEqual({
				kind: 'admitted'
			});
			expect(
				policy.answerTicket(wait({ status: MeetWaitingParticipantStatus.ADMITTED, ended: true }), 'room-1', {})
			).toEqual({
				kind: 'rejoin'
			});
		});

		it.each([
			MeetWaitingParticipantStatus.REJECTED,
			MeetWaitingParticipantStatus.LEFT,
			MeetWaitingParticipantStatus.EXPIRED,
			MeetWaitingParticipantStatus.MEETING_ENDED,
			MeetWaitingParticipantStatus.ROOM_CLOSED
		])('answers a wait ended as %s with its status, never a token', (status) => {
			expect(policy.answerTicket(wait({ status, ended: true }), 'room-1', {})).toEqual({ kind: 'ended', status });
		});
	});
});
