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
	untracked,
	ViewEncapsulation
} from '@angular/core';
import {
	AppCeMeetingComponent,
	EndMeetingComponent,
	MeetingWebComponentManagerService,
	RoomRecordingsComponent,
	RuntimeConfigService,
	ThemeService,
	ViewRecordingComponent,
	WebComponentBridgeService
} from '@openvidu-meet/shared-components';
import type {
	OpenViduMeetClosedDetail,
	OpenViduMeetErrorDetail,
	OpenViduMeetJoinedDetail,
	OpenViduMeetLeftDetail
} from './api/events';
import { computeMode, type Mode, type ModeInputs } from './modes/mode';
import { ModeCoordinatorService } from './modes/mode-coordinator.service';
import { ShadowOverlayContainer } from './shadow-dom/overlay-container.service';
import { ShadowStylesService } from './shadow-dom/styles.service';
import { computeServerUrl, lastPathSegment, queryParam } from './utils/url';

export type {
	OpenViduMeetClosedDetail,
	OpenViduMeetErrorDetail,
	OpenViduMeetErrorReason,
	OpenViduMeetJoinedDetail,
	OpenViduMeetLeftDetail
} from './api/events';

@Component({
	selector: 'app-root',
	imports: [AppCeMeetingComponent, EndMeetingComponent, RoomRecordingsComponent, ViewRecordingComponent],
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
	protected readonly themeService = inject(ThemeService);
	private readonly wcManager = inject(MeetingWebComponentManagerService);
	private readonly wcBridge = inject(WebComponentBridgeService);
	private readonly modeCoordinator = inject(ModeCoordinatorService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);
	private readonly _elRef = inject(ElementRef);
	private readonly _destroyRef = inject(DestroyRef);
	private readonly _shadowStyles = inject(ShadowStylesService);
	private readonly _shadowOverlay = inject(ShadowOverlayContainer);

	readonly roomUrl = input('');
	readonly recordingUrl = input('');
	readonly participantName = input('');
	readonly e2eeKey = input('');
	readonly leaveRedirectUrl = input('');
	readonly showOnlyRecordings = input(false);
	readonly showRecording = input('');

	readonly joined = output<OpenViduMeetJoinedDetail>();
	readonly left = output<OpenViduMeetLeftDetail>();
	readonly closed = output<OpenViduMeetClosedDetail>();
	readonly error = output<OpenViduMeetErrorDetail>();

	readonly errorMessage = signal<string | null>(null);
	readonly ready = signal(false);

	// WC has no Angular Router; captures in-WC view swaps requested by shared code
	// via WebComponentBridgeService. Holds the roomId of the recordings view being
	// shown, or null when no such swap is active.
	private readonly _overrideRoomRecordingsId = signal<string | null>(null);

	private readonly inputs = computed<ModeInputs>(() => ({
		roomUrl: this.roomUrl(),
		recordingUrl: this.recordingUrl(),
		participantName: this.participantName(),
		e2eeKey: this.e2eeKey(),
		leaveRedirectUrl: this.leaveRedirectUrl(),
		showOnlyRecordings: this.showOnlyRecordings(),
		showRecording: this.showRecording() // esto es interno?
	}));

	// An active in-WC view swap (see `_overrideRoomRecordingsId`) wins over the
	// attribute-derived mode; it mirrors a router navigation the WC can't perform.
	readonly mode = computed<Mode>(() =>
		this._overrideRoomRecordingsId() !== null ? 'room-recordings' : computeMode(this.inputs())
	);

	readonly recordingIdForView = computed<string>(
		() => lastPathSegment(this.recordingUrl()) ?? this.showRecording() ?? ''
	);

	readonly recordingSecretForView = computed<string>(() => queryParam(this.recordingUrl(), 'recordingSecret') ?? '');

	readonly roomIdForRecordings = computed<string>(
		() => this._overrideRoomRecordingsId() ?? lastPathSegment(this.roomUrl()) ?? ''
	);

	readonly hasLeft = computed<boolean>(() => this.wcBridge.leftEvent() !== null);

	readonly leftReason = computed<string | undefined>(() => this.wcBridge.leftEvent()?.reason);

	constructor() {
		// enableWebcomponentMode() is called in main.wc.ts before element registration
		// so injected services observe WC mode during their constructor-time effects.
		afterNextRender(() => {
			const { shadowRoot } = this._elRef.nativeElement as HTMLElement;

			if (shadowRoot) {
				this._shadowStyles.reflect(shadowRoot, this._destroyRef);
				this._shadowOverlay.setShadowRoot(shadowRoot);
			}
		});
	}

	private readonly _serverUrlEffect = effect(() => {
		const serverUrl =
			computeServerUrl(this.roomUrl(), '/room/') ?? computeServerUrl(this.recordingUrl(), '/recording/');

		if (serverUrl) {
			this.runtimeConfigService.setServerUrl(serverUrl);
		}
	});

	private readonly _bootstrapEffect = effect(() => {
		const mode = this.mode();
		this.errorMessage.set(null);

		if (this.ready()) return;

		void this.runBootstrap(mode);
	});

	private async runBootstrap(mode: Mode): Promise<void> {
		const result = await this.modeCoordinator.run(mode, this.inputs());

		if (result.kind === 'ready') {
			this.ready.set(true);
		} else {
			this.errorMessage.set(result.detail.message);
			this.error.emit(result.detail);
		}
	}

	private readonly _joinedEffect = effect(() => {
		const event = this.wcBridge.joinedEvent();

		if (!event) return;

		this.joined.emit({ roomId: event.roomId, participantIdentity: event.participantIdentity });
	});

	private readonly _leftEffect = effect(() => {
		const event = this.wcBridge.leftEvent();

		if (!event) return;

		this.left.emit({
			roomId: event.roomId,
			participantIdentity: event.participantIdentity,
			reason: event.reason
		});
	});

	private readonly _closedEffect = effect(() => {
		const event = this.wcBridge.closedEvent();

		if (!event) return;

		this.closed.emit({});
	});

	private readonly _viewRecordingsRequestEffect = effect(() => {
		const request = this.wcBridge.viewRecordingsRequest();

		if (!request) return;

		this._overrideRoomRecordingsId.set(request.roomId);
	});

	private readonly _backToRoomRequestEffect = effect(() => {
		const request = this.wcBridge.backToRoomRequest();

		if (!request) return;

		// Read without tracking: writing `null` here would otherwise re-trigger
		// this effect and the same `detail` would fall through to emit `closed`.
		if (untracked(this._overrideRoomRecordingsId) !== null) {
			this._overrideRoomRecordingsId.set(null);
			return;
		}

		// Launched directly in show-only-recordings mode — no meeting to return to.
		this.wcBridge.emitClosedEvent();
	});

	endMeeting(): Promise<void> {
		return this.wcManager.endMeeting();
	}

	leaveRoom(): Promise<void> {
		return this.wcManager.leaveRoom();
	}

	kickParticipant(participantIdentity: string): Promise<void> {
		return this.wcManager.kickParticipant(participantIdentity);
	}
}
