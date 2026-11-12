/** The icons the users code shows in the `material-symbols-outlined` font. */
export const USERS_MATERIAL_SYMBOLS = [
	'group'
] as const;

export type UsersMaterialSymbol = (typeof USERS_MATERIAL_SYMBOLS)[number];
