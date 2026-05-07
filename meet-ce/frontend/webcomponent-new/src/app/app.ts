import {
	ChangeDetectionStrategy,
	Component,
	effect,
	inject,
	input,
	output,
	signal,
	ViewEncapsulation
} from '@angular/core';
import { MeetingComponent, MeetingContextService, RuntimeConfigService } from '@openvidu-meet/shared-components';
import { RoomAccessService, RoomMemberContextService } from '@openvidu-meet/shared-components';
import { NavigationService } from '@openvidu-meet/shared-components';

// ---------------------------------------------------------------------------
// Event detail interfaces — keep in sync with openvidu-meet.contract.js
// ---------------------------------------------------------------------------

export interface OpenViduMeetJoinedDetail {
	roomId: string;
	participantIdentity: string;
}

export interface OpenViduMeetLeftDetail {
	roomId: string;
	participantIdentity: string;
	reason: string;
}

// ---------------------------------------------------------------------------

@Component({
	selector: 'app-root',
	imports: [MeetingComponent],
	templateUrl: './app.html',
	styleUrl: './app.css',
	encapsulation: ViewEncapsulation.ShadowDom,
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.role]': '"application"',
		'[attr.aria-label]': '"OpenVidu Meet"'
	}
})
export class App {
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly roomAccessService = inject(RoomAccessService);
	private readonly navigationService = inject(NavigationService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);

	// ── Web Component API: Properties ──────────────────────────────────────
	readonly roomUrl = input('');
	readonly recordingUrl = input('');
	readonly participantName = input('');
	readonly e2eeKey = input('');
	readonly leaveRedirectUrl = input('');
	readonly showOnlyRecordings = input(false);
	readonly showRecording = input('');

	// ── Web Component API: Events ───────────────────────────────────────────
	readonly joined = output<OpenViduMeetJoinedDetail>();
	readonly left = output<OpenViduMeetLeftDetail>();

	// ── Internal state ────────────────────────────────────────────────────────
	/** Non-null when a configuration error prevents rendering. */
	readonly errorMessage = signal<string | null>(null);
	/** True once the meeting context services have been seeded from the inputs. */
	readonly ready = signal(false);

	constructor() {
		this.runtimeConfigService.enableWebcomponentMode();
	}

	// ── Effects ───────────────────────────────────────────────────────────────

	/** Propagates the server URL derived from roomUrl to RuntimeConfigService. */
	private readonly _serverUrlEffect = effect(() => {
		const serverUrl = this.computeServerUrl(this.roomUrl());

		if (serverUrl) {
			this.runtimeConfigService.setServerUrl(serverUrl);
		}
	});

	/**
	 * Seeds context services from inputs and, for room URLs, generates a preliminary
	 * room member token (equivalent to validateRoomMeetingAccessGuard in the SPA) before
	 * setting ready=true. This ensures getRoom() in the lobby has auth credentials.
	 */
	private readonly _configEffect = effect(() => {
		const url = this.roomUrl();
		const hasNoConfig = !url && !this.recordingUrl() && !this.showOnlyRecordings();

		if (hasNoConfig) {
			this.errorMessage.set('Please provide a "room-url" or "recording-url" attribute to embed OpenVidu Meet.');
			this.ready.set(false);
			return;
		}

		if (url) {
			const roomId = this.extractRoomId(url);

			if (!roomId) {
				this.errorMessage.set(`Invalid room URL: "${url}". Cannot extract room ID.`);
				this.ready.set(false);
				return;
			}

			this.meetingContextService.setRoomId(roomId);

			// Extract and set the room secret from the URL query params (same as SPA guard)
			const secret = this.extractRoomSecret(url);

			if (secret) {
				this.meetingContextService.setRoomSecret(secret, true);
			}
		}

		const e2ee = this.e2eeKey();

		if (e2ee) {
			this.meetingContextService.setE2eeKey(e2ee);
		}

		const name = this.participantName();

		if (name) {
			this.roomMemberContextService.setParticipantName(name, true);
		}

		this.navigationService.handleLeaveRedirectUrl(this.leaveRedirectUrl() || undefined);

		this.errorMessage.set(null);

		// Validate room access (generates preliminary room member token) before rendering.
		// Equivalent to validateRoomMeetingAccessGuard in the SPA route guards.
		// Skip if already ready to avoid re-validating on unrelated input changes.
		if (url && !this.ready()) {
			void this.validateAccessAndSetReady();
		} else if (!url) {
			this.ready.set(true);
		}
	});

