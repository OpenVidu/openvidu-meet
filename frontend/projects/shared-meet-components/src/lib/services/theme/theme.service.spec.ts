import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { ThemeService, Theme } from './theme.service';

describe('ThemeService', () => {
	let service: ThemeService;
	let mockDocument: jasmine.SpyObj<Document>;
	let mockHtmlElement: jasmine.SpyObj<HTMLElement>;

	beforeEach(() => {
		// Mock localStorage
		let store: { [key: string]: string } = {};
		spyOn(localStorage, 'getItem').and.callFake((key: string) => store[key] || null);
		spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => (store[key] = value));
		spyOn(localStorage, 'removeItem').and.callFake((key: string) => delete store[key]);

		// Mock document
		mockHtmlElement = jasmine.createSpyObj('HTMLElement', ['setAttribute', 'removeAttribute']);
		mockDocument = jasmine.createSpyObj('Document', [], { documentElement: mockHtmlElement });

		TestBed.configureTestingModule({
			providers: [{ provide: DOCUMENT, useValue: mockDocument }]
		});
		service = TestBed.inject(ThemeService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should initialize with light theme by default', () => {
		expect(service.currentTheme()).toBe('light');
		expect(service.isLight()).toBe(true);
		expect(service.isDark()).toBe(false);
	});

	it('should set theme correctly', () => {
		service.setTheme('dark');

		expect(service.currentTheme()).toBe('dark');
		expect(service.isDark()).toBe(true);
		expect(service.isLight()).toBe(false);
		expect(mockHtmlElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
		expect(localStorage.setItem).toHaveBeenCalledWith('ov-theme-preference', 'dark');
	});

	it('should toggle theme correctly', () => {
		// Start with light theme
		expect(service.currentTheme()).toBe('light');

		// Toggle to dark
		service.toggleTheme();
		expect(service.currentTheme()).toBe('dark');
		expect(mockHtmlElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');

		// Toggle back to light
		service.toggleTheme();
		expect(service.currentTheme()).toBe('light');
		expect(mockHtmlElement.removeAttribute).toHaveBeenCalledWith('data-theme');
	});

	it('should remove data-theme attribute for light theme', () => {
		service.setTheme('light');
		expect(mockHtmlElement.removeAttribute).toHaveBeenCalledWith('data-theme');
	});

	it('should reset to system preference', () => {
		// Set a custom theme first
		service.setTheme('dark');
		expect(localStorage.setItem).toHaveBeenCalledWith('ov-theme-preference', 'dark');

		// Reset to system preference
		service.resetToSystemPreference();
		expect(localStorage.removeItem).toHaveBeenCalledWith('ov-theme-preference');
	});

	it('should return current theme value', () => {
		service.setTheme('dark');
		expect(service.getThemeValue()).toBe('dark');

		service.setTheme('light');
		expect(service.getThemeValue()).toBe('light');
	});
});
