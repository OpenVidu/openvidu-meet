import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MEETING_DARK_THEME, MeetingThemeService, THEME_ROOT_ELEMENT } from '../../domains/meeting/openvidu-components';
import { MeetStorageService } from './storage.service';
import { ThemeService } from './theme.service';

class MeetStorageServiceStub {
	getTheme() {
		return null;
	}

	setTheme() {}

	removeTheme() {}
}

/**
 * The theme lands on one root element: the document root in the standalone app and the iframe, none
 * at all inside `<openvidu-meet>`, whose own host renders it, so the host page's `<html>` stays as the
 * host left it.
 */
describe('ThemeService', () => {
	const html = document.documentElement;

	const createServices = (root?: HTMLElement | null) => {
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: MeetStorageService, useClass: MeetStorageServiceStub },
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

	beforeEach(() => {
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
});
