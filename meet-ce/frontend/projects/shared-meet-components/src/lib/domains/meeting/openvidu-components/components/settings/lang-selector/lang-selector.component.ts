import { ChangeDetectionStrategy, Component, OnInit, effect, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AvailableLangs, LangOption } from '../../../models/lang.model';
import { StorageService } from '../../../services/storage/storage.service';
import { TranslateService } from '../../../services/translate/translate.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-lang-selector',
	imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
	templateUrl: './lang-selector.component.html',
	styleUrl: './lang-selector.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class LangSelectorComponent implements OnInit {
	/**
	 * @internal
	 */
	readonly compact = input(false);
	readonly onLangChanged = output<LangOption>();
	langSelected: LangOption = { name: 'English', lang: 'en' };
	languages: LangOption[] = [];
	private readonly translateService = inject(TranslateService);
	private readonly storageSrv = inject(StorageService);
	private readonly langSelectedEffect = effect(() => {
		const lang = this.translateService.selectedLanguageOption();
		this.langSelected = lang;
		this.onLangChanged.emit(lang);
	});

	ngOnInit(): void {
		this.languages = this.translateService.getAvailableLanguages();
	}

	onLangSelected(lang: AvailableLangs) {
		this.translateService.setCurrentLanguage(lang);
		this.storageSrv.setLang(lang);
	}

}
