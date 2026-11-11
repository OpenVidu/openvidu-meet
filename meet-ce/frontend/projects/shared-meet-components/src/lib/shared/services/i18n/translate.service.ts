import { effect, inject, Service, isDevMode, signal } from '@angular/core';
import { AvailableLangs, LangOption } from '../../models/lang.model';
import { DEFAULT_LANG, TRANSLATION_BUNDLES } from '../../models/translation-bundle.model';
import { LanguageService } from './language.service';

/**
 * Generic translation service shared by the whole application (meeting and console alike).
 *
 * The selected language is owned by the shared {@link LanguageService} — so every scope stays in
 * sync — while the strings come from the {@link TranslationBundle}s each domain registers via
 * `provideTranslations`. Every bundle's `default` locale is flattened once into a base lookup that
 * doubles as the per-key fallback and the first-paint seed; switching language layers that locale's
 * translations on top.
 *
 * Lookups are O(1): each locale is flattened to a dot-keyed `Map` on load, so {@link translate} —
 * which the impure translate pipe calls on every change-detection cycle — never splits keys or walks
 * a nested object.
 */
export type TranslateParams = Record<string, string | number>;

/** Where the app's language code is not a CLDR locale, which `Intl` needs to know the language's plural rules. */
const CLDR_LOCALES: Record<string, string> = { cn: 'zh', pt: 'pt-PT' };

/** `{count, plural, one {# item} other {# items}}` and `{position, selectordinal, one {#st} other {#th}}`. */
const VARIANT = /\{(\w+),\s*(plural|selectordinal),((?:\s*(?:=\d+|\w+)\s*\{[^{}]*\})+)\s*\}/g;
const VARIANT_CASE = /(=\d+|\w+)\s*\{([^{}]*)\}/g;

interface LanguageRules {
	plural: Intl.PluralRules;
	selectordinal: Intl.PluralRules;
	number: Intl.NumberFormat;
}

@Service()
export class TranslateService {
	private readonly languageService = inject(LanguageService);
	private readonly bundles = inject(TRANSLATION_BUNDLES, { optional: true }) ?? [];

	// Default locale flattened once: the permanent fallback layer and the synchronous first-paint seed.
	private readonly base = this.bundles.reduce(
		(map, bundle) => this.flatten(bundle.default, '', map),
		new Map<string, string>()
	);

	// Flattened lookup for the active language (base fallback + active locale on top). `translate` reads this.
	private active = this.base;
	private activeLang: AvailableLangs = DEFAULT_LANG;
	private readonly rulesByLang = new Map<AvailableLangs, LanguageRules>();

	/** Currently selected language option (shared across the whole application). */
	readonly selectedLanguageOption = this.languageService.selectedLanguage;

	// Bumped whenever a language finishes loading, so the translate pipe can refresh OnPush views
	// once the (asynchronously loaded) translations are actually in place.
	readonly translationsLoaded = signal(0);

	// Keys already warned about — the impure translate pipe calls translate() on EVERY change-detection
	// cycle, so a missing key must warn at most once (never per-tick) or it floods the console and can
	// lock up the zoneless web component (which change-detects continuously).
	private readonly warnedMissingKeys = new Set<string>();

	constructor() {
		// Keep the active lookup in sync with the shared selected language.
		effect(() => {
			const { lang } = this.languageService.selectedLanguage();
			this.load(lang).then(() => this.translationsLoaded.update((v) => v + 1));
		});
	}

	/** Selects a language by code (shared preference). */
	setCurrentLanguage(lang: AvailableLangs): void {
		this.languageService.setLanguage(lang);
	}

	/** Overrides the available language options. */
	updateLanguageOptions(options?: LangOption[]): void {
		this.languageService.setAvailableLanguages(options);
	}

	/** All available language options. */
	getAvailableLanguages(): LangOption[] {
		return this.languageService.availableLanguages();
	}

	/**
	 * Translates a dot-separated key into the current language (empty string if missing everywhere),
	 * filling `{name}` placeholders from `params`.
	 *
	 * A string can hold plural and ordinal variants, `{count, plural, one {# place} other {# places}}` and
	 * `{position, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}`: the variant picked is the
	 * one named after the CLDR category of the `params` number in the active language, an exact `=0`
	 * before it and `other`, which is required, after it, and `#` is that number formatted for the
	 * language. A variant's text holds no braces, so variants do not nest.
	 */
	translate(key: string, params?: TranslateParams): string {
		const translation = this.lookup(this.active, key);

		if (!params) return translation;

		return this.resolveVariants(translation, params).replace(
			/\{(\w+)\}/g,
			(placeholder, name) => `${params[name] ?? placeholder}`
		);
	}

