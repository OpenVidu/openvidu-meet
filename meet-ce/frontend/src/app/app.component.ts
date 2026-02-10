import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppContextService } from '@openvidu-meet/shared-components';
import packageInfo from '../../package.json';

@Component({
	selector: 'app-root',
	template: ` <router-outlet></router-outlet> `,
	styles: '',
	imports: [RouterOutlet]
})
export class AppComponent implements OnInit {
	private readonly appCtxService = inject(AppContextService);

	ngOnInit() {
		this.appCtxService.setVersion(packageInfo.version);
	}
}
