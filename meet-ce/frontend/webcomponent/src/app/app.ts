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
	signal,
	ViewEncapsulation
} from '@angular/core';
import {
	AppCeMeetingComponent,
	MeetingWebComponentManagerService,
	RoomRecordingsComponent,
	RuntimeConfigService,
	ThemeService,
	ViewRecordingComponent
} from '@openvidu-meet/shared-components';
import type { OpenViduMeetErrorDetail, OpenViduMeetJoinedDetail, OpenViduMeetLeftDetail } from './api/events';
import { ModeCoordinatorService } from './modes/mode-coordinator.service';
import { resolveMode, type Mode } from './modes/mode';
import { ShadowOverlayContainer } from './shadow-dom/overlay-container.service';
import { ShadowStylesService } from './shadow-dom/styles.service';
import { computeServerUrl, lastPathSegment, queryParam } from './utils/url';

// Re-export the public event detail types under the App module so existing
// consumers (and the auto-generated `openvidu-meet.d.ts`) keep their imports.
export type {
	OpenViduMeetErrorDetail,
	OpenViduMeetErrorReason,
	OpenViduMeetJoinedDetail,
	OpenViduMeetLeftDetail
} from './api/events';

/**
 * Root component for the OpenVidu Meet Web Component.
 *
 * Acts as a thin presenter:
 * - Declares the public WC API (inputs, outputs, imperative methods).
 * - Resolves the active {@link Mode} from inputs.
 * - Delegates per-mode bootstrap to {@link ModeCoordinatorService}.
 * - Surfaces UI state (`errorMessage`, `ready`) and DOM events to the host.
 *
 * Application logic (mode dispatch, URL parsing, access validation, error
 * mapping) lives in dedicated modules under `modes/`, `utils/`, and `api/`.
 */
@Component({
	selector: 'app-root',
	imports: [AppCeMeetingComponent, RoomRecordingsComponent, ViewRecordingComponent],
	templateUrl: './app.html',
	styleUrls: ['./app.material.scss', './app.css'],
	encapsulation: ViewEncapsulation.ShadowDom,
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [ShadowStylesService],
	host: {
		'[attr.role]': '"application"',
		'[attr.aria-label]': '"OpenVidu Meet"',
		// Mirror the document-level theme attribute onto :host so that the
		// :host([data-theme='dark']) CSS selector in app.material.scss works
		// inside the shadow root (document[data-theme] cannot pierce the boundary).
		'[attr.data-theme]': 'themeService.isDark() ? "dark" : null'
	}
})
export class App {
	protected readonly themeService = inject(ThemeService);
	private readonly wcManager = inject(MeetingWebComponentManagerService);
	private readonly modeCoordinator = inject(ModeCoordinatorService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);
	private readonly _elRef = inject(ElementRef);
	private readonly _destroyRef = inject(DestroyRef);
	private readonly _shadowStyles = inject(ShadowStylesService);
	private readonly _shadowOverlay = inject(ShadowOverlayContainer);

	// ── Web Component API: Properties ──────────────────────────────────────
	readonly roomUrl = input('');
	readonly recordingUrl = input('');
	readonly participantName = input('');
	readonly e2eeKey = input('');
	readonly leaveRedirectUrl = input('');
	readonly showOnlyRecordings = input(false);
	readonly showRecording = input('');

	// ── Web Component API: Events ──────────────────────────────────────────
	readonly joined = output<OpenViduMeetJoinedDetail>();
	readonly left = output<OpenViduMeetLeftDetail>();
	readonly error = output<OpenViduMeetErrorDetail>();

	// ── UI state ───────────────────────────────────────────────────────────
	/** Non-null when an error prevents normal rendering. Mirrors the `error` event. */
	readonly errorMessage = signal<string | null>(null);
	/** True once the active mode has finished its bootstrap and can render. */
	readonly ready = signal(false);

	// ── Derived state ──────────────────────────────────────────────────────
	/** Active virtual route, derived from the current inputs. */
	readonly mode = computed<Mode>(() =>
		resolveMode({
			roomUrl: this.roomUrl(),
			recordingUrl: this.recordingUrl(),
			participantName: this.participantName(),
			e2eeKey: this.e2eeKey(),
			leaveRedirectUrl: this.leaveRedirectUrl(),
			showOnlyRecordings: this.showOnlyRecordings(),
			showRecording: this.showRecording()
		})
	);

	/** Recording identifier bound into `<ov-view-recording>` in `single-recording` mode. */
	readonly recordingIdForView = computed<string>(() => {
		return lastPathSegment(this.recordingUrl()) ?? this.showRecording() ?? '';
	});

