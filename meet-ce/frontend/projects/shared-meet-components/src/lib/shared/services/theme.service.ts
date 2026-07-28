import { computed, DOCUMENT, inject, Service, signal } from '@angular/core';
import { MeetingThemeService, OpenViduThemeMode } from '../../domains/meeting/openvidu-components';
import { MeetStorageService } from './storage.service';

export type Theme = 'light' | 'dark';

@Service()
export class ThemeService {
	private document = inject(DOCUMENT);
	protected meetingThemeService = inject(MeetingThemeService);
	private readonly meetStorageService = inject(MeetStorageService);

	private readonly _currentTheme = signal<Theme>('light');

	// Computed signals for reactivity
	public readonly currentTheme = computed<Theme>(() => this._currentTheme());
	public readonly isDark = computed(() => this._currentTheme() === 'dark');
	public readonly isLight = computed(() => this._currentTheme() === 'light');

	/**
	 * Initializes the theme based on:
	 * 1. Saved preference in localStorage
	 * 2. System preference (prefers-color-scheme)
	 * 3. Light theme as default
	 */
	init(): void {
		// This is the single owner of initial-theme resolution: saved preference → system
		// preference → light. `MeetingThemeService` deliberately has no resolver of its own.
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
	 * @param saveToStorage Whether to persist the theme as the user's preference (default: true)
	 */
	private setTheme(theme: Theme, saveToStorage: boolean = true): void {
		this._currentTheme.set(theme);
		this.applyThemeToDocument(theme);
		// Persistence flows through the single owner (MeetStorageService) via the components chain:
		// one key, one format, one write path. When saveToStorage is false the theme is applied but
		// not remembered (e.g. following the system preference, or a themed room config).
		this.meetingThemeService.setTheme(theme as OpenViduThemeMode, saveToStorage);
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
	 * Gets the saved preference from the single theme owner (MeetStorageService)
	 */
	private getSavedTheme(): Theme | null {
		const saved = this.meetStorageService.getTheme();
		return saved === OpenViduThemeMode.Dark ? 'dark' : saved === OpenViduThemeMode.Light ? 'light' : null;
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
		this.meetStorageService.removeTheme();

		const systemTheme = this.getSystemPreference();
		this.setTheme(systemTheme, false);
	}
}
