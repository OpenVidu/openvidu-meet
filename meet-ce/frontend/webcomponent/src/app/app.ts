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
import { resolveMode, type Mode, type ModeInputs } from './modes/mode';
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

	// WC has no Angular Router; captures view-swap requests from shared code via WebComponentBridgeService.
	private readonly _overrideRoomRecordingsId = signal<string | null>(null);

	private readonly inputs = computed<ModeInputs>(() => ({
		roomUrl: this.roomUrl(),
		recordingUrl: this.recordingUrl(),
		participantName: this.participantName(),
		e2eeKey: this.e2eeKey(),
		leaveRedirectUrl: this.leaveRedirectUrl(),
		showOnlyRecordings: this.showOnlyRecordings(),
		showRecording: this.showRecording()
	}));

	readonly mode = computed<Mode>(() => {
		if (this._overrideRoomRecordingsId()) return 'room-recordings';

		return resolveMode(this.inputs());
	});

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
			const shadowRoot = (this._elRef.nativeElement as HTMLElement).shadowRoot;

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
		const detail = this.wcBridge.joinedEvent();

		if (!detail) return;

		this.joined.emit({ roomId: detail.roomId, participantIdentity: detail.participantIdentity });
	});

	private readonly _leftEffect = effect(() => {
		const detail = this.wcBridge.leftEvent();

		if (!detail) return;

		this.left.emit({
			roomId: detail.roomId,
			participantIdentity: detail.participantIdentity,
			reason: detail.reason
		});
	});

	private readonly _closedEffect = effect(() => {
		if (!this.wcBridge.closedEvent()) return;

		this.closed.emit({});
	});

	private readonly _viewRecordingsRequestEffect = effect(() => {
		const detail = this.wcBridge.viewRecordingsRequest();

		if (!detail) return;

		this._overrideRoomRecordingsId.set(detail.roomId);
	});

	private readonly _backToRoomRequestEffect = effect(() => {
		const detail = this.wcBridge.backToRoomRequest();

		if (!detail) return;

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
