import { ApplicationInitStatus, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MEETING_MATERIAL_SYMBOLS } from '../../domains/meeting/icons/meeting-material-symbols';
import { materialSymbolsStylesheetUrl, provideMaterialSymbols } from './material-symbols';

describe('Material Symbols', () => {
	const symbolLinks = () =>
		Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[href*="Material+Symbols+Outlined"]'));

	const initApp = async (...extraSymbols: string[][]) => {
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			providers: [provideZonelessChangeDetection(), provideMaterialSymbols(...extraSymbols)]
		});
		await TestBed.inject(ApplicationInitStatus).donePromise;
	};

	const iconNames = (href: string) => new URL(href).searchParams.get('icon_names')!.split(',');

	afterEach(() => symbolLinks().forEach((link) => link.remove()));

	it('asks Google Fonts for the listed icons once each, sorted', () => {
		const href = materialSymbolsStylesheetUrl(['mic', 'add_reaction', 'mic']);

		expect(href).toBe(
			'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&icon_names=add_reaction,mic'
		);
	});

	it('loads one stylesheet with the icons every domain declares', async () => {
		await initApp();

		const links = symbolLinks();
		expect(links.length).toBe(1);
		expect(iconNames(links[0].href)).toEqual(jasmine.arrayContaining([...MEETING_MATERIAL_SYMBOLS]));
	});

	it('adds the icons an edition shows on its own', async () => {
		await initApp(['zzz_edition_icon']);

		expect(iconNames(symbolLinks()[0].href)).toContain('zzz_edition_icon');
	});

	it('does not add the stylesheet twice when the app starts again in the same page', async () => {
		await initApp();
		await initApp();

		expect(symbolLinks().length).toBe(1);
	});
});
