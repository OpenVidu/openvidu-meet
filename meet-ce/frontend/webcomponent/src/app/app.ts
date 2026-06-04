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
	EndMeetingComponent,
	type WebComponentLeftEvent,
	MeetingWebComponentManagerService,
	RoomRecordingsComponent,
	RuntimeConfigService,
	ThemeService,
	ViewRecordingComponent,
	type WcEvent,
	WebComponentBridgeService,
	WebComponentEventType
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

	// Set once a `left` event arrives and never cleared, so the end-meeting screen stays up.
	private readonly _leftDetail = signal<WebComponentLeftEvent | null>(null);

	private readonly inputs = computed<ModeInputs>(() => ({
		roomUrl: this.roomUrl(),
		recordingUrl: this.recordingUrl(),
		participantName: this.participantName(),
		e2eeKey: this.e2eeKey(),
		leaveRedirectUrl: this.leaveRedirectUrl(),
		showOnlyRecordings: this.showOnlyRecordings(),
		showRecording: this.showRecording()
	}));

	// An active recordings navigation request overrides the attribute-derived mode.
	readonly mode = computed<Mode>(() =>
		this.wcBridge.navigationRequest() ? 'room-recordings' : computeMode(this.inputs())
	);

	readonly recordingIdForView = computed<string>(
		() => lastPathSegment(this.recordingUrl()) ?? this.showRecording() ?? ''
	);

	readonly recordingSecretForView = computed<string>(() => queryParam(this.recordingUrl(), 'recordingSecret') ?? '');

	readonly roomIdForRecordings = computed<string>(
		() => this.wcBridge.navigationRequest()?.roomId ?? lastPathSegment(this.roomUrl()) ?? ''
	);

	// True when recordings overlay a meeting/lobby (a VIEW_RECORDINGS request is active),
	// i.e. there is a room to go back to — drives the recordings view's back button.
	readonly isRecordingsOverride = computed<boolean>(() => this.wcBridge.navigationRequest() !== null);

	readonly hasLeft = computed<boolean>(() => this._leftDetail() !== null);

	readonly leftReason = computed<string | undefined>(() => this._leftDetail()?.reason);

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

	// Drain and process every queued host event in order (queue → no same-tick loss).
	private readonly _hostEventEffect = effect(() => {
		if (this.wcBridge.wcEvents().length === 0) return;

		for (const event of this.wcBridge.drainWebComponentEvents()) {
			this.handleWebComponentEvent(event);
		}
	});

	private handleWebComponentEvent(event: WcEvent): void {
		switch (event.type) {
			case WebComponentEventType.JOINED:
				this.joined.emit({ roomId: event.roomId, participantIdentity: event.participantIdentity });
				break;
			case WebComponentEventType.LEFT:
				this._leftDetail.set(event);
				this.left.emit({
					roomId: event.roomId,
					participantIdentity: event.participantIdentity,
					reason: event.reason
				});
				break;
			case WebComponentEventType.CLOSED:
				this.closed.emit({});
				break;
		}
	}

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
