import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AvailableLangs } from '../../models/lang.model';
import { LanguageService } from '../../services/i18n/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

/**
 * Language selector for the console. Renders its own UI but drives the shared {@link LanguageService},
 * so changing the language here also affects the meeting (and vice versa).
 */
@Component({
	selector: 'ov-language-selector',
	imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, TranslatePipe],
	templateUrl: './language-selector.component.html',
	styleUrl: './language-selector.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class LanguageSelectorComponent {
	private readonly languageService = inject(LanguageService);

	readonly selectedLanguage = this.languageService.selectedLanguage;
	readonly languages = this.languageService.availableLanguages;

	onLangSelected(lang: AvailableLangs): void {
		this.languageService.setLanguage(lang);
	}
}
