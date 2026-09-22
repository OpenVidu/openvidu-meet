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
