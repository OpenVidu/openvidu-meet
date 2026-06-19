import type { OnInit } from '@angular/core';
import { Component, inject } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppContextService, MeetingIframeBridgeService } from '@openvidu-meet/shared-components';
import packageInfo from '../../package.json';

@Component({
	selector: 'app-root',
	template: ` <router-outlet /> `,
	styles: '',
	imports: [RouterOutlet],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit {
	private readonly appCtxService = inject(AppContextService);
	private readonly iframeBridge = inject(MeetingIframeBridgeService);

	ngOnInit() {
		this.appCtxService.setVersion(packageInfo.version);
		// Starts the postMessage bridge when embedded in an iframe; no-op otherwise.
		this.iframeBridge.initialize();
	}
}
