import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { LanguageService } from '../services/i18n/language.service';
import { extractParams } from '../utils/url.utils';

/**
 * Applies the `language` and `show-language-selector` the URL of an iframe or a direct link asks for.
 * Only a URL that carries them changes anything, so the app's own navigations, which never do, keep
 * what the page was opened with.
 */
export const applyRequestedLanguageGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const languageService = inject(LanguageService);
	const { language, showLanguageSelector } = extractParams(route);

	if (language) {
		languageService.setEmbeddedLanguage(language);
	}

	if (showLanguageSelector !== undefined) {
		languageService.setSelectorVisible(showLanguageSelector !== 'false');
	}

	return true;
};