	/** Recording secret bound into `<ov-view-recording>` in `single-recording` mode. */
	readonly recordingSecretForView = computed<string>(() => {
		return queryParam(this.recordingUrl(), 'recordingSecret') ?? '';
	});

	/** Room identifier bound into `<ov-room-recordings>` in `room-recordings` mode. */
	readonly roomIdForRecordings = computed<string>(() => {
		return lastPathSegment(this.roomUrl()) ?? '';
	});

	constructor() {
		this.runtimeConfigService.enableWebcomponentMode();

		// Mirror Angular Material styles from document.head into the shadow root.
		// Material components use ViewEncapsulation.None, so Angular injects their
		// styles globally — those cannot cross the Shadow DOM boundary on their own.
		afterNextRender(() => {
			const shadowRoot = (this._elRef.nativeElement as HTMLElement).shadowRoot;

			if (shadowRoot) {
				this._shadowStyles.reflect(shadowRoot, this._destroyRef);
				// Place CDK overlay container (tooltips, menus, dialogs) inside the
				// shadow root so they inherit theme tokens and Material styles.
				this._shadowOverlay.setShadowRoot(shadowRoot);
			}
		});
	}

	// ── Effects ────────────────────────────────────────────────────────────

	/**
	 * Propagates the server URL derived from whichever input is present
	 * (`roomUrl` for meeting / recordings-list modes, `recordingUrl` for
	 * playback) to {@link RuntimeConfigService}. Without this, all relative
	 * API and asset paths inside the embedded library would resolve against
	 * the host page.
	 */
	private readonly _serverUrlEffect = effect(() => {
		const serverUrl =
			computeServerUrl(this.roomUrl(), '/room/') ?? computeServerUrl(this.recordingUrl(), '/recording/');

		if (serverUrl) {
			this.runtimeConfigService.setServerUrl(serverUrl);
		}
	});

	/**
	 * Drives the active-mode bootstrap. Recomputes when {@link mode} changes,
	 * short-circuits if already ready to avoid re-running preflight on
	 * unrelated input changes.
	 */
	private readonly _bootstrapEffect = effect(() => {
		const mode = this.mode();

		// Reset transient state so messages/UI for a prior mode don't bleed.
		this.errorMessage.set(null);

		if (this.ready()) return;

		void this.runBootstrap(mode);
	});

	private async runBootstrap(mode: Mode): Promise<void> {
		const result = await this.modeCoordinator.run(mode, {
			roomUrl: this.roomUrl(),
			recordingUrl: this.recordingUrl(),
			participantName: this.participantName(),
			e2eeKey: this.e2eeKey(),
			leaveRedirectUrl: this.leaveRedirectUrl(),
			showOnlyRecordings: this.showOnlyRecordings(),
			showRecording: this.showRecording()
		});

		if (result.kind === 'ready') {
			this.ready.set(true);
		} else {
			this.errorMessage.set(result.detail.message);
			this.error.emit(result.detail);
		}
	}

	/**
	 * Emits `joined` when the local participant connects to the room.
	 * Driven by the webcomponent adapter's `joinedEvent` signal.
	 */
	private readonly _joinedEffect = effect(() => {
		const detail = this.wcManager.joinedEvent();

		if (!detail) return;

		this.joined.emit({
			roomId: detail.roomId,
			participantIdentity: detail.participantIdentity
		});
	});

	/**
	 * Emits `left` when the local participant disconnects from the room.
	 * Driven by the adapter's `leftEvent` signal so the host receives the
	 * precise LeftEventReason (kick, network drop, server shutdown, duplicate
	 * identity, voluntary leave, etc.).
	 */
	private readonly _leftEffect = effect(() => {
		const detail = this.wcManager.leftEvent();

		if (!detail) return;

		this.left.emit({
			roomId: detail.roomId,
			participantIdentity: detail.participantIdentity,
			reason: detail.reason
		});
	});

	// ── Web Component API: Imperative methods ──────────────────────────────

	/**
	 * Ends the meeting for all participants. Requires the local participant
	 * to hold the `canEndMeeting` permission; otherwise the call is a no-op.
	 */
	endMeeting(): Promise<void> {
		return this.wcManager.endMeeting();
	}

	/** Disconnects the local participant from the current room. */
	leaveRoom(): Promise<void> {
		return this.wcManager.leaveRoom();
	}

	/**
	 * Removes the named participant from the meeting. Requires the local
	 * participant to hold the `canKickParticipants` permission.
	 */
	kickParticipant(participantIdentity: string): Promise<void> {
		return this.wcManager.kickParticipant(participantIdentity);
	}
}