	/** Emits 'joined' when the meeting becomes active. */
	private readonly _joinedEffect = effect(() => {
		if (!this.meetingContextService.isActiveMeeting()) return;

		const roomId = this.meetingContextService.roomId() ?? '';
		const identity = this.meetingContextService.localParticipant()?.name ?? '';
		this.joined.emit({ roomId, participantIdentity: identity });
	});

	/** Emits 'left' when the meeting ends. */
	private readonly _leftEffect = effect(() => {
		const endedBy = this.meetingContextService.meetingEndedBy();

		if (!endedBy) return;

		const roomId = this.meetingContextService.roomId() ?? '';
		const identity = this.meetingContextService.localParticipant()?.name ?? '';

		if (endedBy === 'other') {
			this.left.emit({ roomId, participantIdentity: identity, reason: 'meeting_ended' });
		} else {
			this.left.emit({ roomId, participantIdentity: identity, reason: 'voluntary_leave' });
		}
	});

	// ── Web Component API: Imperative methods ───────────────────────────────

	endMeeting(): void {
		console.log('[openvidu-meet] endMeeting() called');
	}

	leaveRoom(): void {
		console.log('[openvidu-meet] leaveRoom() called');
	}

	kickParticipant(participantIdentity: string): void {
		console.log('[openvidu-meet] kickParticipant() called for', participantIdentity);
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	/**
	 * Computes the server base URL from a full room URL.
	 * Extracts the origin + path prefix up to (but not including) the `/room/` segment.
	 *
	 * @example
	 * "http://localhost:6080/meet/room/my-room?secret=abc" → "http://localhost:6080/meet"
	 * "https://demo.openvidu.io/room/my-room" → "https://demo.openvidu.io"
	 */
	private computeServerUrl(roomUrl: string): string | null {
		if (!roomUrl) return null;

		try {
			const parsed = new URL(roomUrl);
			const idx = parsed.pathname.indexOf('/room/');

			if (idx === -1) return null;

			const basePath = parsed.pathname.slice(0, idx);
			return `${parsed.origin}${basePath}`;
		} catch {
			return null;
		}
	}

	/**
	 * Extracts the room ID from a full room URL by taking the last non-empty path segment.
	 * e.g. "https://demo.openvidu.io/test-room" → "test-room"
	 *      "https://demo.openvidu.io/room/my-room" → "my-room"
	 */
	private extractRoomId(roomUrl: string): string | null {
		try {
			const segments = new URL(roomUrl).pathname.split('/').filter(Boolean);
			return segments[segments.length - 1] ?? null;
		} catch {
			return null;
		}
	}

	/**
	 * Extracts the room secret from the `secret` query parameter of a room URL.
	 * e.g. "https://demo.openvidu.io/room/my-room?secret=abc" → "abc"
	 */
	private extractRoomSecret(roomUrl: string): string | null {
		try {
			return new URL(roomUrl).searchParams.get('secret');
		} catch {
			return null;
		}
	}

	/**
	 * Generates a preliminary room member token (joinMeeting: false) to authenticate
	 * subsequent requests in the lobby (e.g. getRoom). Equivalent to the SPA's
	 * validateRoomMeetingAccessGuard. Sets ready=true on success, errorMessage on failure.
	 */
	private async validateAccessAndSetReady(): Promise<void> {
		try {
			const result = await this.roomAccessService.validateAccess();
			debugger;

			if (result.allowed) {
				this.ready.set(true);
			} else {
				this.errorMessage.set('Unable to prepare your meeting. Please check the room URL and try again.');
			}
		} catch {
			this.errorMessage.set('An error occurred while preparing your meeting. Please try again later.');
		}
	}
}
