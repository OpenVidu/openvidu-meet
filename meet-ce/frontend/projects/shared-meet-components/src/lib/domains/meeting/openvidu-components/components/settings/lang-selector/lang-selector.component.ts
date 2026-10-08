import { Component, effect, inject, input, OnInit, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AvailableLangs, LangOption } from '../../../models/lang.model';
import { MeetingTranslateService } from '../../../services/translate/meeting-translate.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-lang-selector',
	imports: [MatButtonModule, MatIconModule, MatMenuModule],
	templateUrl: './lang-selector.component.html',
	styleUrl: './lang-selector.component.scss',
	host: { '[class.field]': "variant() === 'field'" }
})
export class LangSelectorComponent implements OnInit {
	/** `button` is the prejoin's language button; `field` fills the width of a settings form. */
	readonly variant = input<'button' | 'field'>('button');
	readonly onLangChanged = output<LangOption>();
	languages: LangOption[] = [];
	private readonly translateService = inject(MeetingTranslateService);
	/** Mirrors the shared selected-language signal so the label updates under OnPush. */
	readonly langSelected = this.translateService.selectedLanguageOption;
	private readonly langSelectedEffect = effect(() => {
		this.onLangChanged.emit(this.langSelected());
	});

	ngOnInit(): void {
		this.languages = this.translateService.getAvailableLanguages();
	}

	onLangSelected(lang: AvailableLangs) {
		// `setCurrentLanguage` persists the choice through the shared language service.
		this.translateService.setCurrentLanguage(lang);
	}
}
