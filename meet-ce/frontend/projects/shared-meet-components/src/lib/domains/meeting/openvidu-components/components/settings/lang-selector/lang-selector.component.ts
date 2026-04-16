import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AvailableLangs, LangOption } from '../../../models/lang.model';
import { AppMaterialModule } from '../../../openvidu-components-angular.material.module';
import { StorageService } from '../../../services/storage/storage.service';
import { TranslateService } from '../../../services/translate/translate.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-lang-selector',
	imports: [AppMaterialModule],
	templateUrl: './lang-selector.component.html',
	styleUrl: './lang-selector.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class LangSelectorComponent implements OnInit {
	/**
	 * @internal
	 */
	readonly compact = input(false);
	readonly onLangChanged = output<LangOption>();
	langSelected: LangOption = { name: 'English', lang: 'en' };
	languages: LangOption[] = [];
	private readonly destroyRef = inject(DestroyRef);
	private readonly translateService = inject(TranslateService);
	private readonly storageSrv = inject(StorageService);

	ngOnInit(): void {
		this.subscribeToLangSelected();
		this.languages = this.translateService.getAvailableLanguages();
	}

	onLangSelected(lang: AvailableLangs) {
		this.translateService.setCurrentLanguage(lang);
		this.storageSrv.setLang(lang);
	}

	subscribeToLangSelected() {
		this.translateService.selectedLanguageOption$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((lang) => {
			this.langSelected = lang;
			this.onLangChanged.emit(lang);
		});
	}
}
