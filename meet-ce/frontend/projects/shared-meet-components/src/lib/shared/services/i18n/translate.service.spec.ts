import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslations } from '../../models/translation-bundle.model';
import { MeetStorageService } from '../storage.service';
import { LanguageService } from './language.service';
import { TranslateService } from './translate.service';

/**
 * Every string a participant reads goes through `translate`. The lookup is flattened once per
 * locale, which is what makes a key's dots meaningful, and the placeholders are filled here rather
 * than in the templates, so a broken interpolation reaches the user as `{name}`.
 */
describe('TranslateService', () => {
	const english = {
		PANEL: {
			CHAT: { TITLE: 'Chat', GREETING: 'Hello {name}, {count} messages' },
			PARTICIPANTS: { TITLE: 'Participants' }
		}
	};

	const spanish = { PANEL: { CHAT: { TITLE: 'Conversación' } } };

	let service: TranslateService;

	const createService = (): TranslateService => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				TranslateService,
				LanguageService,
				{ provide: MeetStorageService, useValue: { getLang: () => undefined, setLang: () => {} } },
				provideTranslations({ default: english, loaders: { es: async () => spanish } })
			]
		});

		return TestBed.inject(TranslateService);
	};

	beforeEach(() => {
		service = createService();
	});

	it('resolves a dot-separated key against the flattened bundle', () => {
		expect(service.translate('PANEL.CHAT.TITLE')).toBe('Chat');
		expect(service.translate('PANEL.PARTICIPANTS.TITLE')).toBe('Participants');
	});

	it('fills the placeholders from the params it is given', () => {
		expect(service.translate('PANEL.CHAT.GREETING', { name: 'Ana', count: 3 })).toBe('Hello Ana, 3 messages');
	});

	// A placeholder the caller says nothing about is left as it is rather than printed as
	// "undefined", which at least reads as a missing value instead of a wrong one.
	it('leaves a placeholder the caller did not fill', () => {
		expect(service.translate('PANEL.CHAT.GREETING', { name: 'Ana' })).toBe('Hello Ana, {count} messages');
	});

	it('answers an empty string for a key nothing translates', () => {
		expect(service.translate('PANEL.CHAT.MISSING')).toBe('');
		expect(service.translate('PANEL.CHAT.MISSING', { name: 'Ana' })).toBe('');
	});

	it('serves the selected language, falling back to the default for what it does not translate', async () => {
		service.setCurrentLanguage('es');
		// The locale is lazily loaded, so the switch lands a turn later.
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(service.translate('PANEL.CHAT.TITLE')).toBe('Conversación');
		expect(service.translate('PANEL.PARTICIPANTS.TITLE')).toBe('Participants');
	});

	// Log lines and the webcomponent's `error` event carry this one, so it must not follow the UI
	// language.
	it('keeps the default locale available whatever the selected language is', async () => {
		service.setCurrentLanguage('es');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(service.translateDefault('PANEL.CHAT.TITLE')).toBe('Chat');
	});
});

/**
 * Counted strings ("You're 2nd in line", "2 places left") keep the whole sentence in one translation
 * with its variants inside, and the language's own rules choose among them, so a translator writes
 * the categories their language has and the code never branches on a count.
 */