	private resolveVariants(translation: string, params: TranslateParams): string {
		return translation.replace(VARIANT, (variant, name: string, kind: 'plural' | 'selectordinal', body: string) => {
			const count = Number(params[name] ?? NaN);

			if (Number.isNaN(count)) return variant;

			const cases = new Map(
				Array.from(body.matchAll(VARIANT_CASE), ([, selector, text]): [string, string] => [selector, text])
			);
			const rules = this.rules();
			const text = cases.get(`=${count}`) ?? cases.get(rules[kind].select(count)) ?? cases.get('other');

			return text === undefined ? variant : text.replaceAll('#', rules.number.format(count));
		});
	}

	private rules(): LanguageRules {
		let rules = this.rulesByLang.get(this.activeLang);

		if (!rules) {
			const locale = CLDR_LOCALES[this.activeLang] ?? this.activeLang;
			rules = {
				plural: new Intl.PluralRules(locale),
				selectordinal: new Intl.PluralRules(locale, { type: 'ordinal' }),
				number: new Intl.NumberFormat(locale)
			};
			this.rulesByLang.set(this.activeLang, rules);
		}

		return rules;
	}

	/**
	 * Resolves a key in the DEFAULT locale (English), independent of the selected language. The default
	 * locale is eagerly seeded into {@link base} at construction, so this is synchronous and always
	 * available regardless of which (lazily-loaded) language is active.
	 *
	 * Use it for language-independent values that must stay stable across UI locales — log lines,
	 * analytics, and programmatic API payloads such as the web component's host `error` event (whose
	 * consumers may string-match the message). Human-facing UI should use {@link translate} instead.
	 */
	translateDefault(key: string): string {
		return this.lookup(this.base, key);
	}

	/**
	 * Looks up a key in the given map, warning once if missing.
	 * @param map
	 * @param key
	 * @returns
	 */
	private lookup(map: Map<string, string>, key: string): string {
		const translation = map.get(key);

		if (translation === undefined) {
			if (isDevMode() && !this.warnedMissingKeys.has(key)) {
				this.warnedMissingKeys.add(key);
				console.warn(`[i18n] Missing translation key "${key}"`);
			}

			return '';
		}

		return translation;
	}

	/**
	 * Loads the given language across every bundle and rebuilds the active lookup. The default locale
	 * is the precomputed base (a pointer swap, no work); any other language is loaded from each
	 * bundle's loader and flattened over a copy of the base, so untranslated keys fall back to default.
	 */
	private async load(lang: AvailableLangs): Promise<void> {
		if (lang === DEFAULT_LANG) {
			this.active = this.base;
			this.activeLang = lang;
			return;
		}

		const parts = await Promise.all(
			this.bundles.map((bundle) => bundle.loaders?.[lang]?.().catch(() => ({})) ?? Promise.resolve({}))
		);
		this.active = parts.reduce<Map<string, string>>((map, part) => this.flatten(part, '', map), new Map(this.base));
		this.activeLang = lang;
	}

	/**
	 * Flattens a (possibly nested, possibly ESM-wrapped) translations module into `target`, keyed by
	 * dot-separated paths (`{ GROUP: { ITEM: 'x' } }` -> `'GROUP.ITEM' => 'x'`). Later writes win on
	 * collision, which is how bundles for the same locale merge and how the active locale overrides the
	 * default fallback.
	 */
	private flatten(source: unknown, prefix: string, target: Map<string, string>): Map<string, string> {
		const obj = (source as { default?: Record<string, any> })?.default ?? (source as Record<string, any>) ?? {};

		for (const key of Object.keys(obj)) {
			const value = obj[key];
			const path = prefix ? `${prefix}.${key}` : key;

			if (value && typeof value === 'object' && !Array.isArray(value)) {
				this.flatten(value, path, target);
			} else if (typeof value === 'string') {
				target.set(path, value);
			}
		}

		return target;
	}
}
