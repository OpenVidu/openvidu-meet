import { inject, Service, signal } from '@angular/core';
import { StorageService } from '../../../domains/meeting/openvidu-components/services/storage/storage.service';
import { AvailableLangs, LangOption } from '../../models/lang.model';

/**
 * Default set of languages shipped with the application, shared by every scope (meeting, console).
 * Hosts can override it per scope via {@link LanguageService.setAvailableLanguages}.
 */
export const DEFAULT_LANGUAGE_OPTIONS: LangOption[] = [
	{ name: 'English', lang: 'en' },
	{ name: 'Español', lang: 'es' },
	{ name: 'Deutsch', lang: 'de' },
	{ name: 'Français', lang: 'fr' },
	{ name: '中国', lang: 'cn' },
	{ name: 'हिन्दी', lang: 'hi' },
	{ name: 'Italiano', lang: 'it' },
	{ name: '日本語', lang: 'ja' },
	{ name: 'Dutch', lang: 'nl' },
	{ name: 'Português', lang: 'pt' }
];

/**
 * Single source of truth for the user's selected language across the whole application.
 *
 * The meeting and the console each render their own language selector, but both read and write this
 * one service, so the preference is shared: pick English in the console and the meeting starts in
 * English too (and vice versa). Each area keeps its own translation files — only the *selected
 * language* is shared, persisted under the existing storage key for backward compatibility.
 */
@Service()
export class LanguageService {
	private readonly storageService = inject(StorageService);

	/** Languages offered in the selectors. */
	readonly availableLanguages = signal<LangOption[]>(DEFAULT_LANGUAGE_OPTIONS);

	/** Currently selected language option. Scope translation stores react to this. */
	readonly selectedLanguage = signal<LangOption>(DEFAULT_LANGUAGE_OPTIONS[0]);

	constructor() {
		this.selectedLanguage.set(this.resolveStoredLanguage());
	}

	/**
	 * Selects a language by code, persisting it as the shared preference. No-op if the code does not
	 * match an available option (custom languages must be registered via {@link setAvailableLanguages}
	 * first).
	 */
	setLanguage(lang: AvailableLangs): void {
		const option = this.availableLanguages().find((o) => o.lang === lang);
		if (!option) return;

		this.selectedLanguage.set(option);
		this.storageService.setLang(lang);
	}

	/**
	 * Overrides the available languages (e.g. from the `langOptions` web-component input) and
	 * re-resolves the selected language against the new list.
	 */
	setAvailableLanguages(options?: LangOption[]): void {
		if (!options || options.length === 0) return;

		this.availableLanguages.set(options);
		this.selectedLanguage.set(this.resolveStoredLanguage());
	}

	/** Returns the stored language option, falling back to the first available one. */
	private resolveStoredLanguage(): LangOption {
		const storedLang = this.storageService.getLang();
		const options = this.availableLanguages();
		return options.find((o) => o.lang === storedLang) ?? options[0];
	}
}
