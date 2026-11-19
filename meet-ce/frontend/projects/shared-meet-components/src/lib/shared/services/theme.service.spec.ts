import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	MEETING_DARK_THEME,
	MeetingThemeMode,
	MeetingThemeService,
	THEME_ROOT_ELEMENT
} from '../../domains/meeting/openvidu-components';
import { MeetStorageService } from './storage.service';
import { ThemeService } from './theme.service';

class MeetStorageServiceStub {
	stored: MeetingThemeMode | null = null;

	getTheme() {
		return this.stored;
	}

	setTheme(theme: MeetingThemeMode) {
		this.stored = theme;
	}
}

/**
 * The theme lands on one root element: the document root in the standalone app and the iframe, none
 * at all inside `<openvidu-meet>`, whose own host renders it, so the host page's `<html>` stays as the
 * host left it.
 */
describe('ThemeService', () => {
	const html = document.documentElement;
	let storage: MeetStorageServiceStub;

	const createServices = (root?: HTMLElement | null) => {
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: MeetStorageService, useValue: storage },
				...(root === undefined ? [] : [{ provide: THEME_ROOT_ELEMENT, useValue: root }])
			]
		});

		return { theme: TestBed.inject(ThemeService), meetingTheme: TestBed.inject(MeetingThemeService) };
	};

	const cleanHtml = () => {
		html.removeAttribute('data-theme');
		html.removeAttribute('data-ov-theme');
		html.removeAttribute('style');
	};

	const htmlAttributes = () => [...html.attributes].map(({ name, value }) => `${name}=${value}`);
	let untouchedHtml: string[];

	const mockSystemTheme = (dark: boolean) => {
		const listeners: ((event: { matches: boolean }) => void)[] = [];
		spyOn(window, 'matchMedia').and.returnValue({
			matches: dark,
			addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.push(listener)
		} as unknown as MediaQueryList);

		return { switchTo: (matches: boolean) => listeners.forEach((listener) => listener({ matches })) };
	};

	beforeEach(() => {
		storage = new MeetStorageServiceStub();
		cleanHtml();
		untouchedHtml = htmlAttributes();
	});
	afterEach(cleanHtml);

	it('themes the document root by default', () => {
		const { theme } = createServices();

		theme.init();
		theme.toggleTheme();

		expect(html.getAttribute('data-ov-theme')).toBeTruthy();
		expect(html.style.getPropertyValue('--ov-background-color')).toBeTruthy();
		expect(html.getAttribute('data-theme') === 'dark').toBe(theme.isDark());
	});

	it('themes the element it is given instead of the document root', () => {
		const root = document.createElement('div');
		const { theme } = createServices(root);

		theme.init();

		if (!theme.isDark()) {
			theme.toggleTheme();
		}

		expect(root.getAttribute('data-theme')).toBe('dark');
		expect(root.getAttribute('data-ov-theme')).toBe('dark');
		expect(root.style.getPropertyValue('--ov-background-color')).toBe(MEETING_DARK_THEME['--ov-background-color']!);
		expect(htmlAttributes()).toEqual(untouchedHtml);
	});

	it('leaves the document untouched without a root element, keeping what it applied for the shell to render', () => {
		const { theme, meetingTheme } = createServices(null);

		theme.init();

		if (!theme.isDark()) {
			theme.toggleTheme();
		}

		meetingTheme.updateThemeVariables({ '--ov-primary-action-color': '#123456' });

		expect(htmlAttributes()).toEqual(untouchedHtml);
		expect(meetingTheme.appliedVariables()).toEqual(
			jasmine.objectContaining({
				'--ov-background-color': MEETING_DARK_THEME['--ov-background-color']!,
				'--ov-primary-action-color': '#123456'
			})
		);
	});

	it('remembers the chosen theme for the next load', () => {
		mockSystemTheme(false);
		createServices().theme.toggleTheme();

		const { theme } = createServices();
		theme.init();

		expect(theme.isDark()).toBeTrue();
	});

	it('keeps the stored choice over the operating system preference', () => {
		mockSystemTheme(false);
		storage.stored = MeetingThemeMode.Dark;
		const { theme } = createServices();

		theme.init();

		expect(theme.isDark()).toBeTrue();
	});

	it('follows the operating system while no choice is stored, without storing it', () => {
		const system = mockSystemTheme(false);
		const { theme } = createServices();
		theme.init();

		expect(theme.isDark()).toBeFalse();

		system.switchTo(true);

		expect(theme.isDark()).toBeTrue();
		expect(storage.stored).toBeNull();
	});

	it('ignores the operating system once a choice is stored', () => {
		const system = mockSystemTheme(false);
		storage.stored = MeetingThemeMode.Light;
		const { theme } = createServices();
		theme.init();

		system.switchTo(true);

		expect(theme.isDark()).toBeFalse();
	});

	it('shares its preference with the meeting theme selector', () => {
		mockSystemTheme(false);
		const { theme, meetingTheme } = createServices();
		theme.init();

		theme.toggleTheme();

		expect(meetingTheme.currentTheme()).toBe(MeetingThemeMode.Dark);
		expect(storage.stored).toBe(MeetingThemeMode.Dark);
	});
});
