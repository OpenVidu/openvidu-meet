import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppDataService, ThemeService } from '@lib/services';
import packageInfo from '../../package.json';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	standalone: true,
	imports: [RouterOutlet]
})
export class AppComponent implements OnInit {
	constructor(
		private appDataService: AppDataService,
		private themeService: ThemeService
	) {}

	ngOnInit() {
		this.appDataService.setVersion(packageInfo.version);
	}
}
