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
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EmbeddedAttribute, EmbeddedEvent, EmbeddedEventName } from '@openvidu-meet/typings';
import { CommandsPanel } from './components/commands-panel/commands-panel';
import { ConsoleDock } from './components/console-dock/console-dock';
import { SetupPanel } from './components/setup-panel/setup-panel';
import { Integration } from './models';
import type { OpenViduMeetElement } from './openvidu-meet-element';
import { EventLogService } from './services/event-log';
import { IframeHostService } from './services/iframe-host';
import { MeetCommandsService } from './services/meet-commands';
import { ParticipantRosterService } from './services/participant-roster';
import { TestappConfigStore } from './services/testapp-config';
import { ThemeService } from './services/theme';

/** Sidebar tab currently shown. */
type Panel = 'setup' | 'commands';

/**
 * Shell of the testapp: it mounts the chosen integration with the applied config,
 * funnels every lifecycle event into the console and the e2e event sink, and
 * hosts the setup, commands and console surfaces.
 */
@Component({
	selector: 'app-root',
	imports: [SetupPanel, CommandsPanel, ConsoleDock],
	templateUrl: './app.html',
	styleUrl: './app.css',
	// The webcomponent integration uses the raw <openvidu-meet> element from the
	// bundle (loaded via the backend <script>), so allow the custom element + its bindings.
	schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class App {
	protected readonly log = inject(EventLogService);
	protected readonly config = inject(TestappConfigStore);
	protected readonly theme = inject(ThemeService);
	private readonly commands = inject(MeetCommandsService);
	private readonly roster = inject(ParticipantRosterService);
	private readonly iframeHost = inject(IframeHostService);
	private readonly sanitizer = inject(DomSanitizer);

	protected readonly meetRef = viewChild<ElementRef<OpenViduMeetElement>>('meetRef');
	protected readonly meetIframe = viewChild<ElementRef<HTMLIFrameElement>>('meetIframe');
	// Stable, integration-agnostic event target: both transports re-dispatch their
	// lifecycle events here so the e2e suite observes them the same way.
	protected readonly eventSink = viewChild<ElementRef<HTMLElement>>('eventSink');

	// ── Shell state ─────────────────────────────────────────────────────────
	protected readonly integration = signal<Integration>('webcomponent');
	protected readonly panel = signal<Panel>('setup');
	protected readonly sidebarCollapsed = signal(false);
	/** Whether the active integration is currently mounted. */
	protected readonly mounted = signal(false);

	/** Room the applied config points at, for the status bar. */
	protected readonly roomId = computed(() => {
		const roomUrl = this.config.applied()?.roomUrl;
		return roomUrl ? (/\/room\/([^/?#]+)/.exec(roomUrl)?.[1] ?? null) : null;
	});

	// ── Applied signals (iframe integration) ───────────────────────────────
	protected readonly iframeSrc = signal<string | undefined>(undefined);
	private readonly iframeTargetOrigin = signal<string>('*');
	// Angular sanitizes iframe `src` as a resource URL; trust the URL we built ourselves.
	protected readonly safeIframeSrc = computed<SafeResourceUrl | undefined>(() => {
		const src = this.iframeSrc();
		return src ? this.sanitizer.bypassSecurityTrustResourceUrl(src) : undefined;
	});

	constructor() {
		// Point the imperative commands at whichever transport is mounted.
		effect(() => this.commands.useTransport(this.integration(), this.meetRef()?.nativeElement ?? null));

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
		if (this.integration() === value) return;

		this.integration.set(value);
		this.mounted.set(false);
		this.log.info('Integration changed', value);
	}

	// ── Config ───────────────────────────────────────────────────────────────

	protected applyConfig(): void {
		this.log.clear();
		this.roster.clear();

		const apply = () => {
			if (this.integration() === 'iframe') {
				const built = this.buildIframeSrc();

				if (!built) return;

				this.iframeSrc.set(built.src);
				this.iframeTargetOrigin.set(built.origin);
			}

			this.config.apply();
			this.mounted.set(true);
			this.panel.set('commands');
			this.log.info('Config applied', this.integration());
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
		const base = this.config.roomUrl() || this.config.recordingUrl();

		if (!base) {
			this.log.warning('Apply config', 'roomUrl or recordingUrl is required');
			return null;
		}

		let url: URL;

		try {
			url = new URL(base);
		} catch {
			this.log.warning('Apply config', `invalid URL: ${base}`);
			return null;
		}

		const set = (key: string, value: string | undefined) => {
			if (value) url.searchParams.set(key, value);
		};
		set(EmbeddedAttribute.PARTICIPANT_NAME, this.config.participantName());
		set(EmbeddedAttribute.PARTICIPANT_EXTERNAL_ID, this.config.participantExternalId());
		set(EmbeddedAttribute.PARTICIPANT_METADATA, this.config.participantMetadata());
		// The embedded app runs on the Meet server origin (the iframe `src`), NOT this
		// host's origin, and cannot reliably reconstruct the host origin from
		// document.referrer. So resolve a relative leave-redirect path against THIS
		// window's origin here and hand the iframe an absolute URL it can navigate to
		// (the webcomponent gets this for free since it runs in the host window).
		set(EmbeddedAttribute.LEAVE_REDIRECT_URL, this.resolveLeaveRedirectUrl(this.config.leaveRedirectUrl()));
		set(EmbeddedAttribute.E2EE_KEY, this.config.e2eeKey());
		set(EmbeddedAttribute.SHOW_RECORDING, this.config.showRecording());
		// Omitted stays omitted: the query param is only written when the form sets a value, so the
		// iframe transport carries the same three states as the webcomponent one.
		set(EmbeddedAttribute.INITIAL_AUDIO_ACTIVE, this.config.initialAudioActive());
		set(EmbeddedAttribute.INITIAL_VIDEO_ACTIVE, this.config.initialVideoActive());

		if (this.config.showOnlyRecordings()) {
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

	/**
	 * Handles every lifecycle event the webcomponent emits. The `EmbeddedEventName`
	 * values are the DOM event names, so the template passes the name it binds.
	 */
	protected handleEmbeddedEvent(name: `${EmbeddedEventName}`, event: Event): void {
		this.publishEvent(name, (event as CustomEvent<unknown>).detail);
	}

	private handleIframeEvent(event: EmbeddedEvent): void {
		this.publishEvent(event.event, 'payload' in event ? event.payload : {});
	}

	/** Log the event and re-dispatch it on the integration-agnostic event sink for e2e. */
	private publishEvent(name: string, detail: unknown): void {
		const payload = detail ?? {};
		this.log.event(name, payload);
		this.roster.track(name, payload);
		this.eventSink()?.nativeElement.dispatchEvent(new CustomEvent(name, { detail: payload, bubbles: true }));
	}
}
