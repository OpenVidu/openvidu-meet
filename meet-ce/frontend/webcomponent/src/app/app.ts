import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	input,
	output,
	ViewEncapsulation
} from '@angular/core';
import {
	AppCeMeetingComponent,
	ChangePasswordRequiredComponent,
	computeServerUrl,
	EmbeddedCommandService,
	EmbeddedEventBusService,
	EndMeetingComponent,
	ErrorComponent,
	LoginComponent,
	MeetingContextService,
	NavigationErrorReason,
	RoomRecordingsComponent,
	RuntimeConfigService,
	ThemeService,
	ViewRecordingComponent,
	wcRouteFromAttributes,
	wcRouteIdentity,
	WcRouteName,
	WcRouterService
} from '@openvidu-meet/shared-components';
import {
	EmbeddedEventName,
	EmbeddedEventPayloadFor,
	LeftEventReason,
	type EmbeddedEvent,
	type WebComponentPropertyValues
} from '@openvidu-meet/typings';
import { ShadowOverlayContainer } from './shadow-dom/overlay-container.service';
import { ShadowStylesService } from './shadow-dom/styles.service';

/**
 * Root component of the OpenVidu Meet web component. It maps host attributes/properties to a
 * {@link WcRoute}, drives the {@link WcRouterService} (which runs that route's guard and may
 * redirect), renders the route's component inside a shadow root, and bridges host events both ways.
 */
@Component({
	selector: 'app-root',
	imports: [
		AppCeMeetingComponent,
		ChangePasswordRequiredComponent,
		EndMeetingComponent,
		ErrorComponent,
		LoginComponent,
		RoomRecordingsComponent,
		ViewRecordingComponent
	],
	templateUrl: './app.html',
	styleUrls: ['./app.material.scss', './app.css'],
	encapsulation: ViewEncapsulation.ShadowDom,
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [ShadowStylesService],
	host: {
		'[attr.role]': '"application"',
		'[attr.aria-label]': '"OpenVidu Meet"',
		// :host([data-theme='dark']) in app.material.scss cannot read document[data-theme] across the shadow boundary.
		'[attr.data-theme]': 'themeService.isDark() ? "dark" : null'
	}
})
export class App {
	// ── Injected dependencies ────────────────────────────────────────────────
	protected readonly themeService = inject(ThemeService);
	protected readonly router = inject(WcRouterService);
	private readonly commandService = inject(EmbeddedCommandService);
	private readonly eventBus = inject(EmbeddedEventBusService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);
	private readonly meetingContext = inject(MeetingContextService);
	private readonly _elRef = inject(ElementRef);
	private readonly _destroyRef = inject(DestroyRef);
	private readonly _shadowStyles = inject(ShadowStylesService);
	private readonly _shadowOverlay = inject(ShadowOverlayContainer);

	// ── Host inputs (element attributes/properties) ──────────────────────────
	readonly roomUrl = input<string | undefined>(undefined);
	readonly recordingUrl = input<string | undefined>(undefined);
	readonly participantName = input<string | undefined>(undefined);
	readonly e2eeKey = input<string | undefined>(undefined);
	readonly leaveRedirectUrl = input<string | undefined>(undefined);
	readonly showOnlyRecordings = input<boolean>(false);
	readonly showRecording = input<string | undefined>(undefined);

	// ── Host outputs (element events) ────────────────────────────────────────
	readonly joined = output<EmbeddedEventPayloadFor<EmbeddedEventName.JOINED>>();
	readonly left = output<EmbeddedEventPayloadFor<EmbeddedEventName.LEFT>>();
	readonly closed = output<void>();

	// ── Internal state ───────────────────────────────────────────────────────
	// Identity of the last attribute-derived route navigated to, so a non-identity attribute change
	// (e.g. participant-name) doesn't re-navigate and yank the user off an interrupt view.
	private lastHomeIdentity: string | null = null;

	// ── Derived state ────────────────────────────────────────────────────────
	private readonly inputs = computed<WebComponentPropertyValues>(() => ({
		roomUrl: this.roomUrl(),
		recordingUrl: this.recordingUrl(),
		participantName: this.participantName(),
		e2eeKey: this.e2eeKey(),
		leaveRedirectUrl: this.leaveRedirectUrl(),
		showOnlyRecordings: this.showOnlyRecordings(),
		showRecording: this.showRecording()
	}));

	// Per-view inputs, narrowed from the current route. Empty/undefined when the route doesn't carry them.
	protected readonly recordingId = computed<string>(() => {
		const r = this.router.currentRoute();
		return r?.name === WcRouteName.SINGLE_RECORDING ? r.params.recordingId : '';
	});

	protected readonly recordingSecret = computed<string>(() => {
		const r = this.router.currentRoute();
		return r?.name === WcRouteName.SINGLE_RECORDING ? (r.params.recordingSecret ?? '') : '';
	});

