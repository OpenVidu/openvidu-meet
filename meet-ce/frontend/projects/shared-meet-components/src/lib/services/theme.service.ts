import { computed, Inject, Injectable, signal, DOCUMENT } from '@angular/core';
import { OpenViduThemeMode, OpenViduThemeService } from 'openvidu-components-angular';

export type Theme = 'light' | 'dark';

@Injectable({
	providedIn: 'root'
})
export class ThemeService {
	private readonly THEME_KEY = 'ovMeet-theme';
	private readonly _currentTheme = signal<Theme>('light');

	// Computed signals for reactivity
	public readonly currentTheme = computed(() => this._currentTheme());
	public readonly isDark = computed(() => this._currentTheme() === 'dark');
	public readonly isLight = computed(() => this._currentTheme() === 'light');

	constructor(
		@Inject(DOCUMENT) private document: Document,
		protected ovComponentsThemeService: OpenViduThemeService
	) {}

	/**
	 * Initializes the theme based on:
	 * 1. Saved preference in localStorage
	 * 2. System preference (prefers-color-scheme)
	 * 3. Light theme as default
	 */
	initializeTheme(): void {
		// Override available themes in OpenVidu Components to match OpenVidu Meet themes.
		// OpenVidu Meet users do not know nothing about "classic" theme.
		this.ovComponentsThemeService.getAllThemes = () => [OpenViduThemeMode.Light, OpenViduThemeMode.Dark];

		const savedTheme = this.getSavedTheme();
		const systemPreference = this.getSystemPreference();
		const initialTheme = savedTheme || systemPreference || 'light';

		// Only save if there's a saved preference, otherwise use system preference without saving
		this.setTheme(initialTheme, !!savedTheme);
		this.listenToSystemChanges();
	}

	/**
	 * Toggles between light and dark theme
	 */
	public toggleTheme(): void {
		const newTheme: Theme = this._currentTheme() === 'light' ? 'dark' : 'light';
		this.setTheme(newTheme, true);
	}

	/**
	 * Changes the current theme
	 * @param theme The theme to set
	 * @param saveToStorage Whether to save the theme to localStorage (default: true)
	 */
	private setTheme(theme: Theme, saveToStorage: boolean = true): void {
		this._currentTheme.set(theme);
		this.applyThemeToDocument(theme);
		if (saveToStorage) {
			this.saveThemePreference(theme);
		}
		this.ovComponentsThemeService.setTheme(theme as OpenViduThemeMode);
	}

	/**
	 * Applies the theme to the document
	 */
	private applyThemeToDocument(theme: Theme): void {
		const htmlElement = this.document.documentElement;

		if (theme === 'dark') {
			htmlElement.setAttribute('data-theme', 'dark');
		} else {
			htmlElement.removeAttribute('data-theme');
		}
	}

	/**
	 * Saves the theme preference in localStorage
	 */
	private saveThemePreference(theme: Theme): void {
		try {
			localStorage.setItem(this.THEME_KEY, theme);
		} catch (error) {
			console.warn('Could not save theme preference:', error);
		}
	}

	/**
	 * Gets the saved preference from localStorage
	 */
	private getSavedTheme(): Theme | null {
		try {
			const saved = localStorage.getItem(this.THEME_KEY);
			return saved === 'dark' || saved === 'light' ? saved : null;
		} catch (error) {
			console.warn('Could not read theme preference:', error);
			return null;
		}
	}

	/**
	 * Gets the system preference
	 */
	private getSystemPreference(): Theme {
		if (typeof window !== 'undefined' && window.matchMedia) {
			return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
		return 'light';
	}

	/**
	 * Listens to system preference changes
	 */
	private listenToSystemChanges(): void {
		if (typeof window !== 'undefined' && window.matchMedia) {
			const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

			// Only update if there's no saved preference
			mediaQuery.addEventListener('change', (e) => {
				if (!this.getSavedTheme()) {
					this.setTheme(e.matches ? 'dark' : 'light', false);
				}
			});
		}
	}

	/**
	 * Resets to system preference
	 */
	public resetToSystemPreference(): void {
		try {
			localStorage.removeItem(this.THEME_KEY);
		} catch (error) {
			console.warn('Could not remove theme preference:', error);
		}

		const systemTheme = this.getSystemPreference();
		this.setTheme(systemTheme, false);
	}
}
