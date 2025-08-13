import { computed, Injectable, signal } from '@angular/core';
import { MeetRoomPreferences, ParticipantPermissions, ParticipantRole, TrackSource } from '@lib/typings/ce';
import { LoggerService } from 'openvidu-components-angular';

/**
 * Interface that defines all available features in the application
 */
export interface ApplicationFeatures {
	// Media Features
	videoEnabled: boolean;
	audioEnabled: boolean;
	showCamera: boolean;
	showMicrophone: boolean;
	showScreenShare: boolean;

	// UI Features
	showRecordings: boolean;
	showChat: boolean;
	showBackgrounds: boolean;
	showParticipantList: boolean;
	showSettings: boolean;
	showFullscreen: boolean;

	// Permissions
	canModerateRoom: boolean;
	canRecordRoom: boolean;
}

/**
 * Base configuration for default features
 */
const DEFAULT_FEATURES: ApplicationFeatures = {
	videoEnabled: true,
	audioEnabled: true,
	showCamera: true,
	showMicrophone: true,
	showScreenShare: true,

	showRecordings: true,
	showChat: true,
	showBackgrounds: true,
	showParticipantList: true,
	showSettings: true,
	showFullscreen: true,

	canModerateRoom: false,
	canRecordRoom: false
};

/**
 * Centralized service to manage feature configuration
 * based on room preferences and participant permissions
 */
@Injectable({
	providedIn: 'root'
})
export class FeatureConfigurationService {
	protected log;

	// Signals to handle reactive
	protected roomPreferences = signal<MeetRoomPreferences | undefined>(undefined);
	protected participantPermissions = signal<ParticipantPermissions | undefined>(undefined);
	protected participantRole = signal<ParticipantRole | undefined>(undefined);

	// Computed signal to derive features based on current configurations
	public readonly features = computed<ApplicationFeatures>(() =>
		this.calculateFeatures(this.roomPreferences(), this.participantPermissions(), this.participantRole())
	);

	constructor(protected loggerService: LoggerService) {
		this.log = this.loggerService.get('OpenVidu Meet - FeatureConfigurationService');
	}

	/**
	 * Updates room preferences
	 */
	setRoomPreferences(preferences: MeetRoomPreferences): void {
		this.log.d('Updating room preferences', preferences);
		this.roomPreferences.set(preferences);
	}

	/**
	 * Updates participant permissions
	 */
	setParticipantPermissions(permissions: ParticipantPermissions): void {
		this.log.d('Updating participant permissions', permissions);
		this.participantPermissions.set(permissions);
	}

	/**
	 * Updates participant role
	 */
	setParticipantRole(role: ParticipantRole): void {
		this.log.d('Updating participant role', role);
		this.participantRole.set(role);
	}

	/**
	 * Checks if a specific feature is enabled
	 */
	isFeatureEnabled(featureName: keyof ApplicationFeatures): boolean {
		return this.features()[featureName];
	}

	/**
	 * Core logic to calculate features based on all configurations
	 */
	protected calculateFeatures(
		roomPrefs?: MeetRoomPreferences,
		participantPerms?: ParticipantPermissions,
		role?: ParticipantRole
	): ApplicationFeatures {
		// Start with default configuration
		const features: ApplicationFeatures = { ...DEFAULT_FEATURES };

		// Apply room configurations
		if (roomPrefs) {
			features.showRecordings = roomPrefs.recordingPreferences.enabled;
			features.showChat = roomPrefs.chatPreferences.enabled;
			features.showBackgrounds = roomPrefs.virtualBackgroundPreferences.enabled;
		}

		// Apply participant permissions (these can restrict enabled features)
		if (participantPerms) {
			// Only restrict if the feature is already enabled
			if (features.showRecordings) {
				// features.showRecordings = !!recordingRole;
				features.canRecordRoom = participantPerms.openvidu.canRecord;
			}
			if (features.showChat) {
				features.showChat = participantPerms.openvidu.canChat;
			}
			if (features.showBackgrounds) {
				features.showBackgrounds = participantPerms.openvidu.canChangeVirtualBackground;
			}

			// Media features
			const canPublish = participantPerms.livekit.canPublish;
			const canPublishSources = participantPerms.livekit.canPublishSources ?? [];
			features.videoEnabled = canPublish || canPublishSources.includes(TrackSource.CAMERA);
			features.audioEnabled = canPublish || canPublishSources.includes(TrackSource.MICROPHONE);
			features.showCamera = features.videoEnabled;
			features.showMicrophone = features.audioEnabled;
			features.showScreenShare = canPublish || canPublishSources.includes(TrackSource.SCREEN_SHARE);
		}

		// Apply role-based configurations
		if (role) {
			features.canModerateRoom = role === ParticipantRole.MODERATOR;
		}

		this.log.d('Calculated features', features);
		return features;
	}

	/**
	 * Resets all configurations to their initial values
	 */
	reset(): void {
		this.roomPreferences.set(undefined);
		this.participantPermissions.set(undefined);
		this.participantRole.set(undefined);
	}
}
