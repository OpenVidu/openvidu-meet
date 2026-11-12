import { DOCUMENT, EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { CONSOLE_MATERIAL_SYMBOLS } from '../../domains/console/icons/console-material-symbols';
import { MEETING_MATERIAL_SYMBOLS } from '../../domains/meeting/icons/meeting-material-symbols';
import { ROOM_MEMBERS_MATERIAL_SYMBOLS } from '../../domains/room-members/icons/room-members-material-symbols';
import { ROOMS_MATERIAL_SYMBOLS } from '../../domains/rooms/icons/rooms-material-symbols';
import { USERS_MATERIAL_SYMBOLS } from '../../domains/users/icons/users-material-symbols';
import { SHARED_MATERIAL_SYMBOLS } from './shared-material-symbols';

const MEET_MATERIAL_SYMBOLS: ReadonlyArray<readonly string[]> = [
	CONSOLE_MATERIAL_SYMBOLS,
	MEETING_MATERIAL_SYMBOLS,
	ROOM_MEMBERS_MATERIAL_SYMBOLS,
	ROOMS_MATERIAL_SYMBOLS,
	USERS_MATERIAL_SYMBOLS,
	SHARED_MATERIAL_SYMBOLS
];

/**
 * The Google Fonts stylesheet of the Material Symbols Outlined font reduced to the given icons. The font
 * draws only the icons it is asked for, so a name missing here shows as its plain text.
 */
export const materialSymbolsStylesheetUrl = (symbols: readonly string[]): string => {
	const iconNames = [...new Set(symbols)].sort().join(',');
	return `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&icon_names=${iconNames}`;
};

/**
 * Loads the Material Symbols every domain declares in its `icons/<domain>-material-symbols.ts`, plus the
 * `extraSymbols` an edition or a host app shows on its own, as one stylesheet in the document head.
 */
export const provideMaterialSymbols = (...extraSymbols: ReadonlyArray<readonly string[]>): EnvironmentProviders =>
	provideAppInitializer(() => {
		const document = inject(DOCUMENT);
		const href = materialSymbolsStylesheetUrl([...MEET_MATERIAL_SYMBOLS, ...extraSymbols].flat());

		if (document.head.querySelector(`link[href="${href}"]`)) {
			return;
		}

		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		document.head.appendChild(link);
	});
