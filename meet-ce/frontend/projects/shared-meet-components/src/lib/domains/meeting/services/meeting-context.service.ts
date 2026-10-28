import { inject, Service, signal } from '@angular/core';
import { GlobalConfigService } from '../../../shared/services/global-config.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomFeatureService } from '../../rooms/services/room-feature.service';
import { ViewportService } from '../openvidu-components';
import { RoomAccessLinkService } from './room-access-link.service';

/**
 * Meeting-domain context: the room identity/config and session flags of the current meeting.
 * Lightweight (no LiveKit); the live participant/room runtime state lives in MeetingStateService.
 */
@Service()
export class MeetingContextService {
	private readonly roomFeatureService = inject(RoomFeatureService);
	private readonly globalConfigService = inject(GlobalConfigService);
	private readonly viewportService = inject(ViewportService);
	private readonly sessionStorageService = inject(SessionStorageService);
	private readonly roomAccessLinkService = inject(RoomAccessLinkService);
	private readonly roomMemberContextService = inject(RoomMemberContextService);

	private readonly _roomId = signal<string | undefined>(undefined);
	private readonly _roomSecret = signal<string | undefined>(undefined);
	private readonly _e2eeKey = signal<string>('');
	private readonly _isE2eeKeyFromUrl = signal<boolean>(false);
	private readonly _hasRecordings = signal<boolean>(false);
	private readonly _isActiveMeeting = signal<boolean>(false);
	private readonly _endedBySelf = signal<boolean>(false);
	private readonly _meetingStartedAt = signal<number | undefined>(undefined);
	private readonly _meetingEndsAt = signal<number | undefined>(undefined);

	/** Readonly signal for the current room ID */
	readonly roomId = this._roomId.asReadonly();

	/** Readonly signal for the room secret (if any) */
	readonly roomSecret = this._roomSecret.asReadonly();
	/** Readonly signal for the stored E2EE key (if any) */
	readonly e2eeKey = this._e2eeKey.asReadonly();
	/** Readonly signal for whether the E2EE key came from a URL parameter */
	readonly isE2eeKeyFromUrl = this._isE2eeKeyFromUrl.asReadonly();

	/** Readonly signal for whether the room has recordings */
	readonly hasRecordings = this._hasRecordings.asReadonly();
	/** Readonly signal for whether this participant is the one who ended the meeting for everyone */
	readonly endedBySelf = this._endedBySelf.asReadonly();
	/**
	 * Readonly signal for the instant the meeting started, in this device's clock, or `undefined`
	 * for a meeting whose room Meet did not create
	 */
	readonly meetingStartedAt = this._meetingStartedAt.asReadonly();
	/**
	 * Readonly signal for the instant the meeting is force-ended at its room's duration limit, in
	 * this device's clock, or `undefined` for a meeting running under no limit
	 */
	readonly meetingEndsAt = this._meetingEndsAt.asReadonly();
	/** Readonly signal for whether the meeting is active */
	readonly isActiveMeeting = this._isActiveMeeting.asReadonly();

	/** Readonly signal for meeting features */
	readonly meetingUI = this.roomFeatureService.features;
	/** Readonly signal for which local devices the participant starts the meeting with */
	readonly initialMediaState = this.roomFeatureService.initialMediaState;
	/** Readonly signal for the room's recording configuration (trigger, layout) */
	readonly recordingConfig = this.roomFeatureService.recordingConfig;
	/** Readonly signal for room appearance configuration from global settings */
	readonly meetingAppearance = this.globalConfigService.roomAppearanceConfig;

	/** Readonly signal for whether the window is narrow enough for the mobile toolbar, on any device */
	readonly isMobile = this.viewportService.isMobileView;

	/**
	 * Sets the room ID in context
	 * @param roomId The room ID
	 */
	setRoomId(roomId: string): void {
		this._roomId.set(roomId);
	}

