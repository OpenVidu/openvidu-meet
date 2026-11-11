import { NavigationErrorReason } from '../../../shared/models/navigation.model';

/**
 * The error screen for a failed room member token request. The server's error body carries only a
 * message, so a few statuses are told apart by a fragment of it.
 */
export function roomMemberTokenFailure(error: unknown): NavigationErrorReason {
	const { status, message } = describe(error);

	switch (status) {
		case 400:
			return NavigationErrorReason.INVALID_ROOM_SECRET;
		case 403:
			return message.includes('Anonymous access')
				? NavigationErrorReason.ANONYMOUS_ACCESS_DISABLED
				: NavigationErrorReason.FORBIDDEN_ROOM_ACCESS;
		case 404:
			return message.includes('Room member')
				? NavigationErrorReason.INVALID_MEMBER
				: NavigationErrorReason.INVALID_ROOM;
		case 409:
			return message.includes('maximum number of participants')
				? NavigationErrorReason.MEETING_FULL
				: NavigationErrorReason.CLOSED_ROOM;
		case 422:
			return NavigationErrorReason.INVALID_PARTICIPANT_DATA;
		case 429:
			return NavigationErrorReason.TOO_MANY_REQUESTS;
		default:
			return NavigationErrorReason.INTERNAL_ERROR;
	}
}

/** Whether the request to join was refused because the waiting room holds as many participants as it can. */
export function isWaitingRoomFull(error: unknown): boolean {
	const { status, message } = describe(error);
	return status === 409 && message.includes('waiting room');
}

/** Whether the request to join with a ticket was refused because its wait is over or unknown. */
export function isLobbyWaitEnded(error: unknown): boolean {
	const { status, message } = describe(error);
	return status === 409 && message.includes('wait has ended');
}

function describe(error: unknown): { status?: number; message: string } {
	const {
		status,
		message,
		error: body
	} = (error ?? {}) as {
		status?: number;
		message?: string;
		error?: { message?: string };
	};
	return { status, message: body?.message || message || '' };
}
