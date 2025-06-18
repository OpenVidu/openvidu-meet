import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import { LoggerService } from 'openvidu-components-angular';
import {
	MeetRoomPreferences,
	GlobalPreferences,
	OpenViduMeetPermissions,
	ParticipantRole,
	RecordingPermissions
} from '../../typings/ce';
import { GlobalPreferencesService } from '../../services';

/**
 * Interface that defines all available features in the application
 */
export interface ApplicationFeatures {
	// Video Room Features
	videoEnabled: boolean;
	audioEnabled: boolean;
	showMicrophone: boolean;
	showCamera: boolean;
	showScreenShare: boolean;
	showPrejoin: boolean;

	// Communication Features
	showChat: boolean;
	showRecording: boolean;
	showBackgrounds: boolean;

	// UI Features
	showParticipantList: boolean;
	showSettings: boolean;
	showFullscreen: boolean;

	// Admin Features
	canModerateRoom: boolean;
	canManageRecordings: boolean;
	canAccessConsole: boolean;

	// Recording Features
	canDeleteRecordings: boolean;
	canRetrieveRecordings: boolean;
}

/**
 * Base configuration for default features
 */
const DEFAULT_FEATURES: ApplicationFeatures = {
	videoEnabled: true,
	audioEnabled: true,
	showMicrophone: true,
	showCamera: true,
	showScreenShare: true,
	showPrejoin: true,
	showChat: true,
	showRecording: true,
	showBackgrounds: true,
	showParticipantList: true,
	showSettings: true,
	showFullscreen: true,
	canModerateRoom: false,
	canManageRecordings: false,
	canAccessConsole: false,
	canDeleteRecordings: false,
	canRetrieveRecordings: false
};

/**
 * Centralized service to manage feature configuration
 * based on global preferences, room preferences, and participant permissions
 */
@Injectable({
	providedIn: 'root'
})
export class FeatureConfigurationService {
	protected log;

	// Subjects to handle reactive state
	protected globalPreferencesSubject = new BehaviorSubject<GlobalPreferences | null>(null);
	protected roomPreferencesSubject = new BehaviorSubject<MeetRoomPreferences | null>(null);
	protected participantPermissionsSubject = new BehaviorSubject<OpenViduMeetPermissions | null>(null);
	protected recordingPermissionsSubject = new BehaviorSubject<RecordingPermissions | null>(null);
	protected participantRoleSubject = new BehaviorSubject<ParticipantRole | null>(null);

	// Observable that combines all configurations
	public readonly features$: Observable<ApplicationFeatures>;

	constructor(
		protected loggerService: LoggerService,
		protected globalPreferencesService: GlobalPreferencesService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - FeatureConfigurationService');

		// Configure the combined observable
		this.features$ = combineLatest([
			this.globalPreferencesSubject.asObservable(),
			this.roomPreferencesSubject.asObservable(),
			this.participantPermissionsSubject.asObservable(),
			this.recordingPermissionsSubject.asObservable(),
			this.participantRoleSubject.asObservable()
		]).pipe(
			map(([globalPrefs, roomPrefs, participantPerms, recordingPerms, role]) =>
				this.calculateFeatures(globalPrefs, roomPrefs, participantPerms, recordingPerms, role)
			)
		);
	}

	/**
	 * Updates global preferences
	 */
	setGlobalPreferences(preferences: GlobalPreferences | null): void {
		this.log.d('Updating global preferences', preferences);
		this.globalPreferencesSubject.next(preferences);
	}

	/**
	 * Updates room preferences
	 */
	setRoomPreferences(preferences: MeetRoomPreferences | null): void {
		this.log.d('Updating room preferences', preferences);
		this.roomPreferencesSubject.next(preferences);
	}

	/**
	 * Updates participant permissions
	 */
	setParticipantPermissions(permissions: OpenViduMeetPermissions | null): void {
		this.log.d('Updating participant permissions', permissions);
		this.participantPermissionsSubject.next(permissions);
	}

	/**
	 * Updates recording permissions
	 */
	setRecordingPermissions(permissions: RecordingPermissions | null): void {
		this.log.d('Updating recording permissions', permissions);
		this.recordingPermissionsSubject.next(permissions);
	}

	/**
	 * Updates participant role
	 */
	setParticipantRole(role: ParticipantRole | null): void {
		this.log.d('Updating participant role', role);
		this.participantRoleSubject.next(role);
	}

	/**
	 * Gets the current feature configuration synchronously
	 */
	getCurrentFeatures(): ApplicationFeatures {
		return this.calculateFeatures(
			this.globalPreferencesSubject.value,
			this.roomPreferencesSubject.value,
			this.participantPermissionsSubject.value,
			this.recordingPermissionsSubject.value,
			this.participantRoleSubject.value
		);
	}

	/**
	 * Checks if a specific feature is enabled
	 */
	isFeatureEnabled(featureName: keyof ApplicationFeatures): boolean {
		return this.getCurrentFeatures()[featureName];
	}

	/**
	 * Core logic to calculate features based on all configurations
	 */
	protected calculateFeatures(
		globalPrefs: GlobalPreferences | null,
		roomPrefs: MeetRoomPreferences | null,
		participantPerms: OpenViduMeetPermissions | null,
		recordingPerms: RecordingPermissions | null,
		role: ParticipantRole | null
	): ApplicationFeatures {
		// Start with default configuration
		const features: ApplicationFeatures = { ...DEFAULT_FEATURES };

		// Apply global preferences restrictions
		if (globalPrefs) {
		}

		// Apply room configurations
		if (roomPrefs) {
			features.showChat = roomPrefs.chatPreferences.enabled;
			features.showRecording = roomPrefs.recordingPreferences.enabled && role === ParticipantRole.MODERATOR;
			features.showBackgrounds = roomPrefs.virtualBackgroundPreferences.enabled;
		}

		// Apply participant permissions (these can restrict enabled features)
		if (participantPerms) {
			// Only restrict if the feature is already enabled
			if (features.showChat) {
				features.showChat = participantPerms.canChat;
			}
			if (features.showRecording) {
				features.showRecording = participantPerms.canRecord;
			}
			if (features.showBackgrounds) {
				features.showBackgrounds = participantPerms.canChangeVirtualBackground;
			}
			if (features.showScreenShare) {
				features.showScreenShare = participantPerms.canPublishScreen;
			}
		}

		if (recordingPerms) {
			// Apply recording permissions
			features.canDeleteRecordings = recordingPerms.canDeleteRecordings;
			features.canRetrieveRecordings = recordingPerms.canRetrieveRecordings;
		}

		// Apply role-based configurations
		if (role) {
			features.canModerateRoom = role === ParticipantRole.MODERATOR;
			features.canManageRecordings = role === ParticipantRole.MODERATOR;
			features.canAccessConsole = role === ParticipantRole.MODERATOR;
		}

		this.log.d('Calculated features', features);
		return features;
	}

	/**
	 * Loads initial preferences from services
	 */
	async initializeConfiguration(): Promise<void> {
		try {
			this.log.d('Initializing feature configuration');

			// Load global preferences if available
			// (this will depend on your GlobalPreferencesService implementation)
		} catch (error) {
			this.log.e('Error initializing feature configuration', error);
		}
	}

	/**
	 * Resets all configurations to their initial values
	 */
	reset(): void {
		this.globalPreferencesSubject.next(null);
		this.roomPreferencesSubject.next(null);
		this.participantPermissionsSubject.next(null);
		this.participantRoleSubject.next(null);
	}
}
