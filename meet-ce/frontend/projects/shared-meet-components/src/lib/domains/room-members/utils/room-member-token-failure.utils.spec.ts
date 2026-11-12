import { HttpErrorResponse } from '@angular/common/http';
import { MeetWaitingRoomErrorCode } from '@openvidu-meet/typings';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { isWaitingRoomWaitEnded, isWaitingRoomFull, roomMemberTokenFailure } from './room-member-token-failure.utils';

describe('roomMemberTokenFailure', () => {
	const failure = (status: number, message = '') => new HttpErrorResponse({ status, error: { message } });

	const cases: [string, unknown, NavigationErrorReason][] = [
		['an invalid secret', failure(400, 'Invalid secret'), NavigationErrorReason.INVALID_ROOM_SECRET],
		[
			'disabled anonymous access',
			failure(403, 'Anonymous access with the speaker secret is disabled'),
			NavigationErrorReason.ANONYMOUS_ACCESS_DISABLED
		],
		['any other refusal', failure(403, 'Insufficient permissions'), NavigationErrorReason.FORBIDDEN_ROOM_ACCESS],
		['an unknown member', failure(404, "Room member 'm1' not found"), NavigationErrorReason.INVALID_MEMBER],
		['an unknown room', failure(404, "Room 'r1' not found"), NavigationErrorReason.INVALID_ROOM],
		[
			'a full meeting',
			failure(409, 'The meeting has reached the maximum number of participants'),
			NavigationErrorReason.MEETING_FULL
		],
		['a closed room', failure(409, 'Room is closed'), NavigationErrorReason.CLOSED_ROOM],
		['refused participant data', failure(422, 'Invalid request'), NavigationErrorReason.INVALID_PARTICIPANT_DATA],
		['too many requests', failure(429), NavigationErrorReason.TOO_MANY_REQUESTS],
		['a server error', failure(500), NavigationErrorReason.INTERNAL_ERROR],
		['a network failure', new Error('Failed to fetch'), NavigationErrorReason.INTERNAL_ERROR],
		['no error at all', undefined, NavigationErrorReason.INTERNAL_ERROR]
	];

	for (const [what, error, reason] of cases) {
		it(`maps ${what} to ${reason}`, () => {
			expect(roomMemberTokenFailure(error)).toBe(reason);
		});
	}

	it('reads the fragment from the error itself when the response has no body', () => {
		expect(roomMemberTokenFailure({ status: 404, message: 'Room member not found' })).toBe(
			NavigationErrorReason.INVALID_MEMBER
		);
	});
});

describe('waiting room refusals', () => {
	const refusal = (status: number, error: string, message = '') =>
		new HttpErrorResponse({ status, error: { error, message } });

	it('tells a full waiting room from the other refusals of a join, by its code', () => {
		expect(isWaitingRoomFull(refusal(409, MeetWaitingRoomErrorCode.WAITING_ROOM_FULL))).toBeTrue();
		expect(isWaitingRoomFull(refusal(409, 'Room Error', 'The waiting room of room is full'))).toBeFalse();
		expect(isWaitingRoomFull(refusal(409, MeetWaitingRoomErrorCode.WAIT_ENDED))).toBeFalse();
	});

	it('tells an ended wait from the other refusals of a join with a ticket, by its code', () => {
		expect(isWaitingRoomWaitEnded(refusal(409, MeetWaitingRoomErrorCode.WAIT_ENDED))).toBeTrue();
		expect(isWaitingRoomWaitEnded(refusal(409, 'Room Error', 'The wait has ended'))).toBeFalse();
		expect(isWaitingRoomWaitEnded(refusal(409, MeetWaitingRoomErrorCode.WAITING_ROOM_FULL))).toBeFalse();
	});
});