describe('TranslateService plurals and ordinals', () => {
	const english = {
		WAIT: {
			POSITION: "You're {position, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} in line",
			PLACES: '{count, plural, =0 {No places left} one {# place left} other {# places left}}',
			LAST: '{count, plural, =1 {Last place} one {# place} other {# places}}',
			ASKED: '{name} asked, {count, plural, one {# place left} other {# places left}}',
			SPACED: '{count,plural,one{# place}other{# places}}',
			NO_OTHER: '{count, plural, one {# place}}',
			PLAIN: 'Hello {name}, {braces}',
			// Says which of `one` and `other` the active language's rules chose, whatever the language writes.
			COUNT: '{count, plural, one {ONE} other {OTHER}}'
		}
	};
	const german = { WAIT: { PLACES: '{count, plural, one {# Platz} other {# Plätze}}' } };
	const french = {
		WAIT: { POSITION: 'Vous êtes {position, selectordinal, one {#er} other {#e}}' }
	};
	const russian = {
		WAIT: {
			PLACES: '{count, plural, one {# место} few {# места} many {# мест} other {# места}}',
			FALLBACK: '{count, plural, one {# место} other {# мест}}'
		}
	};

	let service: TranslateService;

	const switchTo = async (lang: string): Promise<void> => {
		service.setCurrentLanguage(lang);
		// The locale is lazily loaded, so the switch lands a turn later.
		await new Promise((resolve) => setTimeout(resolve, 0));
	};

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				TranslateService,
				LanguageService,
				{ provide: MeetStorageService, useValue: { getLang: () => undefined, setLang: () => {} } },
				provideTranslations({
					default: english,
					loaders: {
						de: async () => german,
						fr: async () => french,
						ru: async () => russian,
						cn: async () => ({}),
						pt: async () => ({})
					}
				})
			]
		});
		service = TestBed.inject(TranslateService);
		service.updateLanguageOptions([...service.getAvailableLanguages(), { name: 'Русский', lang: 'ru' }]);
	});

	it('picks the English ordinal one, two, few and other', () => {
		const position = (value: number) => service.translate('WAIT.POSITION', { position: value });

		expect(position(1)).toBe("You're 1st in line");
		expect(position(2)).toBe("You're 2nd in line");
		expect(position(3)).toBe("You're 3rd in line");
		expect(position(4)).toBe("You're 4th in line");
		expect(position(11)).toBe("You're 11th in line");
		expect(position(22)).toBe("You're 22nd in line");
	});

	it('picks the English plural one and other', () => {
		expect(service.translate('WAIT.PLACES', { count: 1 })).toBe('1 place left');
		expect(service.translate('WAIT.PLACES', { count: 2 })).toBe('2 places left');
	});

	it('prefers an exact =N match to the category of the number', () => {
		expect(service.translate('WAIT.PLACES', { count: 0 })).toBe('No places left');
		expect(service.translate('WAIT.LAST', { count: 1 })).toBe('Last place');
		expect(service.translate('WAIT.LAST', { count: 2 })).toBe('2 places');
	});

	it('writes the number the way the language does', async () => {
		expect(service.translate('WAIT.PLACES', { count: 12345 })).toBe('12,345 places left');

		await switchTo('de');

		expect(service.translate('WAIT.PLACES', { count: 12345 })).toBe('12.345 Plätze');
	});

	it('fills the other placeholders of the string around a variant', () => {
		expect(service.translate('WAIT.ASKED', { name: 'Ana', count: 1 })).toBe('Ana asked, 1 place left');
	});

	it('reads a variant written without spaces', () => {
		expect(service.translate('WAIT.SPACED', { count: 2 })).toBe('2 places');
	});

	it('leaves a string without variants as it always was', () => {
		expect(service.translate('WAIT.PLAIN', { name: 'Ana' })).toBe('Hello Ana, {braces}');
		expect(service.translate('WAIT.PLAIN')).toBe('Hello {name}, {braces}');
	});

	it('leaves a variant as written when it has no number or no case for it', () => {
		expect(service.translate('WAIT.PLACES')).toBe(english.WAIT.PLACES);
		expect(service.translate('WAIT.PLACES', { name: 'Ana' })).toBe(english.WAIT.PLACES);
		expect(service.translate('WAIT.PLACES', { count: 'many' })).toBe(english.WAIT.PLACES);
		expect(service.translate('WAIT.NO_OTHER', { count: 1 })).toBe('1 place');
		expect(service.translate('WAIT.NO_OTHER', { count: 2 })).toBe(english.WAIT.NO_OTHER);
	});

	it('picks the variants of the language in use after a switch', async () => {
		expect(service.translate('WAIT.POSITION', { position: 2 })).toBe("You're 2nd in line");

		await switchTo('fr');

		expect(service.translate('WAIT.POSITION', { position: 1 })).toBe('Vous êtes 1er');
		expect(service.translate('WAIT.POSITION', { position: 2 })).toBe('Vous êtes 2e');
	});

	it('picks among the categories of a language that has more than one and other', async () => {
		await switchTo('ru');
		const places = (value: number) => service.translate('WAIT.PLACES', { count: value });

		expect(places(1)).toBe('1 место');
		expect(places(2)).toBe('2 места');
		expect(places(5)).toBe('5 мест');
		expect(places(21)).toBe('21 место');
		expect(places(22)).toBe('22 места');
	});

	it('falls back to other for a category the string does not write', async () => {
		await switchTo('ru');

		expect(service.translate('WAIT.FALLBACK', { count: 2 })).toBe('2 мест');
	});

	it('maps the app language codes to their CLDR locale: cn to zh, pt to pt-PT', async () => {
		await switchTo('cn');
		expect(service.translate('WAIT.COUNT', { count: 1 })).toBe('OTHER');

		await switchTo('pt');
		expect(service.translate('WAIT.COUNT', { count: 0 })).toBe('OTHER');
		expect(service.translate('WAIT.COUNT', { count: 1 })).toBe('ONE');
	});
});

