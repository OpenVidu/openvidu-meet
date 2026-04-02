import { CommonModule } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ShareMeetingLinkComponent } from '../../components/share-meeting-link/share-meeting-link.component';
import { MeetingLobbyService } from '../../services/meeting-lobby.service';
import { MeetingService } from '../../services/meeting.service';

/**
 * Reusable component for the meeting lobby page.
 * Displays the form to join the meeting and optional recordings card.
 */
@Component({
	selector: 'ov-meeting-lobby',
	templateUrl: './meeting-lobby.component.html',
	styleUrls: ['./meeting-lobby.component.scss'],
	imports: [
		CommonModule,
		MatFormFieldModule,
		MatInputModule,
		FormsModule,
		ReactiveFormsModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		ShareMeetingLinkComponent
	]
})
export class MeetingLobbyComponent {
	private readonly captchaContainerRef = signal<ElementRef<HTMLDivElement> | undefined>(undefined);

	@ViewChild('captchaContainer')
	set captchaContainer(value: ElementRef<HTMLDivElement> | undefined) {
		this.captchaContainerRef.set(value);
	}

	private captchaWidgetId?: number;
	private captchaRendered = false;
	private static recaptchaScriptPromise?: Promise<void>;

	protected lobbyService = inject(MeetingLobbyService);
	protected meetingService = inject(MeetingService);

	protected roomName = computed(() => this.lobbyService.state().room?.roomName);
	protected meetingUrl = computed(() => this.lobbyService.meetingUrl());
	protected roomClosed = computed(() => this.lobbyService.state().roomClosed);
	protected showRecordingCard = computed(() => this.lobbyService.state().showRecordingCard);
	protected showShareLink = computed(() => {
		const state = this.lobbyService.state();
		const canModerate = this.lobbyService.canModerateRoom();
		return !!state.room && !state.roomClosed && canModerate;
	});
	protected showBackButton = computed(() => this.lobbyService.state().showBackButton);
	protected backButtonText = computed(() => this.lobbyService.state().backButtonText);
	protected isE2EEEnabled = computed(() => this.lobbyService.state().hasRoomE2EEEnabled);
	protected roomRequiresPasscode = computed(() => this.lobbyService.roomRequiresPasscode());
	protected roomPasscode = computed(() => this.lobbyService.roomPasscode());
	protected passcodeInfo = computed(() => {
		const passcode = this.roomPasscode();
		return passcode ? `Passcode: ${passcode}` : undefined;
	});
	protected guestCaptchaConfig = computed(() => this.lobbyService.guestCaptchaConfig());
	protected isGuestCaptchaEnabled = computed(() => this.lobbyService.guestCaptchaEnabled());
	protected captchaToken = computed(() => this.lobbyService.captchaToken());
	protected participantForm = computed(() => this.lobbyService.state().participantForm);
	/**
	 * Computed signal to determine if the E2EE key input should be shown.
	 * When E2EE key is provided via URL query param, the control is disabled and should not be displayed.
	 */
	protected showE2EEKeyInput = computed(() => {
		const form = this.lobbyService.state().participantForm;
		const e2eeKeyControl = form.get('e2eeKey');
		return this.isE2EEEnabled() && e2eeKeyControl?.enabled;
	});

	protected captchaMissing = computed(() => this.isGuestCaptchaEnabled() && !this.captchaToken());

	constructor() {
		effect(() => {
			const container = this.captchaContainerRef();
			console.debug('[captcha] effect triggered', {
				enabled: this.isGuestCaptchaEnabled(),
				hasContainer: !!container,
				hasToken: !!this.captchaToken(),
				config: this.guestCaptchaConfig()
			});
			if (this.isGuestCaptchaEnabled() && container) {
				void this.renderCaptchaIfNeeded();
			}
		});
	}

	async ngAfterViewInit(): Promise<void> {
		await this.renderCaptchaIfNeeded();
	}

	ngOnDestroy(): void {
		this.resetCaptcha();
	}

	async onFormSubmit(): Promise<void> {
		if (this.captchaMissing()) {
			return;
		}
		await this.lobbyService.submitAccess();
	}

	async onViewRecordingsClick(): Promise<void> {
		await this.lobbyService.goToRecordings();
	}

	async onBackClick(): Promise<void> {
		await this.lobbyService.goBack();
	}

	onCopyLinkClick(): void {
		this.lobbyService.copyMeetingSpeakerLink();
	}

	protected async onCaptchaResolved(token: string): Promise<void> {
		console.debug('[captcha] resolved token received', { hasToken: !!token, tokenLength: token?.length });
		this.lobbyService.setCaptchaToken(token);
	}

	protected onCaptchaExpiredOrError(): void {
		console.warn('[captcha] expired or error callback fired');
		this.lobbyService.setCaptchaToken(undefined);
	}