	/**
	 * Sets the room secret in context, for the current room
	 * @param secret The room secret
	 * @param updateStorage Whether to persist in SessionStorage (default: false)
	 */
	setRoomSecret(secret: string, updateStorage = false): void {
		const roomId = this._roomId();

		if (updateStorage && roomId) {
			this.sessionStorageService.setRoomSecret(roomId, secret);
		}

		this._roomSecret.set(secret);
	}

	/**
	 * Loads into context the room secret persisted for the current room (e.g. by an earlier URL visit
	 * carrying `?secret=`), and none when it was persisted for another room.
	 */
	loadRoomSecretFromStorage(): void {
		const roomId = this._roomId();
		this._roomSecret.set((roomId && this.sessionStorageService.getRoomSecret(roomId)) || undefined);
	}

	/**
	 * Stores the E2EE key in context, for the current room
	 * @param key The E2EE key
	 * @param fromUrl Whether the key came from a URL parameter (default: false)
	 */
	setE2eeKey(key: string, fromUrl = false): void {
		const roomId = this._roomId();

		if (roomId) {
			this.sessionStorageService.setE2EEData(roomId, key, fromUrl);
		}

		this._e2eeKey.set(key);
		this._isE2eeKeyFromUrl.set(fromUrl);
	}

	/**
	 * Loads into context the E2EE key data persisted for the current room, and none when it was
	 * persisted for another room.
	 */
	loadE2eeKeyFromStorage(): void {
		const roomId = this._roomId();
		const e2eeData = roomId ? this.sessionStorageService.getE2EEData(roomId) : null;
		this._e2eeKey.set(e2eeData?.key ?? '');
		this._isE2eeKeyFromUrl.set(e2eeData?.fromUrl ?? false);
	}

	/**
	 * Updates whether the room has recordings
	 * @param hasRecordings True if recordings exist
	 */
	setHasRecordings(hasRecordings: boolean): void {
		this._hasRecordings.set(hasRecordings);
	}

	/**
	 * Sets whether the meeting is active
	 * @param isActive True if the meeting is active, false otherwise
	 */
	setIsActiveMeeting(isActive: boolean): void {
		this._isActiveMeeting.set(isActive);
	}

	/**
	 * Records that this participant is ending the meeting for everyone, at the moment they ask for
	 * it: the disconnect that follows carries no trace of who caused it.
	 */
	markMeetingEndedBySelf(): void {
		this._endedBySelf.set(true);
	}

	/** Withdraws {@link markMeetingEndedBySelf} when the end this participant asked for did not happen. */
	clearMeetingEndedBySelf(): void {
		this._endedBySelf.set(false);
	}

	setMeetingStartedAt(startedAt: number | undefined): void {
		this._meetingStartedAt.set(startedAt);
	}

	setMeetingEndsAt(endsAt: number | undefined): void {
		this._meetingEndsAt.set(endsAt);
	}

	/**
	 * Clears all meeting-scoped state:
	 * - room member context
	 * - meeting context
	 * - meeting-related session storage (optional).
	 *
	 * @param clearSessionStorage Whether to also clear meeting data from SessionStorage (default: true)
	 */
	clearMeetingContext(clearSessionStorage = true): void {
		this.roomMemberContextService.clearContext();
		this.clearContext();

		if (clearSessionStorage) {
			this.sessionStorageService.clearMeetingData();
		}
	}

	/**
	 * Clears the meeting context
	 */
	private clearContext(): void {
		this._roomId.set(undefined);
		this.roomAccessLinkService.clear();
		this._roomSecret.set(undefined);
		this._e2eeKey.set('');
		this._isE2eeKeyFromUrl.set(false);
		this._hasRecordings.set(false);
		this._isActiveMeeting.set(false);
		this._endedBySelf.set(false);
		this._meetingStartedAt.set(undefined);
		this._meetingEndsAt.set(undefined);
	}
}
