/** The icons the meeting code shows in the `material-symbols-outlined` font. */
export const MEETING_MATERIAL_SYMBOLS = [
	'add_moderator',
	'add_reaction',
	'background_replace',
	'browse',
	'do_not_touch',
	'front_hand',
	'grid_view',
	'keep',
	'keep_off',
	'keyboard_arrow_up',
	'manage_accounts',
	'mic',
	'mic_off',
	'more_vert',
	'person_remove',
	'pip',
	'remove_moderator',
	'screen_share',
	'stop_screen_share',
	'subtitles',
	'videocam',
	'videocam_off',
	'volume_off',
	'volume_up'
] as const;

export type MeetingMaterialSymbol = (typeof MEETING_MATERIAL_SYMBOLS)[number];
