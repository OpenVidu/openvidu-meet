import { computed, Injectable, signal } from '@angular/core';
import {
	MeetRoomConfig,
	ParticipantPermissions,
	ParticipantRole,
	RecordingPermissions,
	TrackSource
} from '@lib/typings/ce';
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
	showRecordingPanel: boolean;
	showChat: boolean;
	showBackgrounds: boolean;
	showParticipantList: boolean;
	showSettings: boolean;
	showFullscreen: boolean;

	// Permissions
	canModerateRoom: boolean;
	canRecordRoom: boolean;
	canRetrieveRecordings: boolean;
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

	showRecordingPanel: true,
	showChat: true,
	showBackgrounds: true,
	showParticipantList: true,
	showSettings: true,
	showFullscreen: true,

	canModerateRoom: false,
	canRecordRoom: false,
	canRetrieveRecordings: false
};

/**
 * Centralized service to manage feature configuration
 * based on room config and participant permissions
 */
@Injectable({
	providedIn: 'root'
})
export class FeatureConfigurationService {
	protected log;

	// Signals to handle reactive
	protected roomConfig = signal<MeetRoomConfig | undefined>(undefined);
	protected participantPermissions = signal<ParticipantPermissions | undefined>(undefined);
	protected participantRole = signal<ParticipantRole | undefined>(undefined);
	protected recordingPermissions = signal<RecordingPermissions | undefined>(undefined);

	// Computed signal to derive features based on current configurations
	public readonly features = computed<ApplicationFeatures>(() =>
		this.calculateFeatures(
			this.roomConfig(),
			this.participantPermissions(),
			this.participantRole(),
			this.recordingPermissions()
		)
	);

	constructor(protected loggerService: LoggerService) {
		this.log = this.loggerService.get('OpenVidu Meet - FeatureConfigurationService');
	}

	/**
	 * Updates room config
	 */
	setRoomConfig(config: MeetRoomConfig): void {
		this.log.d('Updating room config', config);
		this.roomConfig.set(config);
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
	 * Updates recording permissions
	 */
	setRecordingPermissions(permissions: RecordingPermissions): void {
		this.log.d('Updating recording permissions', permissions);
		this.recordingPermissions.set(permissions);
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
		roomConfig?: MeetRoomConfig,
		participantPerms?: ParticipantPermissions,
		role?: ParticipantRole,
		recordingPerms?: RecordingPermissions
	): ApplicationFeatures {
		// Start with default configuration
		const features: ApplicationFeatures = { ...DEFAULT_FEATURES };

		// Apply room configurations
		if (roomConfig) {
			features.showRecordingPanel = roomConfig.recording.enabled;
			features.showChat = roomConfig.chat.enabled;
			features.showBackgrounds = roomConfig.virtualBackground.enabled;
		}

		// Apply participant permissions (these can restrict enabled features)
		if (participantPerms) {
			// Only restrict if the feature is already enabled
			if (features.showRecordingPanel) {
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

		// Apply recording permissions
		if (recordingPerms) {
			features.canRetrieveRecordings = recordingPerms.canRetrieveRecordings;
		}

		this.log.d('Calculated features', features);
		return features;
	}

	/**
	 * Resets all configurations to their initial values
	 */
	reset(): void {
		this.roomConfig.set(undefined);
		this.participantPermissions.set(undefined);
		this.participantRole.set(undefined);
	}
}
