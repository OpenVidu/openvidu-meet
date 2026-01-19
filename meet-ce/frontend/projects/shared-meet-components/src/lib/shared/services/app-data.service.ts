import { Injectable, WritableSignal, computed, signal } from '@angular/core';
import { ApplicationMode, Edition } from '../models';

@Injectable({
	providedIn: 'root'
})
export class AppDataService {
	private readonly _mode: WritableSignal<ApplicationMode> = signal(ApplicationMode.STANDALONE);
	private readonly _edition: WritableSignal<Edition> = signal(Edition.CE);
	private readonly _version: WritableSignal<string> = signal('');

	readonly mode = computed(() => this._mode());
	readonly edition = computed(() => this._edition());
	readonly version = computed(() => this._version());
	readonly isEmbeddedMode = computed(() => this._mode() === ApplicationMode.EMBEDDED);
	readonly isStandaloneMode = computed(() => this._mode() === ApplicationMode.STANDALONE);
	readonly appData = computed(() => ({
		mode: this._mode(),
		edition: this._edition(),
		version: this._version()
	}));

	constructor() {
		this.detectMode();
		console.log(`Starting application in ${this._mode()} mode`);
	}

	private detectMode() {
		const isRequestedFromIframe = window.self !== window.top;
		this._mode.set(isRequestedFromIframe ? ApplicationMode.EMBEDDED : ApplicationMode.STANDALONE);
	}

	setEdition(edition: Edition): void {
		this._edition.set(edition);
	}

	setVersion(version: string): void {
		this._version.set(version);
	}
}
