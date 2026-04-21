import { Injectable, signal } from '@angular/core';
import { LangOption } from '../../models/lang.model';

@Injectable({
	providedIn: 'root'
})
export class TranslateServiceMock {
	// Simulación de las opciones de lenguaje
	private languageOptions: LangOption[] = [
		{ name: 'English', lang: 'en' },
		{ name: 'Español', lang: 'es' }
	];

	private readonly selectedLanguageOptionWritable = signal<LangOption>(this.languageOptions[0]);
	private activeTranslations: Record<string, any> = { hello: 'Hello', goodbye: 'Goodbye' }; // Simulación de traducciones


	async setCurrentLanguage(lang: string): Promise<void> {
		const matchingOption = this.languageOptions.find((option) => option.lang === lang);
		if (matchingOption) {
			this.selectedLanguageOptionWritable.set(matchingOption);
		}
	}

	getSelectedLanguage(): LangOption {
		return this.selectedLanguageOptionWritable();
	}

	getAvailableLanguages(): LangOption[] {
		return this.languageOptions;
	}

	translate(key: string): string {
		// Retorna la traducción simulada
		return this.activeTranslations[key] || '';
	}
}
