import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppDataService } from '@openvidu-meet/shared-components';
import packageInfo from '../../package.json';

@Component({
	selector: 'app-root',
	template: ` <router-outlet></router-outlet> `,
	styles: '',
	imports: [RouterOutlet]
})
export class AppComponent implements OnInit {
	private readonly appDataService = inject(AppDataService);

	ngOnInit() {
		this.appDataService.setVersion(packageInfo.version);
	}
}
