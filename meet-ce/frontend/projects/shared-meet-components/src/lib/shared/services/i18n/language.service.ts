import { inject, Service, signal } from '@angular/core';
import { AvailableLangs, LangOption } from '../../models/lang.model';
import { MeetStorageService } from '../storage.service';

/**
 * Default set of languages shipped with the application, shared by every scope (meeting, console).
 * Hosts can override it per scope via {@link LanguageService.setAvailableLanguages}.
 */
export const DEFAULT_LANGUAGE_OPTIONS: LangOption[] = [
	{ name: 'English', lang: 'en' },
	{ name: 'Español', lang: 'es' },
	{ name: 'Deutsch', lang: 'de' },
	{ name: 'Français', lang: 'fr' },
	{ name: '中文', lang: 'cn' },
	{ name: 'हिन्दी', lang: 'hi' },
	{ name: 'Italiano', lang: 'it' },
	{ name: '日本語', lang: 'ja' },
	{ name: 'Nederlands', lang: 'nl' },
	{ name: 'Português', lang: 'pt' }
];

const LANGUAGE_SUBTAG_ALIASES: Record<string, AvailableLangs> = { zh: 'cn' };

/**
 * Single source of truth for the user's selected language across the whole application.
 *
 * The meeting and the console each render their own language selector, but both read and write this
 * one service, so the preference is shared: pick English in the console and the meeting starts in
 * English too (and vice versa). Each area keeps its own translation files — only the *selected
 * language* is shared, persisted under the existing storage key for backward compatibility.
 *
 * An embedding application can ask for a language ({@link setEmbeddedLanguage}): it outranks the stored
 * preference without replacing it, and the participant can still pick another one.
 */
@Service()
export class LanguageService {
	private readonly storageService = inject(MeetStorageService);

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
		const option = this.findOption(lang);

		if (!option) return;

		this.selectedLanguage.set(option);
		this.storageService.setLang(option.lang);
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

	/**
	 * Selects the language asked by the embedding application, a BCP 47 tag, without persisting it, or
	 * restores the stored preference when `tag` is undefined. An unavailable language is ignored.
	 */
	setEmbeddedLanguage(tag?: string): void {
		const option = this.findOption(tag);

		if (tag && !option) {
			console.warn(`[OpenVidu Meet] Unsupported language "${tag}" ignored.`);
		}

		this.selectedLanguage.set(option ?? this.resolveStoredLanguage());
	}

	/** Matches a BCP 47 tag (`es`, `pt-BR`, `zh_Hans`) by its exact code first, then by its language subtag. */
	private findOption(tag?: string | null): LangOption | undefined {
		if (!tag) return undefined;

		const normalized = tag.toLowerCase().replace('_', '-');
		const subtag = normalized.split('-')[0];
		const byCode = (code: string) => this.availableLanguages().find((o) => o.lang.toLowerCase() === code);
		return byCode(normalized) ?? byCode(LANGUAGE_SUBTAG_ALIASES[subtag] ?? subtag);
	}

	private resolveStoredLanguage(): LangOption {
		return this.findOption(this.storageService.getLang()) ?? this.availableLanguages()[0];
	}
}
