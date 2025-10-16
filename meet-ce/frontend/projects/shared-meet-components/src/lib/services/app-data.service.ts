import { Injectable } from '@angular/core';
import { AppData, ApplicationMode, Edition } from '@openvidu-meet/shared/models';
import { WebComponentManagerService } from '@openvidu-meet/shared/services';

@Injectable({
	providedIn: 'root'
})
export class AppDataService {
	protected appData: AppData = {
		mode: ApplicationMode.STANDALONE,
		edition: Edition.CE,
		version: ''
	};

	constructor(protected wcManagerService: WebComponentManagerService) {
		this.setApplicationMode();
	}

	private setApplicationMode(): void {
		const isRequestedFromIframe = window.self !== window.top;
		const appMode = isRequestedFromIframe ? ApplicationMode.EMBEDDED : ApplicationMode.STANDALONE;
		this.appData.mode = appMode;
		console.log(`Starting application in ${appMode} mode`);

		if (this.isEmbeddedMode()) {
			// Initialize the WebComponentManagerService only in embedded mode
			this.wcManagerService.initialize();
		}
	}

	isEmbeddedMode(): boolean {
		return this.appData.mode === ApplicationMode.EMBEDDED;
	}

	isStandaloneMode(): boolean {
		return this.appData.mode === ApplicationMode.STANDALONE;
	}

	getEdition(): Edition {
		return this.appData.edition;
	}

	setVersion(version: string): void {
		this.appData.version = version;
	}

	getVersion(): string {
		return this.appData.version;
	}
}
