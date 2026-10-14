import { MeetReaction } from '@openvidu-meet/typings';

/** How long a reaction stays on screen. */
export const REACTION_LIFETIME_MS = 10_000;

/** How often, at most, a participant's reaction goes to the server: picks in between replace each other. */
export const REACTION_COOLDOWN_MS = 1_000;

/** A participant's reaction while it is on screen. */
export interface LiveReaction {
	reaction: MeetReaction;
	/** When it arrived, by this device's clock. The same reaction sent again arrives anew and starts over. */
	shownAt: number;
}

/** How many participants show one reaction at the moment. */
export interface ReactionCount {
	reaction: MeetReaction;
	count: number;
}

/** The emoji the meeting shows for each reaction. */
export const REACTION_EMOJI: Record<MeetReaction, string> = {
	[MeetReaction.THUMBS_UP]: '👍',
	[MeetReaction.THUMBS_DOWN]: '👎',
	[MeetReaction.GRINNING_FACE]: '😀',
	[MeetReaction.SLIGHTLY_FROWNING_FACE]: '🙁',
	[MeetReaction.CONFUSED_FACE]: '😕',
	[MeetReaction.FACE_WITH_OPEN_MOUTH]: '😮',
	[MeetReaction.CLAPPING_HANDS]: '👏',
	[MeetReaction.RED_HEART]: '❤️'
};

/** The translation key that names each reaction, for its tooltip and for screen readers. */
export const REACTION_NAME_KEYS = Object.fromEntries(
	Object.entries(MeetReaction).map(([key, reaction]) => [reaction, `REACTIONS.NAMES.${key}`])
) as Record<MeetReaction, string>;
