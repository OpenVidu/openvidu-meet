import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import { CaptionsLangOption } from '../../models/caption.model';
// import { CaptionService } from '../../services/caption/caption.service';
import { AvailableLangs, LangOption } from '../../models/lang.model';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { StorageService } from '../../services/storage/storage.service';
import { TranslateService } from '../../services/translate/translate.service';

/**
 * The **livekitUrl** directive sets the livekitUrl to grant a participant access to a Room.
 * This Livekit Url will be use by each participant when connecting to a Room.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 *  Default: `""`
 *
 * @example
 * <ov-videoconference [livekitUrl]="http://localhost:1234"></ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[livekitUrl]',
	standalone: false
})
export class LivekitUrlDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly livekitUrl = input<string>('');

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly livekitUrlEffect = effect(() => {
		this.update(this.livekitUrl());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update('');
	}

	/**
	 * @ignore
	 */
	update(value: string) {
		this.libService.updateGeneralConfig({ livekitUrl: value });
	}
}

/**
 * The **token** directive sets the token to grant a participant access to a Room.
 * This OpenVidu token will be use by each participant when connecting to a Room.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 *  Default: `""`
 *
 * @example
 * <ov-videoconference [token]="token"></ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[token]',
	standalone: false
})
export class TokenDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly token = input<string>('');

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly tokenEffect = effect(() => {
		this.update(this.token());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update('');
	}

	/**
	 * @ignore
	 */
	update(value: string) {
		this.libService.updateGeneralConfig({ token: value });
	}
}

/**
 * The **tokenError** directive allows to display an error message in case of issues during token request.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 *  Default: `undefined`
 *
 * @example
 * <ov-videoconference [tokenError]="error"></ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[tokenError]',
	standalone: false
})
export class TokenErrorDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly tokenError = input<any>(undefined);

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly tokenErrorEffect = effect(() => {
		this.update(this.tokenError());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update(undefined);
	}

	/**
	 * @ignore
	 */
	update(value: any) {
		this.libService.updateGeneralConfig({ tokenError: value });
	}
}

/**
 * The **minimal** directive applies a minimal UI hiding all controls except for cam and mic.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 * Default: `false`
 *
 * @example
 * <ov-videoconference [minimal]="true"></ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[minimal]',
	standalone: false
})
export class MinimalDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly minimal = input<boolean>(false);

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly minimalEffect = effect(() => {
		this.update(this.minimal());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update(false);
	}

	/**
	 * @ignore
	 */
	update(value: boolean) {
		this.libService.updateGeneralConfig({ minimal: value });
	}
}

/**
 * The **lang** directive allows set the UI language to a default language.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 * **Default:** English `en`
 *
 * **Available Langs:**
 *
 * * English: `en`
 * * Spanish: `es`
 * * German: `de`
 * * French: `fr`
 * * Chinese: `cn`
 * * Hindi: `hi`
 * * Italian: `it`
 * * Japanese: `ja`
 * * Netherlands: `nl`
 * * Portuguese: `pt`
 *
 * @example
 * <ov-videoconference [lang]="'es'"></ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[lang]',
	standalone: false
})
export class LangDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly lang = input<AvailableLangs>('en');

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly translateService = inject(TranslateService);
	private readonly langEffect = effect(() => {
		this.update(this.lang());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update('en');
	}

	/**
	 * @ignore
	 */
	update(value: AvailableLangs) {
		this.translateService.setCurrentLanguage(value);
	}
}

/**
 * The **langOptions** directive allows to set the application language options.
 * It will override the application languages provided by default.
 * This propety is an array of objects which must comply with the {@link LangOption} interface.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 * Default: ```
 * [
 * 	{ name: 'English', lang: 'en' },
 *  { name: 'Español', lang: 'es' },
 *  { name: 'Deutsch', lang: 'de' },
 *  { name: 'Français', lang: 'fr' },
 *  { name: '中国', lang: 'cn' },
 *  { name: 'हिन्दी', lang: 'hi' },
 *  { name: 'Italiano', lang: 'it' },
 *  { name: 'やまと', lang: 'ja' },
 *  { name: 'Dutch', lang: 'nl' },
 *  { name: 'Português', lang: 'pt' }
 * ]```
 *
 * Note: If you want to add a new language, you must add a new object with the name and the language code (e.g. `{ name: 'Custom', lang: 'cus' }`)
 * and then add the language file in the `assets/lang` folder with the name `cus.json`.
 *
 *
 * @example
 * <ov-videoconference [langOptions]="[{name:'Spanish', lang: 'es'}]"></ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[langOptions]',
	standalone: false
})
export class LangOptionsDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly langOptions = input<LangOption[] | undefined>(undefined);

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly translateService = inject(TranslateService);
	private readonly langOptionsEffect = effect(() => {
		this.update(this.langOptions());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update(undefined);
	}

	/**
	 * @ignore
	 */
	update(value: LangOption[] | undefined) {
		this.translateService.updateLanguageOptions(value);
	}
}

