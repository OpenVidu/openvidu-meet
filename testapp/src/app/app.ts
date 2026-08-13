import {
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
import { EmbeddedAttribute, EmbeddedEvent, EmbeddedEventName, EmbeddedEventPayloadFor } from '@openvidu-meet/typings';
import { EventLog } from './components/event-log/event-log';
import type { OpenViduMeetElement } from './openvidu-meet-element';
import { EventLogService } from './services/event-log';
import { IframeHostService } from './services/iframe-host';

/** Embedding integration the testapp currently exercises. */
export type Integration = 'webcomponent' | 'iframe';

@Component({
	selector: 'app-root',
	imports: [FormsModule, EventLog],
	templateUrl: './app.html',
	styleUrl: './app.css',
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
	protected participantExternalIdInput = '';
	protected participantMetadataInput = '';
	protected e2eeKeyInput = '';
	protected leaveRedirectUrlInput = '';
	protected initialAudioMutedInput = false;
	protected initialVideoMutedInput = false;
	protected showRecordingInput = '';
	protected showOnlyRecordingsInput = false;
	protected kickIdentityInput = 'test-participant-1';

	// ── Applied signals (bound to the WC via Angular wrapper inputs) ────────
	protected readonly roomUrl = signal<string | undefined>(undefined);
	protected readonly recordingUrl = signal<string | undefined>(undefined);
	protected readonly participantName = signal<string | undefined>(undefined);
	protected readonly participantExternalId = signal<string | undefined>(undefined);
	protected readonly participantMetadata = signal<string | undefined>(undefined);
	protected readonly initialAudioMuted = signal<boolean | undefined>(undefined);
	protected readonly initialVideoMuted = signal<boolean | undefined>(undefined);
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

	private onJoinedHandler: ((eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName.JOINED>) => void) | null = null;

	constructor() {
		// Wire the iframe host controller to the rendered iframe whenever it (re)mounts
		// in iframe mode; tear it down otherwise.
		effect((onCleanup) => {
			const ref = this.meetIframe();

			if (this.integration() !== 'iframe' || !ref) {
				return;
			}

			this.iframeHost.attach(ref.nativeElement, this.iframeTargetOrigin(), (event) =>
				this.handleIframeEvent(event)
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
				this.participantExternalId.set(this.participantExternalIdInput || undefined);
				this.participantMetadata.set(this.participantMetadataInput || undefined);
				this.initialAudioMuted.set(this.initialAudioMutedInput);
				this.initialVideoMuted.set(this.initialVideoMutedInput);
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
			setTimeout(apply, 20);
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
		set(EmbeddedAttribute.PARTICIPANT_EXTERNAL_ID, this.participantExternalIdInput);
		set(EmbeddedAttribute.PARTICIPANT_METADATA, this.participantMetadataInput);
		// The embedded app runs on the Meet server origin (the iframe `src`), NOT this
		// host's origin, and cannot reliably reconstruct the host origin from
		// document.referrer. So resolve a relative leave-redirect path against THIS
		// window's origin here and hand the iframe an absolute URL it can navigate to
		// (the webcomponent gets this for free since it runs in the host window).
		set(EmbeddedAttribute.LEAVE_REDIRECT_URL, this.resolveLeaveRedirectUrl(this.leaveRedirectUrlInput));
		set(EmbeddedAttribute.E2EE_KEY, this.e2eeKeyInput);
		set(EmbeddedAttribute.SHOW_RECORDING, this.showRecordingInput);
		if (this.initialAudioMutedInput) {
			url.searchParams.set(EmbeddedAttribute.INITIAL_AUDIO_MUTED, 'true');
		}
		if (this.initialVideoMutedInput) {
			url.searchParams.set(EmbeddedAttribute.INITIAL_VIDEO_MUTED, 'true');
		}
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

	/** @deprecated Handles the 3.8.0 `joined` event. Removed in 3.12.0. Kept so the e2e can listen for it. */
	protected handleJoined(event: Event): void {
		this.logReceivedEvent(
			EmbeddedEventName.JOINED,
			(event as CustomEvent<EmbeddedEventPayloadFor<EmbeddedEventName.JOINED>>).detail
		);
	}

	/** @deprecated Handles the 3.8.0 `left` event. Removed in 3.12.0. Kept so the e2e can listen for it. */
	protected handleLeft(event: Event): void {
		this.logReceivedEvent(
			EmbeddedEventName.LEFT,
			(event as CustomEvent<EmbeddedEventPayloadFor<EmbeddedEventName.LEFT>>).detail
		);
	}

	/** @deprecated Handles the 3.8.0 `closed` event. Removed in 3.12.0. Kept so the e2e can listen for it. */
	protected handleClosed(): void {
		this.logReceivedEvent(EmbeddedEventName.CLOSED, {});
	}

	protected handleMeetingJoined(event: Event): void {
		this.logReceivedEvent(
			EmbeddedEventName.MEETING_JOINED,
			(event as CustomEvent<EmbeddedEventPayloadFor<EmbeddedEventName.MEETING_JOINED>>).detail
		);
	}

	protected handleMeetingLeft(event: Event): void {
		this.logReceivedEvent(
			EmbeddedEventName.MEETING_LEFT,
			(event as CustomEvent<EmbeddedEventPayloadFor<EmbeddedEventName.MEETING_LEFT>>).detail
		);
	}

	protected handleMeetingClosed(): void {
		this.logReceivedEvent(EmbeddedEventName.MEETING_CLOSED, {});
	}

	protected handleParticipantJoined(event: Event): void {
		this.logReceivedEvent(
			EmbeddedEventName.PARTICIPANT_JOINED,
			(event as CustomEvent<EmbeddedEventPayloadFor<EmbeddedEventName.PARTICIPANT_JOINED>>).detail
		);
	}

	protected handleParticipantLeft(event: Event): void {
		this.logReceivedEvent(
			EmbeddedEventName.PARTICIPANT_LEFT,
			(event as CustomEvent<EmbeddedEventPayloadFor<EmbeddedEventName.PARTICIPANT_LEFT>>).detail
		);
	}

	protected handleMediaAudioStatusChanged(event: Event): void {
		this.logReceivedEvent(
			EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED,
			(event as CustomEvent<EmbeddedEventPayloadFor<EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED>>).detail
		);
	}

	protected handleMediaVideoStatusChanged(event: Event): void {
		this.logReceivedEvent(
			EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED,
			(event as CustomEvent<EmbeddedEventPayloadFor<EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED>>).detail
		);
	}

	protected handleMediaScreenShareStatusChanged(event: Event): void {
		this.logReceivedEvent(
			EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED,
			(event as CustomEvent<EmbeddedEventPayloadFor<EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED>>).detail
		);
	}

	private handleIframeEvent(event: EmbeddedEvent): void {
		this.logReceivedEvent(event.event, 'payload' in event ? event.payload : {});
	}

	/** Log the event and re-dispatch it on the integration-agnostic event sink for e2e. */
	private logReceivedEvent(name: EmbeddedEventName, detail: unknown): void {
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

	protected callMeetingEnd(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.meetingEnd();
		} else {
			this.meetRef()?.nativeElement.meetingEnd();
		}
		this.log.log('→ meetingEnd()');
	}

	protected callMeetingLeave(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.meetingLeave();
		} else {
			this.meetRef()?.nativeElement.meetingLeave();
		}
		this.log.log('→ meetingLeave()');
	}

	protected callParticipantKick(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.participantKick(this.kickIdentityInput);
		} else {
			this.meetRef()?.nativeElement.participantKick(this.kickIdentityInput);
		}
		this.log.log(`→ participantKick("${this.kickIdentityInput}")`);
	}

	protected callMediaToggleAudio(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.mediaToggleAudio();
		} else {
			this.meetRef()?.nativeElement.mediaToggleAudio();
		}
		this.log.log('→ mediaToggleAudio()');
	}

	protected callMediaToggleVideo(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.mediaToggleVideo();
		} else {
			this.meetRef()?.nativeElement.mediaToggleVideo();
		}
		this.log.log('→ mediaToggleVideo()');
	}

	protected callMediaToggleScreenShare(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.mediaToggleScreenShare();
		} else {
			this.meetRef()?.nativeElement.mediaToggleScreenShare();
		}
		this.log.log('→ mediaToggleScreenShare()');
	}

	// ── Deprecated command spellings (kept so the e2e covers the 3.8.0 surface) ──

	/** @deprecated Sends the 3.8.0 `endMeeting` command. Removed in 3.12.0. */
	protected callLegacyEndMeeting(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.legacyEndMeeting();
		} else {
			this.meetRef()?.nativeElement.endMeeting();
		}
		this.log.log('→ endMeeting() [deprecated]');
	}

	/** @deprecated Sends the 3.8.0 `leaveRoom` command. Removed in 3.12.0. */
	protected callLegacyLeaveRoom(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.legacyLeaveRoom();
		} else {
			this.meetRef()?.nativeElement.leaveRoom();
		}
		this.log.log('→ leaveRoom() [deprecated]');
	}

	/** @deprecated Sends the 3.8.0 `kickParticipant` command. Removed in 3.12.0. */
	protected callLegacyKickParticipant(): void {
		if (this.integration() === 'iframe') {
			this.iframeHost.legacyKickParticipant(this.kickIdentityInput);
		} else {
			this.meetRef()?.nativeElement.kickParticipant(this.kickIdentityInput);
		}
		this.log.log(`→ kickParticipant("${this.kickIdentityInput}") [deprecated]`);
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

		this.onJoinedHandler = (e) => this.log.log(`[on] joined — identity: ${e.participantIdentity}`);
		el.on(EmbeddedEventName.JOINED, this.onJoinedHandler);
		this.log.log('on("joined", handler) registered');
	}

	protected callOnce(): void {
		const el = this.meetRef()?.nativeElement;

		if (!el) {
			this.log.log('⚠ on/once/off is webcomponent-only (no element mounted)');
			return;
		}

		el.once(EmbeddedEventName.JOINED, (e) => this.log.log(`[once] joined — identity: ${e.participantIdentity}`));
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

		el.off(EmbeddedEventName.JOINED, this.onJoinedHandler);
		this.onJoinedHandler = null;
		this.log.log('off("joined", handler) called');
	}
}
