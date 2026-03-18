import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { ParticipantService, Room, ViewportService } from 'openvidu-components-angular';
import { GlobalConfigService } from '../../../shared/services/global-config.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { RoomFeatureService } from '../../rooms/services/room-feature.service';
import { CustomParticipantModel } from '../models';
import { MeetingAccessLinkService } from './meeting-access-link.service';

/**
 * Central service for managing meeting context and state during the MEETING PHASE.
 *
 * This service is the SINGLE SOURCE OF TRUTH for all meeting-related state once a participant has joined.
 */
@Injectable({
	providedIn: 'root'
})
export class MeetingContextService {
	private readonly ovParticipantService = inject(ParticipantService);
	private readonly roomFeatureService = inject(RoomFeatureService);
	private readonly globalConfigService = inject(GlobalConfigService);
	private readonly viewportService = inject(ViewportService);
	private readonly sessionStorageService = inject(SessionStorageService);
	private readonly meetingAccessLinkService = inject(MeetingAccessLinkService);

	private readonly _roomId = signal<string | undefined>(undefined);
	private readonly _roomSecret = signal<string | undefined>(undefined);
	private readonly _e2eeKey = signal<string>('');
	private readonly _isE2eeKeyFromUrl = signal<boolean>(false);
	private readonly _hasRecordings = signal<boolean>(false);
	private readonly _isActiveMeeting = signal<boolean>(false);
	private readonly _meetingEndedBy = signal<'self' | 'other' | null>(null);
	private readonly _lkRoom = signal<Room | undefined>(undefined);
	private readonly _localParticipant = signal<CustomParticipantModel | undefined>(undefined);
	private readonly _remoteParticipants = signal<CustomParticipantModel[]>([]);

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
	/** Readonly signal for who ended the meeting ('self', 'other', or null) */
	readonly meetingEndedBy = this._meetingEndedBy.asReadonly();
	/** Readonly signal for whether the meeting is active */
	readonly isActiveMeeting = this._isActiveMeeting.asReadonly();

	/** Readonly signal for the current LiveKit room */
	readonly lkRoom = this._lkRoom.asReadonly();
	/** Readonly signal for the local participant */
	readonly localParticipant = this._localParticipant.asReadonly();
	/** Readonly signal for the remote participants */
	readonly remoteParticipants = this._remoteParticipants.asReadonly();
	/** Computed signal that combines local and remote participants */
	readonly allParticipants = computed(() => {
		const local = this._localParticipant();
		const remotes = this._remoteParticipants();
		return local ? [local, ...remotes] : remotes;
	});

	/** Readonly signal for meeting features */
	readonly meetingUI = this.roomFeatureService.features;
	/** Readonly signal for room appearance configuration from global settings */
	readonly meetingAppearance = this.globalConfigService.roomAppearanceConfig;

	/** Readonly signal for whether the device is mobile */
	readonly isMobile = this.viewportService.isMobile;

	constructor() {
		// Setup automatic synchronization with ParticipantService signals
		this.setupParticipantSynchronization();
	}

	/**
	 * Sets the room ID in context
	 * @param roomId The room ID
	 */
	setRoomId(roomId: string): void {
		this._roomId.set(roomId);
	}

	/**
	 * Sets the room secret in context
	 * @param secret The room secret
	 * @param updateStorage Whether to persist in SessionStorage (default: false)
	 */
	setRoomSecret(secret: string, updateStorage = false): void {
		if (updateStorage) {
			this.sessionStorageService.setRoomSecret(secret);
		}

		this._roomSecret.set(secret);
	}

	/**
	 * Stores the E2EE key in context
	 * @param key The E2EE key
	 * @param fromUrl Whether the key came from a URL parameter (default: false)
	 */
	setE2eeKey(key: string, fromUrl = false): void {
		this.sessionStorageService.setE2EEData(key, fromUrl);
		this._e2eeKey.set(key);
		this._isE2eeKeyFromUrl.set(fromUrl);
	}

	/**
	 * Loads the E2EE key data from session storage
	 */
	loadE2eeKeyFromStorage(): void {
		const e2eeData = this.sessionStorageService.getE2EEData();
		if (e2eeData) {
			this._e2eeKey.set(e2eeData.key);
			this._isE2eeKeyFromUrl.set(e2eeData.fromUrl);
		}
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
	 * Sets who ended the meeting
	 * @param by 'self' if ended by this user, 'other' if ended by someone else
	 */
	setMeetingEndedBy(by: 'self' | 'other' | null): void {
		this._meetingEndedBy.set(by);
	}

	/**
	 * Sets the LiveKit Room instance in context
	 * @param room
	 */
	setLkRoom(room: Room) {
		this._lkRoom.set(room);
	}

	/**
	 * Synchronizes participants from OpenVidu Components ParticipantService using signals.
	 * Effects are automatically cleaned up when the service is destroyed.
	 */
	private setupParticipantSynchronization(): void {
		// Sync local participant signal
		effect(() => {
			const localParticipant = this.ovParticipantService.localParticipantSignal();
			this._localParticipant.set(localParticipant as CustomParticipantModel);
		});

		// Sync remote participants signal
		effect(() => {
			const remoteParticipants = this.ovParticipantService.remoteParticipantsSignal();
			this._remoteParticipants.set(remoteParticipants as CustomParticipantModel[]);
		});
	}

	/**
	 * Clears the meeting context
	 */
	clearContext(): void {
		this._roomId.set(undefined);
		this.meetingAccessLinkService.clear();
		this._roomSecret.set(undefined);
		this._e2eeKey.set('');
		this._isE2eeKeyFromUrl.set(false);
		this._hasRecordings.set(false);
		this._isActiveMeeting.set(false);
		this._meetingEndedBy.set(null);
		this._lkRoom.set(undefined);
		this._localParticipant.set(undefined);
		this._remoteParticipants.set([]);
	}
}
