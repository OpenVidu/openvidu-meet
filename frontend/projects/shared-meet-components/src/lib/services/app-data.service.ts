import { Injectable } from '@angular/core';
import { AppData, ApplicationMode, Edition } from '@lib/models';

@Injectable({
	providedIn: 'root'
})
export class AppDataService {
	protected appData: AppData = {
		mode: ApplicationMode.STANDALONE,
		edition: Edition.CE,
		version: ''
	};

	setApplicationMode(mode: ApplicationMode): void {
		console.log(`Starting application in ${mode} mode`);
		this.appData.mode = mode;
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
