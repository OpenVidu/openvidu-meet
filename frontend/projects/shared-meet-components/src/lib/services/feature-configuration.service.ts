import { computed, Injectable, signal } from '@angular/core';
import { MeetRoomPreferences, ParticipantPermissions, ParticipantRole } from '@lib/typings/ce';
import { LoggerService } from 'openvidu-components-angular';

/**
 * Interface that defines all available features in the application
 */
export interface ApplicationFeatures {
	// Media Features
	videoEnabled: boolean;
	audioEnabled: boolean;
	showMicrophone: boolean;
	showCamera: boolean;
	showScreenShare: boolean;

	// UI Features
	showChat: boolean;
	showRecording: boolean;
	showBackgrounds: boolean;
	showParticipantList: boolean;
	showSettings: boolean;
	showFullscreen: boolean;

	// Admin Features
	canModerateRoom: boolean;
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
	showChat: true,
	showRecording: true,
	showBackgrounds: true,
	showParticipantList: true,
	showSettings: true,
	showFullscreen: true,
	canModerateRoom: false
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
			features.showChat = roomPrefs.chatPreferences.enabled;
			features.showRecording = roomPrefs.recordingPreferences.enabled;
			features.showBackgrounds = roomPrefs.virtualBackgroundPreferences.enabled;
		}

		// Apply participant permissions (these can restrict enabled features)
		if (participantPerms) {
			// Only restrict if the feature is already enabled
			if (features.showChat) {
				features.showChat = participantPerms.openvidu.canChat;
			}
			if (features.showRecording) {
				features.showRecording = participantPerms.openvidu.canRecord;
			}
			if (features.showBackgrounds) {
				features.showBackgrounds = participantPerms.openvidu.canChangeVirtualBackground;
			}
			if (features.showScreenShare) {
				features.showScreenShare = participantPerms.openvidu.canPublishScreen;
			}

			// Check if the participant can publish media
			const canPublish = participantPerms.livekit.canPublish ?? true;
			features.videoEnabled = canPublish;
			features.audioEnabled = canPublish;
			features.showMicrophone = canPublish;
			features.showCamera = canPublish;
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
