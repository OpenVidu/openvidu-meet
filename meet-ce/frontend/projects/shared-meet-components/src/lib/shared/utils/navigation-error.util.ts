import { NavigationErrorReason } from '../models/navigation.model';

/** User-friendly title and message for a technical navigation error reason. */
export interface NavigationErrorDescription {
	title: string;
	message: string;
}

const NAVIGATION_ERROR_DESCRIPTIONS: Record<NavigationErrorReason, NavigationErrorDescription> = {
	[NavigationErrorReason.CLOSED_ROOM]: {
		title: 'Closed room',
		message: 'Meetings in this room are not available while it is closed'
	},
	[NavigationErrorReason.ANONYMOUS_ACCESS_DISABLED]: {
		title: 'Anonymous access disabled',
		message: 'The anonymous access for your role has been disabled in this room (and its recordings)'
	},
	[NavigationErrorReason.ANONYMOUS_RECORDING_ACCESS_DISABLED]: {
		title: 'Anonymous access disabled',
		message: 'The anonymous access for this recording has been disabled'
	},
	[NavigationErrorReason.INVALID_ROOM_SECRET]: {
		title: 'Invalid link',
		message:
			'The link you used to access this room (or its recordings) is not valid. Please ask a moderator to share the correct link using the available share buttons'
	},
	[NavigationErrorReason.INVALID_RECORDING_SECRET]: {
		title: 'Invalid link',
		message: 'The link you used to access this recording is not valid'
	},
	[NavigationErrorReason.INVALID_ROOM]: {
		title: 'Invalid room',
		message: 'The room (or its recordings) you are trying to access does not exist or has been deleted'
	},
	[NavigationErrorReason.INVALID_RECORDING]: {
		title: 'Invalid recording',
		message: 'The recording you are trying to access does not exist or has been deleted'
	},
	[NavigationErrorReason.INVALID_MEMBER]: {
		title: 'Invalid member',
		message: 'You are no longer a member of this room or the member information is incorrect'
	},
	[NavigationErrorReason.FORBIDDEN_ROOM_ACCESS]: {
		title: 'Forbidden room access',
		message: 'You are not authorized to access this room (nor its recordings)'
	},
	[NavigationErrorReason.FORBIDDEN_ROOM_RECORDINGS_ACCESS]: {
		title: 'Forbidden recordings access',
		message: 'You are not authorized to access the recordings in this room'
	},
	[NavigationErrorReason.FORBIDDEN_RECORDING_ACCESS]: {
		title: 'Forbidden recording access',
		message: 'You are not authorized to access this recording'
	},
	[NavigationErrorReason.ROOM_ACCESS_REVOKED]: {
		title: 'Room access revoked',
		message:
			'Your permissions in this room have been changed, and you no longer have access (nor its recordings). Please contact a moderator for more information'
	},
	[NavigationErrorReason.TOO_MANY_REQUESTS]: {
		title: 'Too many requests',
		message: 'You have made too many requests in a short period of time. Please wait a moment and try again'
	},
	[NavigationErrorReason.INTERNAL_ERROR]: {
		title: 'Internal error',
		message: 'An unexpected error occurred, please try again later'
	}
};

/**
 * Maps a technical navigation error reason to a user-friendly title and message.
 * Unknown/unrecognized reasons fall back to the generic internal-error description.
 */
export function describeNavigationError(reason: string | NavigationErrorReason): NavigationErrorDescription {
	const normalized = Object.values(NavigationErrorReason).find((value) => value === reason);
	return NAVIGATION_ERROR_DESCRIPTIONS[normalized ?? NavigationErrorReason.INTERNAL_ERROR];
}
