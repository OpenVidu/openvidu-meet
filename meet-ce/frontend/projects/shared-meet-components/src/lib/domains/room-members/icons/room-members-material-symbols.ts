/** The icons the room members code shows in the `material-symbols-outlined` font. */
export const ROOM_MEMBERS_MATERIAL_SYMBOLS = [
	'add_link',
	'add_reaction',
	'background_replace',
	'crown',
	'delete',
	'do_not_touch',
	'download',
	'edit',
	'fast_forward',
	'fiber_manual_record',
	'how_to_reg',
	'link',
	'login',
	'manage_accounts',
	'meeting_room',
	'mic',
	'mic_off',
	'monitoring',
	'person',
	'person_remove',
	'play_circle',
	'record_voice_over',
	'screen_share',
	'sensors',
	'shield_person',
	'verified_user',
	'video_library',
	'videocam',
	'visibility'
] as const;

export type RoomMembersMaterialSymbol = (typeof ROOM_MEMBERS_MATERIAL_SYMBOLS)[number];
