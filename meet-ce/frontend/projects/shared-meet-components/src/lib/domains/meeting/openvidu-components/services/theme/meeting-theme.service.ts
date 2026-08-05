import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';
import {
	MEETING_DARK_THEME,
	MEETING_LIGHT_THEME,
	MeetingThemeMode,
	MeetingThemeVariables
} from '../../models/theme.model';
import { MeetStorageService } from '../../../../../shared/services/storage.service';

/**
 * Service for managing the meeting UI themes dynamically
 *
 * This service allows you to:
 * - Switch between the light and dark themes
 * - Apply custom theme variables
 * - Listen to theme changes
 * - Integrate with Angular Material themes
 *
 * @internal
 */
@Service()
export class MeetingThemeService {
	private readonly document = inject(DOCUMENT);
	private readonly storageService = inject(MeetStorageService);

	private readonly THEME_ATTRIBUTE = 'data-ov-theme';
	/**
	 * Signal that emits the current theme mode
	 */
	readonly currentTheme = signal<MeetingThemeMode>(MeetingThemeMode.Light);

	/**
	 * Signal that emits the current theme variables
	 */
	readonly currentVariables = signal<MeetingThemeVariables>({});

	constructor() {}

	// NOTE: there is intentionally no `initializeTheme()` here. Resolving the initial theme
	// (saved preference → system preference → light) is owned solely by Meet's `ThemeService.init()`,
	// registered as an app initializer in both the SPA and the webcomponent. A second resolver in
	// this service used to run later, from the meeting component's constructor, and overrode that
	// decision with its own fallback.

	getAllThemes(): MeetingThemeMode[] {
		return Object.values(MeetingThemeMode);
	}

	/**
	 * Gets the current theme mode
	 */
	getCurrentTheme(): MeetingThemeMode {
		return this.currentTheme();
	}

	/**
	 * Sets the theme mode to apply {@link MeetingThemeMode}
	 * @param theme The theme mode to apply
	 * @param persist Whether to persist the theme as the user's preference (default: true). A themed
	 *        room config applies a theme with `persist = false` so it does not overwrite the user's
	 *        app-wide preference.
	 */
	setTheme(theme: MeetingThemeMode, persist = true): void {
		this.applyTheme(theme);
		this.currentTheme.set(theme);

		if (persist) {
			this.storageService.setTheme(theme);
		}
	}

	/**
	 * Updates specific theme variables
	 * @param variables Object containing CSS variables to update
	 */
	updateThemeVariables(variables: MeetingThemeVariables): void {
		const mergedVariables = { ...this.currentVariables(), ...variables };
		this.currentVariables.set(mergedVariables);
		this.applyCSSVariables(variables);
	}

	/**
	 * Replaces all theme variables with a new set
	 * @param variables Complete set of theme variables
	 */
	setThemeVariables(variables: MeetingThemeVariables): void {
		this.currentVariables.set(variables);
		this.applyCSSVariables(variables);
	}

	/**
	 * Resets theme variables to default values based on current theme
	 */
	resetThemeVariables(): void {
		const currentTheme = this.getCurrentTheme();
		const defaultVariables = this.getDefaultVariablesForTheme(currentTheme);
		this.setThemeVariables(defaultVariables);
	}

	/**
	 * Toggles between light and dark themes
	 */
	toggleTheme(): void {
		const isDark = this.getCurrentTheme() === MeetingThemeMode.Dark;
		this.setTheme(isDark ? MeetingThemeMode.Light : MeetingThemeMode.Dark);
	}

	private applyTheme(theme: MeetingThemeMode): void {
		// Until a theme is applied, `:root:not([data-ov-theme])` in theme.scss follows the system
		// preference through media queries. From here on the attribute pins the choice explicitly.
		this.document.documentElement.setAttribute(this.THEME_ATTRIBUTE, theme);
		this.applyCSSVariables(this.getDefaultVariablesForTheme(theme));
	}

	private applyCSSVariables(variables: MeetingThemeVariables): void {
		const documentElement = this.document.documentElement;

		Object.entries(variables).forEach(([property, value]) => {
			if (value !== undefined) {
				documentElement.style.setProperty(property, value);
			}
		});
	}

	private getDefaultVariablesForTheme(theme: MeetingThemeMode): MeetingThemeVariables {
		return theme === MeetingThemeMode.Dark ? MEETING_DARK_THEME : MEETING_LIGHT_THEME;
	}
}
