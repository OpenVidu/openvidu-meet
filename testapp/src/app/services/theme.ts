import { effect, Injectable, signal } from '@angular/core';

/** Colour theme of the testapp shell. Independent of the theme the embedded app runs. */
export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'testappTheme';

const storedTheme = (): Theme | null => {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === 'dark' || stored === 'light' ? stored : null;
	} catch {
		return null;
	}
};

const preferredTheme = (): Theme => (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

/**
 * Owns the shell's theme: resolves it once from storage or the OS preference and
 * publishes it as `data-theme` on `<html>`, which is what the token blocks in
 * `styles.css` key off.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
	private readonly _theme = signal<Theme>(storedTheme() ?? preferredTheme());

	readonly theme = this._theme.asReadonly();

	constructor() {
		effect(() => {
			const theme = this._theme();
			document.documentElement.dataset['theme'] = theme;

			try {
				localStorage.setItem(STORAGE_KEY, theme);
			} catch {
				// Private browsing or a blocked storage partition: the theme still applies for this session.
			}
		});
	}

	toggle(): void {
		this._theme.update((theme) => (theme === 'dark' ? 'light' : 'dark'));
	}
}
