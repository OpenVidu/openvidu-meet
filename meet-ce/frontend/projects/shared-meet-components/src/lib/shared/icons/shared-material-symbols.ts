/** The icons the shared code shows in the `material-symbols-outlined` font. */
export const SHARED_MATERIAL_SYMBOLS = [
	'crown'
] as const;

export type SharedMaterialSymbol = (typeof SHARED_MATERIAL_SYMBOLS)[number];