/**
 * The embedding application can ask for a language, or for the browser's. It outranks the
 * participant's stored preference without ever being written over it, and the participant can still
 * pick another one unless the application hides the selectors.
 */
describe('LanguageService', () => {
	let languageService: LanguageService;
	let storage: jasmine.SpyObj<MeetStorageService>;

	beforeEach(() => {
		storage = jasmine.createSpyObj<MeetStorageService>('MeetStorageService', ['getLang', 'setLang']);
		storage.getLang.and.returnValue('de');

		TestBed.configureTestingModule({
			providers: [provideZonelessChangeDetection(), { provide: MeetStorageService, useValue: storage }]
		});
		languageService = TestBed.inject(LanguageService);
	});

	it('starts from the stored preference', () => {
		expect(languageService.selectedLanguage().lang).toBe('de');
	});

	it('serves the requested language over the stored preference, without persisting it', () => {
		languageService.setEmbeddedLanguage('es');

		expect(languageService.selectedLanguage().lang).toBe('es');
		expect(storage.setLang).not.toHaveBeenCalled();
	});

	it('restores the stored preference once no language is requested', () => {
		languageService.setEmbeddedLanguage('es');
		languageService.setEmbeddedLanguage(undefined);

		expect(languageService.selectedLanguage().lang).toBe('de');
	});

	it('lets the participant pick another language over the requested one, and remembers that pick', () => {
		languageService.setEmbeddedLanguage('es');
		languageService.setLanguage('it');

		expect(languageService.selectedLanguage().lang).toBe('it');
		expect(storage.setLang).toHaveBeenCalledWith('it');
	});

	it('accepts any case and falls back from a region variant to its language', () => {
		const resolve = (tag: string) => {
			languageService.setEmbeddedLanguage(tag);
			return languageService.selectedLanguage().lang;
		};

		expect(resolve('ES')).toBe('es');
		expect(resolve('pt-BR')).toBe('pt');
		expect(resolve('ja_JP')).toBe('ja');
		expect(resolve('zh-CN')).toBe('cn');
		expect(resolve('zh-Hans')).toBe('cn');
	});

	it('ignores an unsupported language, leaving the stored preference', () => {
		spyOn(console, 'warn');

		languageService.setEmbeddedLanguage('xx');

		expect(languageService.selectedLanguage().lang).toBe('de');
		expect(console.warn).toHaveBeenCalled();
	});

	describe('auto', () => {
		const browserPrefers = (languages: string[], language = languages[0]) => {
			spyOnProperty(navigator, 'languages').and.returnValue(languages);
			spyOnProperty(navigator, 'language').and.returnValue(language);
		};

		it("serves the first of the browser's preferred languages that is available", () => {
			browserPrefers(['ko-KR', 'fr-CA', 'en-US']);

			languageService.setEmbeddedLanguage('auto');

			expect(languageService.selectedLanguage().lang).toBe('fr');
			expect(storage.setLang).not.toHaveBeenCalled();
		});

		it('falls back to English over the stored preference when none of them is available', () => {
			browserPrefers(['ko-KR', 'th']);

			languageService.setEmbeddedLanguage('AUTO');

			expect(languageService.selectedLanguage().lang).toBe('en');
		});

		it('reads the single browser language when the list is not available', () => {
			browserPrefers([], 'zh-TW');

			languageService.setEmbeddedLanguage('auto');

			expect(languageService.selectedLanguage().lang).toBe('cn');
		});
	});

	it('shows the selectors unless the embedding application turns them off', () => {
		expect(languageService.selectorVisible()).toBeTrue();

		languageService.setSelectorVisible(false);
		expect(languageService.selectorVisible()).toBeFalse();

		languageService.setSelectorVisible(true);
		expect(languageService.selectorVisible()).toBeTrue();
	});
});
