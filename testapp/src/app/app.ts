import {
	ChangeDetectionStrategy,
	Component,
	computed,
	CUSTOM_ELEMENTS_SCHEMA,
	effect,
	ElementRef,
	inject,
	signal,
	viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EmbeddedEvent, EmbeddedAttribute } from '@openvidu-meet/typings';
import type { OpenViduMeetElement, OpenViduMeetJoinedDetail, OpenViduMeetLeftDetail } from './openvidu-meet-element';
import { EventLog } from './components/event-log/event-log';
import { EventLogService } from './services/event-log';
import { IframeHostService } from './services/iframe-host';

/** Embedding integration the testapp currently exercises. */
export type Integration = 'webcomponent' | 'iframe';

@Component({
	selector: 'app-root',
	imports: [FormsModule, EventLog],
	templateUrl: './app.html',
	styleUrl: './app.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	// The webcomponent integration uses the raw <openvidu-meet> element from the
	// bundle (loaded via the backend <script>), so allow the custom element + its bindings.
	schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class App {
	protected readonly log = inject(EventLogService);
	private readonly iframeHost = inject(IframeHostService);
	private readonly sanitizer = inject(DomSanitizer);

	protected readonly meetRef = viewChild<ElementRef<OpenViduMeetElement>>('meetRef');
	protected readonly meetIframe = viewChild<ElementRef<HTMLIFrameElement>>('meetIframe');
	// Stable, integration-agnostic event target: both transports re-dispatch their
	// lifecycle events here so the e2e suite observes them the same way.
	protected readonly eventSink = viewChild<ElementRef<HTMLElement>>('eventSink');

	// ── Integration selector (UI-driven; the e2e suite picks the mode through it) ──
	protected readonly integration = signal<Integration>('webcomponent');

	// ── Config form (editable inputs) ──────────────────────────────────────
	protected roomUrlInput = 'http://localhost:6080/meet/room/room-6vnlh1ltf4ej3mh?secret=1d766d7734';
	protected recordingUrlInput = '';
	protected participantNameInput = 'Test User';
	protected e2eeKeyInput = '';
	protected leaveRedirectUrlInput = '';
	protected showRecordingInput = '';
	protected showOnlyRecordingsInput = false;
	protected kickIdentityInput = 'test-participant-1';

	// ── Applied signals (bound to the WC via Angular wrapper inputs) ────────
	protected readonly roomUrl = signal<string | undefined>(undefined);
	protected readonly recordingUrl = signal<string | undefined>(undefined);
	protected readonly participantName = signal<string | undefined>(undefined);
	protected readonly e2eeKey = signal<string | undefined>(undefined);
	protected readonly leaveRedirectUrl = signal<string | undefined>(undefined);
	protected readonly showRecording = signal<string | undefined>(undefined);
	protected readonly showOnlyRecordings = signal<boolean | undefined>(undefined);

	// ── Applied signals (iframe integration) ───────────────────────────────
	protected readonly iframeSrc = signal<string | undefined>(undefined);
	private readonly iframeTargetOrigin = signal<string>('*');
	// Angular sanitizes iframe `src` as a resource URL; trust the URL we built ourselves.
	protected readonly safeIframeSrc = computed<SafeResourceUrl | undefined>(() => {
		const src = this.iframeSrc();
		return src ? this.sanitizer.bypassSecurityTrustResourceUrl(src) : undefined;
	});

	// Whether the active integration is currently mounted.
	protected readonly mounted = signal(false);

	private onJoinedHandler: ((detail: OpenViduMeetJoinedDetail) => void) | null = null;

	constructor() {
		// Wire the iframe host controller to the rendered iframe whenever it (re)mounts
		// in iframe mode; tear it down otherwise.
		effect((onCleanup) => {
			const ref = this.meetIframe();

			if (this.integration() !== 'iframe' || !ref) {
				return;
			}

			this.iframeHost.attach(ref.nativeElement, this.iframeTargetOrigin(), (event, payload) =>
				this.handleIframeEvent(event, payload)
			);
			onCleanup(() => this.iframeHost.detach());
		});
	}

	// ── Integration selector ───────────────────────────────────────────────

	protected onIntegrationChange(value: Integration): void {
		this.integration.set(value);
		this.mounted.set(false);
		this.log.log(`Integration: ${value}`);
	}

	// ── Config ───────────────────────────────────────────────────────────────

	protected applyConfig(): void {
		this.log.clear();

		const apply = () => {
			if (this.integration() === 'iframe') {
				const built = this.buildIframeSrc();
				if (!built) return;
				this.iframeSrc.set(built.src);
				this.iframeTargetOrigin.set(built.origin);
			} else {
				this.roomUrl.set(this.roomUrlInput || undefined);
				this.recordingUrl.set(this.recordingUrlInput || undefined);
				this.participantName.set(this.participantNameInput || undefined);
				this.e2eeKey.set(this.e2eeKeyInput || undefined);
				this.leaveRedirectUrl.set(this.leaveRedirectUrlInput || undefined);
				this.showRecording.set(this.showRecordingInput || undefined);
				this.showOnlyRecordings.set(this.showOnlyRecordingsInput);
			}

			this.mounted.set(true);
			this.log.log('Config applied');
		};

		// Remount to apply fresh config: drop the current view first, then re-add.
		if (this.mounted()) {
			this.mounted.set(false);
			setTimeout(apply);
			return;
		}

		apply();
	}

	/** Builds the iframe `src` (room/recording URL + property query params) and its origin. */
	private buildIframeSrc(): { src: string; origin: string } | null {
		const base = this.roomUrlInput || this.recordingUrlInput;
		if (!base) {
			this.log.log('⚠ roomUrl or recordingUrl is required');
			return null;
		}

		let url: URL;
		try {
			url = new URL(base);
		} catch {
			this.log.log(`⚠ invalid URL: ${base}`);
			return null;
		}

		const set = (key: string, value: string | undefined) => {
			if (value) url.searchParams.set(key, value);
		};
		set(EmbeddedAttribute.PARTICIPANT_NAME, this.participantNameInput);
		// The embedded app runs on the Meet server origin (the iframe `src`), NOT this
		// host's origin, and cannot reliably reconstruct the host origin from
		// document.referrer. So resolve a relative leave-redirect path against THIS
		// window's origin here and hand the iframe an absolute URL it can navigate to
		// (the webcomponent gets this for free since it runs in the host window).
		set(EmbeddedAttribute.LEAVE_REDIRECT_URL, this.resolveLeaveRedirectUrl(this.leaveRedirectUrlInput));
		set(EmbeddedAttribute.E2EE_KEY, this.e2eeKeyInput);
		set(EmbeddedAttribute.SHOW_RECORDING, this.showRecordingInput);
		if (this.showOnlyRecordingsInput) {
			url.searchParams.set(EmbeddedAttribute.SHOW_ONLY_RECORDINGS, 'true');
		}

		return { src: url.toString(), origin: url.origin };
	}

	/**
	 * Resolve a relative leave-redirect path (e.g. `/bye`) against this host page's
	 * origin so the embedded iframe receives an absolute URL. Absolute URLs and
	 * empty values are returned unchanged.
	 */
	private resolveLeaveRedirectUrl(value: string): string {
		return value.startsWith('/') ? window.location.origin + value : value;
	}

	// ── Lifecycle events (unified across integrations) ──────────────────────

	protected handleJoined(event: Event): void {
		this.emitLifecycle(EmbeddedEvent.JOINED, (event as CustomEvent<OpenViduMeetJoinedDetail>).detail);
	}

	protected handleLeft(event: Event): void {
		this.emitLifecycle(EmbeddedEvent.LEFT, (event as CustomEvent<OpenViduMeetLeftDetail>).detail);
	}

	protected handleClosed(): void {
		this.emitLifecycle(EmbeddedEvent.CLOSED, {});
	}

	private handleIframeEvent(event: EmbeddedEvent, payload: unknown): void {
		this.emitLifecycle(event, payload ?? {});
	}

	/** Log the event and re-dispatch it on the integration-agnostic event sink for e2e. */
	private emitLifecycle(name: EmbeddedEvent, detail: unknown): void {
		this.log.log(`[event] ${name} — ${this.stringify(detail)}`);
		this.eventSink()?.nativeElement.dispatchEvent(new CustomEvent(name, { detail: detail ?? {}, bubbles: true }));
	}

	private stringify(detail: unknown): string {
		try {
			return JSON.stringify(detail ?? {});
		} catch {
			return '';
		}
	}

	// ── Imperative API (dispatched to the active integration) ───────────────

	protected callEndMeeting(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.endMeeting();
		} else {
			this.meetRef()?.nativeElement.endMeeting();
		}
		this.log.log('→ endMeeting()');
	}

	protected callLeaveRoom(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.leaveRoom();
		} else {
			this.meetRef()?.nativeElement.leaveRoom();
		}
		this.log.log('→ leaveRoom()');
	}

	protected callKickParticipant(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.kickParticipant(this.kickIdentityInput);
		} else {
			this.meetRef()?.nativeElement.kickParticipant(this.kickIdentityInput);
		}
		this.log.log(`→ kickParticipant("${this.kickIdentityInput}")`);
	}

	// ── on / once / off API (webcomponent element only) ─────────────────────

	protected callOn(): void {
		const el = this.meetRef()?.nativeElement;

		if (!el) {
			this.log.log('⚠ on/once/off is webcomponent-only (no element mounted)');
			return;
		}

		if (this.onJoinedHandler) {
			this.log.log('⚠ on("joined") handler already registered — call off first');
			return;
		}

		this.onJoinedHandler = (d) => this.log.log(`[on] joined — identity: ${d.participantIdentity}`);
		el.on('joined', this.onJoinedHandler);
		this.log.log('on("joined", handler) registered');
	}

	protected callOnce(): void {
		const el = this.meetRef()?.nativeElement;

		if (!el) {
			this.log.log('⚠ on/once/off is webcomponent-only (no element mounted)');
			return;
		}

		el.once('joined', (d) => this.log.log(`[once] joined — identity: ${d.participantIdentity}`));
		this.log.log('once("joined", handler) registered');
	}

	protected callOff(): void {
		const el = this.meetRef()?.nativeElement;

		if (!el) {
			this.log.log('⚠ on/once/off is webcomponent-only (no element mounted)');
			return;
		}

		if (!this.onJoinedHandler) {
			this.log.log('⚠ no on("joined") handler registered');
			return;
		}

		el.off('joined', this.onJoinedHandler);
		this.onJoinedHandler = null;
		this.log.log('off("joined", handler) called');
	}
}