	private async renderCaptchaIfNeeded(): Promise<void> {
		const captchaContainer = this.captchaContainerRef();

		if (!this.isGuestCaptchaEnabled() || this.captchaRendered || !captchaContainer?.nativeElement) {
			console.debug('[captcha] skip render', {
				enabled: this.isGuestCaptchaEnabled(),
				alreadyRendered: this.captchaRendered,
				hasContainer: !!captchaContainer?.nativeElement
			});
			return;
		}

		const siteKey = this.guestCaptchaConfig()?.siteKey;
		if (!siteKey) {
			console.warn('[captcha] site key missing, cannot render widget');
			return;
		}

		console.debug('[captcha] attempting to render widget', { siteKeyPrefix: siteKey.slice(0, 8) });

		try {
			await this.loadRecaptchaScript();
		} catch (error) {
			console.warn('Failed to load reCAPTCHA script', error);
			return;
		}

		if (!window.grecaptcha?.render) {
			console.warn('[captcha] grecaptcha.render is unavailable after script load');
			return;
		}

		this.captchaWidgetId = window.grecaptcha.render(captchaContainer.nativeElement, {
			sitekey: siteKey,
			callback: (token: string) => void this.onCaptchaResolved(token),
			'expired-callback': () => this.onCaptchaExpiredOrError(),
			'error-callback': () => this.onCaptchaExpiredOrError()
		});

		this.captchaRendered = true;
		console.debug('[captcha] widget rendered', { widgetId: this.captchaWidgetId });
	}

	private resetCaptcha(): void {
		if (this.captchaWidgetId !== undefined && window.grecaptcha?.reset) {
			window.grecaptcha.reset(this.captchaWidgetId);
		}
		this.captchaRendered = false;
		this.captchaWidgetId = undefined;
		this.lobbyService.setCaptchaToken(undefined);
	}

	private loadRecaptchaScript(): Promise<void> {
		if (window.grecaptcha?.render) {
			console.debug('[captcha] script already loaded (grecaptcha available)');
			return Promise.resolve();
		}

		if (MeetingLobbyComponent.recaptchaScriptPromise) {
			console.debug('[captcha] reusing existing script loading promise');
			return MeetingLobbyComponent.recaptchaScriptPromise;
		}

		MeetingLobbyComponent.recaptchaScriptPromise = new Promise<void>((resolve, reject) => {
			const resolveWhenReady = () => {
				this.waitForGrecaptchaReady()
					.then(() => resolve())
					.catch((error) => reject(error));
			};

			const existing = document.getElementById('ov-recaptcha-script') as HTMLScriptElement | null;

			if (existing) {
				console.debug('[captcha] script tag already exists, waiting for load event');
				resolveWhenReady();
				existing.addEventListener('load', () => resolveWhenReady(), { once: true });
				existing.addEventListener('error', () => reject(new Error('Failed to load reCAPTCHA script')), {
					once: true
				});
				return;
			}

			const tryLoad = (src: string, scriptId: string, fallback?: () => void) => {
				console.debug('[captcha] loading script', { src, scriptId });
				const script = document.createElement('script');
				script.id = scriptId;
				script.src = src;
				script.async = true;
				script.defer = true;
				script.onload = () => {
					console.debug('[captcha] script loaded successfully', { src });
					resolveWhenReady();
				};
				script.onerror = () => {
					console.warn('[captcha] script load failed', { src });
					script.remove();
					if (fallback) {
						fallback();
					} else {
						reject(new Error('Failed to load reCAPTCHA script'));
					}
				};

				document.head.appendChild(script);
			};

			tryLoad('https://www.google.com/recaptcha/api.js?render=explicit', 'ov-recaptcha-script', () =>
				tryLoad('https://www.recaptcha.net/recaptcha/api.js?render=explicit', 'ov-recaptcha-script-fallback')
			);
		});

		return MeetingLobbyComponent.recaptchaScriptPromise;
	}

	private waitForGrecaptchaReady(maxAttempts = 20, delayMs = 150): Promise<void> {
		return new Promise((resolve, reject) => {
			let attempts = 0;

			const tick = () => {
				if (window.grecaptcha?.render) {
					console.debug('[captcha] grecaptcha ready');
					resolve();
					return;
				}

				attempts += 1;
				if (attempts >= maxAttempts) {
					reject(new Error('reCAPTCHA API loaded but grecaptcha is not available'));
					return;
				}

				setTimeout(tick, delayMs);
			};

			tick();
		});
	}
}

declare global {
	interface Window {
		grecaptcha?: {
			render: (container: HTMLElement, parameters: Record<string, unknown>) => number;
			reset: (widgetId?: number) => void;
		};
	}
}