	protected readonly roomId = computed<string>(() => {
		const r = this.router.currentRoute();
		return r?.name === WcRouteName.ROOM_RECORDINGS ? r.params.roomId : '';
	});

	protected readonly redirectTo = computed<string>(() => {
		const r = this.router.currentRoute();
		return r?.name === WcRouteName.LOGIN || r?.name === WcRouteName.CHANGE_PASSWORD
			? (r.params.redirectTo ?? '')
			: '';
	});

	protected readonly disconnectedReason = computed<LeftEventReason | undefined>(() => {
		const r = this.router.currentRoute();
		return r?.name === WcRouteName.DISCONNECTED ? r.params.reason : undefined;
	});

	// Reason passed to `<ov-error>`. INVALID (bad/absent embed config) renders the general
	// embedded-error copy; the specific cause is logged to the console for the integrator.
	protected readonly errorReason = computed<NavigationErrorReason | null>(() => {
		const r = this.router.currentRoute();

		if (r?.name === WcRouteName.ERROR) return r.params.reason;

		if (r?.name === WcRouteName.INVALID) return NavigationErrorReason.EMBEDDED_ERROR;

		return null;
	});

	constructor() {
		// ── Reactive wiring ──
		// Effect creation order is significant: the server base URL must be set (first effect) before
		// the navigate effect runs, because the route guards call the API.

		// Publish the server base URL derived from the room/recording URL attributes.
		effect(() => {
			const roomUrl = this.roomUrl();
			const recordingUrl = this.recordingUrl();

			if (!roomUrl && !recordingUrl) {
				console.warn(
					'[OpenVidu Meet] Neither room-url nor recording-url attributes are set. The web component will not work.'
				);
				return;
			}

			// Compute the server base URL from the room/recording URL, and set it in the runtime config.
			// The guards will use this base URL to call the API.
			const serverUrl = roomUrl
				? computeServerUrl(roomUrl, '/room/')
				: computeServerUrl(recordingUrl!, '/recording/');

			if (serverUrl) {
				this.runtimeConfigService.setServerBaseUrl(serverUrl);
			}
		});

		// Navigate the mini-router to the attribute-derived route. Registered AFTER the server-base-URL
		// effect so the base URL is set before the guard's first API call. Re-navigates only when the
		// route-determining identity changes: an interrupt view (login, recordings…) is driven by
		// NavigationService → router.navigate and leaves `lastHomeIdentity` untouched, so an unrelated
		// attribute recompute won't stomp it; only a genuine room/recording change re-navigates.
		effect(() => {
			const route = wcRouteFromAttributes(this.inputs());
			const identity = wcRouteIdentity(route);

			if (identity === this.lastHomeIdentity) return;

			this.lastHomeIdentity = identity;

			// Surface the specific misconfiguration cause to the integrator via the console;
			// the in-shell `<ov-error>` shows the general embedded-error copy.
			if (route.name === WcRouteName.INVALID) {
				console.warn(`[OpenVidu Meet] ${route.params.message}`);
			}

			this.router.setHomeRoute(route);
			void this.router.navigate(route);
		});

		// Drain and process every queued host event in order (queue → no same-tick loss).
		effect(() => {
			if (this.eventBus.events().length === 0) return;

			for (const event of this.eventBus.drain()) {
				this.handleWebComponentEvent(event);
			}
		});

		// ── Shadow DOM setup ──
		// enableWebcomponentMode() is called in main.wc.ts before element registration, so injected
		// services observe WC mode during their constructor-time effects.
		afterNextRender(() => {
			const { shadowRoot } = this._elRef.nativeElement as HTMLElement;

			if (shadowRoot) {
				this._shadowStyles.reflect(shadowRoot, this._destroyRef);
				this._shadowOverlay.setShadowRoot(shadowRoot);
			}
		});

		// Restore WC state when the custom element is removed from the DOM.
		this._destroyRef.onDestroy(() => this.meetingContext.clearMeetingContext());
	}

	// ── Imperative host API ──────────────────────────────────────────────────
	endMeeting(): Promise<void> {
		return this.commandService.endMeeting();
	}

	leaveRoom(): Promise<void> {
		return this.commandService.leaveRoom();
	}

	kickParticipant(participantIdentity: string): Promise<void> {
		return this.commandService.kickParticipant(participantIdentity);
	}

	// ── Internal ─────────────────────────────────────────────────────────────
	private handleWebComponentEvent(event: EmbeddedEvent): void {
		switch (event.event) {
			case EmbeddedEventName.JOINED:
				this.joined.emit(event.payload);
				break;
			case EmbeddedEventName.LEFT:
				this.left.emit(event.payload);
				break;
			case EmbeddedEventName.CLOSED:
				this.closed.emit();
				break;
		}
	}
}
