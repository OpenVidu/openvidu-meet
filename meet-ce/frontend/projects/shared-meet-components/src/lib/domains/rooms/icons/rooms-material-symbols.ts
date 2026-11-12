/** The icons the rooms code shows in the `material-symbols-outlined` font. */
export const ROOMS_MATERIAL_SYMBOLS = [
	'auto_delete',
	'background_replace',
	'close',
	'hourglass_top',
	'record_voice_over',
	'shield_person',
	'verified_user',
	'warning'
] as const;

export type RoomsMaterialSymbol = (typeof ROOMS_MATERIAL_SYMBOLS)[number];
