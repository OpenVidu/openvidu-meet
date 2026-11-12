/** The icons the console code shows in the `material-symbols-outlined` font. */
export const CONSOLE_MATERIAL_SYMBOLS = [
	'code_blocks',
	'palette',
	'settings'
] as const;

export type ConsoleMaterialSymbol = (typeof CONSOLE_MATERIAL_SYMBOLS)[number];
