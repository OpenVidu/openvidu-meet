import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import {
	OPENVIDU_COMPONENTS_DARK_THEME,
	OPENVIDU_COMPONENTS_LIGHT_THEME,
	OpenViduThemeMode,
	OpenViduThemeVariables
} from '../../models/theme.model';
import { StorageService } from '../storage/storage.service';

/**
 * Service for managing OpenVidu component themes dynamically
 *
 * This service allows you to:
 * - Switch between light, dark and classic themes
 * - Apply custom theme variables
 * - Listen to theme changes
 * - Integrate with Angular Material themes
 *
 * @internal
 */
@Injectable({
	providedIn: 'root'
})
export class OpenViduThemeService {
	private readonly document = inject(DOCUMENT);
	private readonly storageService = inject(StorageService);

	private readonly THEME_ATTRIBUTE = 'data-ov-theme';
	/**
	 * Signal that emits the current theme mode
	 */
	readonly currentTheme = signal<OpenViduThemeMode>(OpenViduThemeMode.Classic);

	/**
	 * Signal that emits the current theme variables
	 */
	readonly currentVariables = signal<OpenViduThemeVariables>({});

	constructor() {}

	initializeTheme(): void {
		const savedTheme = this.storageService.getTheme();
		const initialTheme = savedTheme || OpenViduThemeMode.Classic;
		this.applyTheme(initialTheme);
		this.currentTheme.set(initialTheme);
	}

	getAllThemes(): OpenViduThemeMode[] {
		return Object.values(OpenViduThemeMode);
	}

	/**
	 * Gets the current theme mode
	 */
	getCurrentTheme(): OpenViduThemeMode {
		return this.currentTheme();
	}

	/**
	 * Gets the current theme variables
	 */
	getCurrentVariables(): OpenViduThemeVariables {
		return this.currentVariables();
	}

	/**
	 * Sets the theme mode to apply {@link OpenViduThemeMode}
	 * @param theme The theme mode to apply
	 */
	setTheme(theme: OpenViduThemeMode): void {
		this.applyTheme(theme);
		this.currentTheme.set(theme);
		this.storageService.setTheme(theme);
	}

	/**
	 * Updates specific theme variables
	 * @param variables Object containing CSS variables to update
	 */
	updateThemeVariables(variables: OpenViduThemeVariables): void {
		const mergedVariables = { ...this.currentVariables(), ...variables };
		this.currentVariables.set(mergedVariables);
		this.applyCSSVariables(variables);
	}

	/**
	 * Replaces all theme variables with a new set
	 * @param variables Complete set of theme variables
	 */
	setThemeVariables(variables: OpenViduThemeVariables): void {
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
	 * Applies a predefined theme configuration
	 * @param themeVariables Predefined theme configuration (e.g., OPENVIDU_LIGHT_THEME)
	 */
	applyThemeConfiguration(themeVariables: OpenViduThemeVariables): void {
		this.setThemeVariables(themeVariables);
	}

	/**
	 * Toggles between light and dark themes
	 */
	toggleTheme(): void {
		const currentTheme = this.getCurrentTheme();
		if (currentTheme === OpenViduThemeMode.Light) {
			this.setTheme(OpenViduThemeMode.Dark);
		} else if (currentTheme === OpenViduThemeMode.Dark) {
			this.setTheme(OpenViduThemeMode.Light);
		} else {
			// If auto, switch to opposite of system preference
			const prefersDark = this.prefersDarkMode();
			this.setTheme(prefersDark ? OpenViduThemeMode.Light : OpenViduThemeMode.Dark);
		}
	}

	/**
	 * Gets a specific CSS variable value
	 * @param variableName The CSS variable name (with or without --)
	 */
	getThemeVariable(variableName: string): string {
		const varName = variableName.startsWith('--') ? variableName : `--${variableName}`;
		return getComputedStyle(this.document.documentElement).getPropertyValue(varName).trim();
	}

	/**
	 * Checks if the system prefers dark mode
	 */
	prefersDarkMode(): boolean {
		return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
	}

	private applyTheme(theme: OpenViduThemeMode): void {
		const documentElement = this.document.documentElement;
		const currentTheme = this.getCurrentTheme();
		if (theme === OpenViduThemeMode.Classic) {
			documentElement.removeAttribute(this.THEME_ATTRIBUTE);
			const currentVariables = this.getDefaultVariablesForTheme(currentTheme);
			this.removeCSSVariables(currentVariables);
		} else {
			documentElement.setAttribute(this.THEME_ATTRIBUTE, theme);
		}

		// Apply default variables for the theme
		const defaultVariables = this.getDefaultVariablesForTheme(theme);
		this.applyCSSVariables(defaultVariables);
	}

	private applyCSSVariables(variables: OpenViduThemeVariables): void {
		const documentElement = this.document.documentElement;

		Object.entries(variables).forEach(([property, value]) => {
			if (value !== undefined) {
				documentElement.style.setProperty(property, value);
			}
		});
	}

	private removeCSSVariables(variables: OpenViduThemeVariables): void {
		const documentElement = this.document.documentElement;

		Object.keys(variables).forEach((property) => {
			documentElement.style.removeProperty(property);
		});
	}

	private getDefaultVariablesForTheme(theme: OpenViduThemeMode): OpenViduThemeVariables {
		switch (theme) {
			case OpenViduThemeMode.Light:
				return OPENVIDU_COMPONENTS_LIGHT_THEME;
			case OpenViduThemeMode.Dark:
				return OPENVIDU_COMPONENTS_DARK_THEME;
			default:
				return {};
		}
	}
}
