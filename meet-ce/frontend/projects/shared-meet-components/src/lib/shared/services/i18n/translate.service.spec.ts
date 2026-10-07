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
