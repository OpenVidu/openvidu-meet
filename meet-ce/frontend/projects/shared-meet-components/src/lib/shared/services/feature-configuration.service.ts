import { computed, Injectable, signal } from '@angular/core';
import {
	MeetAppearanceConfig,
	MeetRoomCaptionsConfig,
	MeetRoomConfig,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	TrackSource
} from '@openvidu-meet/typings';
import { LoggerService } from 'openvidu-components-angular';
import { ApplicationFeatures, CaptionsStatus } from '../models/app.model';

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
	captionsStatus: 'ENABLED',
	showParticipantList: true,
	showSettings: true,
	showFullscreen: true,
	showThemeSelector: true,
	allowLayoutSwitching: true,

	canModerateRoom: false,
	canRecordRoom: false,
	canRetrieveRecordings: false,

	hasCustomTheme: false,
	themeConfig: undefined
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

	private normalizeTrackSource(source: unknown): TrackSource | undefined {
		if (typeof source === 'number') {
			return source as TrackSource;
		}

		if (typeof source !== 'string') {
			return undefined;
		}

		switch (source.toUpperCase()) {
			case 'CAMERA':
				return TrackSource.CAMERA;
			case 'MICROPHONE':
				return TrackSource.MICROPHONE;
			case 'SCREEN_SHARE':
				return TrackSource.SCREEN_SHARE;
			case 'SCREEN_SHARE_AUDIO':
				return TrackSource.SCREEN_SHARE_AUDIO;
			default:
				return undefined;
		}
	}

	// Signals to handle reactive
	protected roomConfig = signal<MeetRoomConfig | undefined>(undefined);
	protected roomMemberRole = signal<MeetRoomMemberRole | undefined>(undefined);
	protected roomMemberPermissions = signal<MeetRoomMemberPermissions | undefined>(undefined);
	protected appearanceConfig = signal<MeetAppearanceConfig | undefined>(undefined);
	protected captionsGlobalConfig = signal<boolean>(false);

	// Computed signal to derive features based on current configurations
	public readonly features = computed<ApplicationFeatures>(() =>
		this.calculateFeatures(
			this.roomConfig(),
			this.roomMemberRole(),
			this.roomMemberPermissions(),
			this.appearanceConfig(),
			this.captionsGlobalConfig()
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
	 * Updates room member role
	 */
	setRoomMemberRole(role: MeetRoomMemberRole): void {
		this.log.d('Updating room member role', role);
		this.roomMemberRole.set(role);
	}

	/**
	 * Updates room member permissions
	 */
	setRoomMemberPermissions(permissions: MeetRoomMemberPermissions): void {
		this.log.d('Updating room member permissions', permissions);
		this.roomMemberPermissions.set(permissions);
	}

	/**
	 * Updates appearance config
	 */
	setAppearanceConfig(config: MeetAppearanceConfig): void {
		this.log.d('Updating appearance config', config);
		this.appearanceConfig.set(config);
	}

	/**
	 * Updates captions global config
	 */
	setCaptionsGlobalConfig(enabled: boolean): void {
		this.log.d('Updating captions global config', enabled);
		this.captionsGlobalConfig.set(enabled);
	}

	/**
	 * Core logic to calculate features based on all configurations
	 */
	protected calculateFeatures(
		roomConfig?: MeetRoomConfig,
		role?: MeetRoomMemberRole,
		permissions?: MeetRoomMemberPermissions,
		appearanceConfig?: MeetAppearanceConfig,
		captionsGlobalEnabled: boolean = false
	): ApplicationFeatures {
		// Start with default configuration
		const features: ApplicationFeatures = { ...DEFAULT_FEATURES };

		// Apply room configurations
		if (roomConfig) {
			features.showRecordingPanel = roomConfig.recording.enabled;
			features.showChat = roomConfig.chat.enabled;
			features.showBackgrounds = roomConfig.virtualBackground.enabled;
			features.captionsStatus = this.computeCaptionsStatus(roomConfig.captions, captionsGlobalEnabled);
		}

		// Apply room member permissions (these can restrict enabled features)
		if (permissions) {
			// Only restrict if the feature is already enabled
			if (features.showRecordingPanel) {
				features.canRecordRoom = permissions.meet.canRecord;
				features.canRetrieveRecordings = permissions.meet.canRetrieveRecordings;
			}
			if (features.showChat) {
				features.showChat = permissions.meet.canChat;
			}
			if (features.showBackgrounds) {
				features.showBackgrounds = permissions.meet.canChangeVirtualBackground;
			}
			// Media features
			const canPublish = permissions.livekit.canPublish;
			const canPublishSources = permissions.livekit.canPublishSources ?? [];
			const normalizedPublishSources = canPublishSources
				.map((source) => this.normalizeTrackSource(source))
				.filter((source): source is TrackSource => source !== undefined);
			const hasSourceRestrictions = normalizedPublishSources.length > 0;
			features.videoEnabled = hasSourceRestrictions
				? normalizedPublishSources.includes(TrackSource.CAMERA)
				: !!canPublish;
			features.audioEnabled = hasSourceRestrictions
				? normalizedPublishSources.includes(TrackSource.MICROPHONE)
				: !!canPublish;
			features.showCamera = features.videoEnabled;
			features.showMicrophone = features.audioEnabled;
			features.showScreenShare = hasSourceRestrictions
				? normalizedPublishSources.includes(TrackSource.SCREEN_SHARE)
				: !!canPublish;
		}

		// Apply role-based configurations
		if (role) {
			features.canModerateRoom = role === MeetRoomMemberRole.MODERATOR;
		}

		// Apply appearance configuration
		if (appearanceConfig && appearanceConfig.themes.length > 0) {
			const theme = appearanceConfig.themes[0];
			const hasEnabledTheme = theme.enabled;

			features.hasCustomTheme = hasEnabledTheme;
			features.showThemeSelector = !hasEnabledTheme;

			if (hasEnabledTheme) {
				features.themeConfig = theme;
			}
		}

		this.log.d('Calculated features', features);
		return features;
	}

	/**
	 * Computes the captions status based on room and global configuration
	 * HIDDEN: room config disabled
	 * ENABLED: room config enabled AND global config enabled
	 * DISABLED_WITH_WARNING: room config enabled BUT global config disabled
	 */
	protected computeCaptionsStatus(
		roomCaptionsConfig: MeetRoomCaptionsConfig | undefined,
		globalEnabled: boolean
	): CaptionsStatus {
		if (!roomCaptionsConfig?.enabled) {
			return 'HIDDEN';
		}
		return globalEnabled ? 'ENABLED' : 'DISABLED_WITH_WARNING';
	}

	/**
	 * Resets all configurations to their initial values
	 */
	reset(): void {
		this.roomConfig.set(undefined);
		this.roomMemberRole.set(undefined);
		this.roomMemberPermissions.set(undefined);
		this.appearanceConfig.set(undefined);
		this.captionsGlobalConfig.set(false);
	}
}
