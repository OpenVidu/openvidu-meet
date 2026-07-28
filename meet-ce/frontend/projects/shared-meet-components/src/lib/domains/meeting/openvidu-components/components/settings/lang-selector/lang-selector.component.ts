import { Component, effect, inject, input, OnInit, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AvailableLangs, LangOption } from '../../../models/lang.model';
import { MeetingTranslateService } from '../../../services/translate/meeting-translate.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-lang-selector',
	imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
	templateUrl: './lang-selector.component.html',
	styleUrl: './lang-selector.component.scss'
})
export class LangSelectorComponent implements OnInit {
	/**
	 * @internal
	 */
	readonly compact = input(false);
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