/**
 * The **captionsLang** directive allows specify the deafult language that OpenVidu will try to recognise.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 * It must be a valid [BCP-47](https://tools.ietf.org/html/bcp47) language tag like "en-US" or "es-ES".
 *
 *
 * **Default:** English `en-US`
 *
 * **Available:**
 *
 * * English: `en-US`
 * * Spanish: `es-ES`
 * * German: `de-DE`
 * * French: `fr-FR`
 * * Chinese: `zh-CN`
 * * Hindi: `hi-IN`
 * * Italian: `it-IT`
 * * Japanese: `jp-JP`
 * * Portuguese: `pt-PT`
 *
 * @example
 * <ov-videoconference [captionsLang]="'es-ES'"></ov-videoconference>
 * TODO: Uncomment when captions are implemented
 */
// @Directive({
// 	selector: 'ov-videoconference[captionsLang]'
// })
// export class CaptionsLangDirective implements OnDestroy {
// 	/**
// 	 * @ignore
// 	 */
// 	@Input() set captionsLang(value: string) {
// 		this.update(value);
// 	}

// 	/**
// 	 * @ignore
// 	 */
// 	constructor(
// 		public elementRef: ElementRef,
// 		private captionService: CaptionService
// 	) {}

// 	/**
// 	 * @ignore
// 	 */
// 	ngOnDestroy(): void {
// 		this.clear();
// 	}

// 	/**
// 	 * @ignore
// 	 */
// 	clear() {
// 		this.update('en-US');
// 	}

// 	/**
// 	 * @ignore
// 	 */
// 	update(value: string) {
// 		this.captionService.setLanguage(value);
// 	}
// }

/**
 * The **captionsLangOptions** directive allows to set the language options for the captions.
 * It will override the languages provided by default.
 * This propety is an array of objects which must comply with the {@link CaptionsLangOption} interface.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 * Default: ```
 * [
 * 	{ name: 'English', lang: 'en-US' },
 * 	{ name: 'Español', lang: 'es-ES' },
 * 	{ name: 'Deutsch', lang: 'de-DE' },
 * 	{ name: 'Français', lang: 'fr-FR' },
 * 	{ name: '中国', lang: 'zh-CN' },
 * 	{ name: 'हिन्दी', lang: 'hi-IN' },
 * 	{ name: 'Italiano', lang: 'it-IT' },
 * 	{ name: '日本語', lang: 'jp-JP' },
 * 	{ name: 'Português', lang: 'pt-PT' }
 * ]```
 *
 * @example
 * <ov-videoconference [captionsLangOptions]="[{name:'Spanish', lang: 'es-ES'}]"></ov-videoconference>
 * TODO: Uncomment when captions are implemented
 */
// @Directive({
// 	selector: 'ov-videoconference[captionsLangOptions]'
// })
// export class CaptionsLangOptionsDirective implements OnDestroy {
// 	/**
// 	 * @ignore
// 	 */
// 	@Input() set captionsLangOptions(value: CaptionsLangOption[]) {
// 		this.update(value);
// 	}

// 	/**
// 	 * @ignore
// 	 */
// 	constructor(
// 		public elementRef: ElementRef,
// 		private captionService: CaptionService
// 	) {}

// 	/**
// 	 * @ignore
// 	 */
// 	ngOnDestroy(): void {
// 		this.clear();
// 	}

// 	/**
// 	 * @ignore
// 	 */
// 	clear() {
// 		this.update(undefined);
// 	}

// 	/**
// 	 * @ignore
// 	 */
// 	update(value: CaptionsLangOption[] | undefined) {
// 		this.captionService.setLanguageOptions(value);
// 	}
// }

/**
 * The **participantName** directive sets the participant name. It can be useful for aplications which doesn't need the prejoin page.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 * @example
 * <ov-videoconference [participantName]="'OpenVidu'"></ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[participantName]',
	standalone: false
})
export class ParticipantNameDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly participantName = input<string>('');

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly participantNameEffect = effect(() => {
		this.update(this.participantName());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update('');
	}

	/**
	 * @ignore
	 */
	update(participantName: string) {
		if (participantName) {
			this.libService.updateGeneralConfig({ participantName });
		}
	}
}

/**
 * The **prejoin** directive allows show/hide the prejoin page for selecting media devices.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 * Default: `true`
 *
 * @example
 * <ov-videoconference [prejoin]="false"></ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[prejoin]',
	standalone: false
})
export class PrejoinDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly prejoin = input<boolean>(true);

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly prejoinEffect = effect(() => {
		this.update(this.prejoin());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update(true);
	}

	/**
	 * @ignore
	 */
	update(value: boolean) {
		this.libService.updateGeneralConfig({ prejoin: value });
	}
}

