/**
 * The reactions a participant can send in a meeting, in the order the meeting offers them. Each value
 * is the Unicode CLDR short name of the emoji the meeting shows for it, in snake_case.
 * A reaction shows on the sender's video and in the participants panel for a few seconds and is
 * never stored: a participant who joins later does not see it.
 */
export enum MeetReaction {
	/** 👍 (U+1F44D) */
	THUMBS_UP = 'thumbs_up',
	/** 👎 (U+1F44E) */
	THUMBS_DOWN = 'thumbs_down',
	/** 😀 (U+1F600) */
	GRINNING_FACE = 'grinning_face',
	/** 🙁 (U+1F641) */
	SLIGHTLY_FROWNING_FACE = 'slightly_frowning_face',
	/** 😕 (U+1F615) */
	CONFUSED_FACE = 'confused_face',
	/** 😮 (U+1F62E) */
	FACE_WITH_OPEN_MOUTH = 'face_with_open_mouth',
	/** 👏 (U+1F44F) */
	CLAPPING_HANDS = 'clapping_hands',
	/** ❤️ (U+2764 U+FE0F) */
	RED_HEART = 'red_heart'
}
