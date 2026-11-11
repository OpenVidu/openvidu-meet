import { HttpErrorResponse } from '@angular/common/http';
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

describe('isWaitingRoomFull', () => {
	const failure = (status: number, message: string) => new HttpErrorResponse({ status, error: { message } });

	it('tells a full waiting room from the other refusals of a join', () => {
		expect(isWaitingRoomFull(failure(409, "The waiting room of room 'r1' is full"))).toBeTrue();
		expect(isWaitingRoomFull(failure(409, "Room 'r1' has reached its maximum number of participants"))).toBeFalse();
		expect(isWaitingRoomFull(failure(409, "Room 'r1' is closed and cannot be joined"))).toBeFalse();
		expect(isWaitingRoomFull(failure(403, 'The waiting room is on'))).toBeFalse();
	});
});

describe('isWaitingRoomWaitEnded', () => {
	const failure = (status: number, message: string) => new HttpErrorResponse({ status, error: { message } });

	it('tells an ended wait from the other refusals of a join with a ticket', () => {
		expect(isWaitingRoomWaitEnded(failure(409, 'The wait has ended'))).toBeTrue();
		expect(
			isWaitingRoomWaitEnded(failure(409, "Room 'r1' has reached its maximum number of participants"))
		).toBeFalse();
		expect(isWaitingRoomWaitEnded(failure(409, "Room 'r1' is closed and cannot be joined"))).toBeFalse();
		expect(isWaitingRoomWaitEnded(failure(404, 'The wait has ended'))).toBeFalse();
	});
});
