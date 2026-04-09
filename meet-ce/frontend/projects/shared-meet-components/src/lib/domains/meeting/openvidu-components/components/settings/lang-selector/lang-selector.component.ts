import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu';
import { MatSelect } from '@angular/material/select';
import { Subscription } from 'rxjs';
import { AvailableLangs, LangOption } from '../../../models/lang.model';
import { StorageService } from '../../../services/storage/storage.service';
import { TranslateService } from '../../../services/translate/translate.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-lang-selector',
	templateUrl: './lang-selector.component.html',
	styleUrls: ['./lang-selector.component.scss'],
	standalone: false
})
export class LangSelectorComponent implements OnInit, OnDestroy {
	/**
	 * @internal
	 */
	@Input() compact: boolean = false;
	@Output() onLangChanged: EventEmitter<LangOption> = new EventEmitter<LangOption>();
	langSelected: LangOption = { name: 'English', lang: 'en' };
	languages: LangOption[] = [];

	/**
	 * @ignore
	 */
	@ViewChild(MatMenuTrigger) public menuTrigger: MatMenuTrigger | undefined = undefined;

	/**
	 * @ignore
	 */
	@ViewChild(MatSelect) matSelect: MatSelect | undefined = undefined;

	private langSub: Subscription = new Subscription();

	constructor(
		private translateService: TranslateService,
		private storageSrv: StorageService
	) {}

	ngOnInit(): void {
		this.subscribeToLangSelected();
		this.languages = this.translateService.getAvailableLanguages();
	}

	ngOnDestroy(): void {
		this.langSub?.unsubscribe();
	}

	onLangSelected(lang: AvailableLangs) {
		this.translateService.setCurrentLanguage(lang);
		this.storageSrv.setLang(lang);
	}

	subscribeToLangSelected() {
		this.langSub = this.translateService.selectedLanguageOption$.subscribe((lang) => {
			this.langSelected = lang;
			this.onLangChanged.emit(lang);
		});
	}
}
