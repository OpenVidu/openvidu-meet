import type { TranslateParams } from '../services/i18n/translate.service';

/**
 * What something needs to resolve copy: the translating half of `TranslateService`, so a function
 * that builds copy can be handed it without depending on the whole service, and stubbed with one
 * line in a test.
 */
export interface Translator {
	translate(key: string, params?: TranslateParams): string;
}