/**
 * The **videoEnabled** directive allows to join the room with camera enabled or disabled.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 * Default: `true`
 *
 *
 * @example
 * <ov-videoconference [videoEnabled]="false"></ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[videoEnabled]',
	standalone: false
})
export class VideoEnabledDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly videoEnabled = input<boolean>(true);

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly storageService = inject(StorageService);
	private readonly videoEnabledEffect = effect(() => {
		this.update(this.videoEnabled());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update(true);
	}

	/**
	 * @ignore
	 */
	update(enabled: boolean) {
		const storageIsEnabled = this.storageService.isCameraEnabled();

		// Determine the final enabled state of the camera
		let finalEnabledState: boolean;
		if (enabled) {
			// If enabled is true, respect the storage value if it's false
			finalEnabledState = storageIsEnabled !== false;
		} else {
			// If enabled is false, disable the camera
			finalEnabledState = false;
		}

		// Update the storage with the final state
		this.storageService.setCameraEnabled(finalEnabledState);

		// Ensure libService state is consistent with the final enabled state
		if (this.libService.isVideoEnabled() !== finalEnabledState) {
			this.libService.updateStreamConfig({ videoEnabled: finalEnabledState });
		}
	}
}

/**
 * The **audioEnabled** directive allows to join the room with microphone enabled or disabled.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 * Default: `true`
 *
 * @example
 * <ov-videoconference [audioEnabled]="false"></ov-videoconference>
 */

@Directive({
	selector: 'ov-videoconference[audioEnabled]',
	standalone: false
})
export class AudioEnabledDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly audioEnabled = input<boolean>(true);

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly storageService = inject(StorageService);
	private readonly audioEnabledEffect = effect(() => {
		this.update(this.audioEnabled());
	});

	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update(true);
	}

	/**
	 * @ignore
	 */
	update(enabled: boolean) {
		const storageIsEnabled = this.storageService.isMicrophoneEnabled();

		// Determine the final enabled state of the microphone
		let finalEnabledState: boolean;
		if (enabled) {
			// If enabled is true, respect the storage value if it's false
			finalEnabledState = storageIsEnabled !== false;
		} else {
			// If enabled is false, disable the camera
			finalEnabledState = false;
		}

		// Update the storage with the final state
		this.storageService.setMicrophoneEnabled(finalEnabledState);

		if (this.libService.isAudioEnabled() !== enabled) {
			this.libService.updateStreamConfig({ audioEnabled: enabled });
		}
	}
}

/**
 * The **showDisconnectionDialog** directive allows to show/hide the disconnection dialog when the local participant is disconnected from the room.
 *
 * It is only available for {@link VideoconferenceComponent}.
 *
 * Default: `true`
 *
 * @example
 * <ov-videoconference [showDisconnectionDialog]="false"></ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[showDisconnectionDialog]',
	standalone: false
})
export class ShowDisconnectionDialogDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly showDisconnectionDialog = input<boolean>(true);

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly showDisconnectionDialogEffect = effect(() => {
		this.update(this.showDisconnectionDialog());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update(true);
	}

	/**
	 * @ignore
	 */
	update(value: boolean) {
		if (this.libService.getShowDisconnectionDialog() !== value) {
			this.libService.updateGeneralConfig({ showDisconnectionDialog: value });
		}
	}
}

/**
 * The **recordingStreamBaseUrl** directive sets the base URL for retrieving recording streams.
 * The complete request URL is dynamically constructed by concatenating the supplied URL, the
 * internally managed recordingId, and the `/media` segment.
 *
 * The final URL format will be:
 *
 *    {recordingStreamBaseUrl}/{recordingId}/media
 *
 * Default: `"call/api/recordings/{recordingId}/stream"`
 *
 * Example:
 * Given a recordingStreamBaseUrl of `api/recordings`, the resulting URL for a recordingId of `12345` would be:
 *   `api/recordings/12345/media`
 *
 * It is essential that the resulting route is declared and configured on your backend, as it is
 * used for serving and accessing the recording streams.
 *
 * @example
 * <ov-videoconference [recordingStreamBaseUrl]="'https://myserver.com/api/recordings'">
 * </ov-videoconference>
 */
@Directive({
	selector: 'ov-videoconference[recordingStreamBaseUrl]',
	standalone: false
})
export class RecordingStreamBaseUrlDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly recordingStreamBaseUrl = input<string>('');

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly recordingStreamBaseUrlEffect = effect(() => {
		this.update(this.recordingStreamBaseUrl());
	});

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		this.clear();
	}

	/**
	 * @ignore
	 */
	clear() {
		this.update('');
	}

	/**
	 * @ignore
	 */
	update(value: string) {
		if (value) this.libService.updateGeneralConfig({ recordingStreamBaseUrl: value });
	}
}
