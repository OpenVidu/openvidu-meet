import { computed, Injectable, signal } from '@angular/core';
import {
	MeetAppearanceConfig,
	MeetRoomCaptionsConfig,
	MeetRoomConfig,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole
} from '@openvidu-meet/typings';
import { LoggerService } from 'openvidu-components-angular';
import { CaptionsStatus, RoomFeatures } from '../models/app.model';

/**
 * Base configuration for features, used as a starting point before applying room-specific and user-specific configurations
 */
const DEFAULT_FEATURES: RoomFeatures = {
	media: {
		videoEnabled: true,
		audioEnabled: true
	},
	ui: {
		showCamera: true,
		showMicrophone: true,
		showScreenShare: true,
		showRecordingPanel: true,
		showChat: true,
		showBackgrounds: true,
		showParticipantList: true,
		showSettings: true,
		showFullscreen: true,
		showThemeSelector: true,
		showLayoutSelector: true,
		captionsStatus: 'ENABLED'
	},
	permissions: {
		canModerateRoom: false,
		canRecordRoom: false,
		canRetrieveRecordings: false
	},
	appearance: {
		hasCustomTheme: false,
		themeConfig: undefined
	}
};

/**
 * Service responsible for calculating and providing the current set of enabled features in the meeting based on room configuration, participant role, permissions, and appearance settings.
 * This service acts as a single source of truth for feature availability across the app.
 */
@Injectable({
	providedIn: 'root'
})
export class RoomFeatureService {
	protected log;

	// Signals to handle reactive state
	protected roomConfig = signal<MeetRoomConfig | undefined>(undefined);
	protected roomMemberRole = signal<MeetRoomMemberRole | undefined>(undefined);
	protected roomMemberPermissions = signal<MeetRoomMemberPermissions | undefined>(undefined);
	protected appearanceConfig = signal<MeetAppearanceConfig | undefined>(undefined);
	protected captionsGlobalConfig = signal<boolean>(false);

	// Computed signal to derive features based on current configurations
	public readonly features = computed<RoomFeatures>(() =>
		this.calculateFeatures(
			this.roomConfig(),
			this.roomMemberRole(),
			this.roomMemberPermissions(),
			this.appearanceConfig(),
			this.captionsGlobalConfig()
		)
	);

	constructor(protected loggerService: LoggerService) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomFeatureService');
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
	): RoomFeatures {
		// Start with default configuration (deep copy per group)
		const features: RoomFeatures = {
			media: { ...DEFAULT_FEATURES.media },
			ui: { ...DEFAULT_FEATURES.ui },
			permissions: { ...DEFAULT_FEATURES.permissions },
			appearance: { ...DEFAULT_FEATURES.appearance }
		};

		// Apply room configurations
		if (roomConfig) {
			features.ui.showRecordingPanel = roomConfig.recording.enabled;
			features.ui.showChat = roomConfig.chat.enabled;
			features.ui.showBackgrounds = roomConfig.virtualBackground.enabled;
			features.ui.captionsStatus = this.computeCaptionsStatus(roomConfig.captions, captionsGlobalEnabled);
		}

		// Apply room member permissions (these can restrict enabled features)
		if (permissions) {
			// Only restrict if the feature is already enabled
			if (features.ui.showRecordingPanel) {
				features.permissions.canRecordRoom = permissions.canRecord;
				features.permissions.canRetrieveRecordings = permissions.canRetrieveRecordings;
			}
			if (features.ui.showChat) {
				features.ui.showChat = permissions.canReadChat;
				// TODO: Handle canWriteChat permissions
			}
			if (features.ui.showBackgrounds) {
				features.ui.showBackgrounds = permissions.canChangeVirtualBackground;
			}
			// Media features
			features.media.videoEnabled = permissions.canPublishVideo;
			features.media.audioEnabled = permissions.canPublishAudio;
			features.ui.showScreenShare = permissions.canShareScreen;
			features.ui.showCamera = features.media.videoEnabled;
			features.ui.showMicrophone = features.media.audioEnabled;
		}

		// Apply role-based configurations
		if (role) {
			features.permissions.canModerateRoom = role === MeetRoomMemberRole.MODERATOR;
		}

		// Apply appearance configuration
		if (appearanceConfig && appearanceConfig.themes.length > 0) {
			const theme = appearanceConfig.themes[0];
			const hasEnabledTheme = theme.enabled;

			features.appearance.hasCustomTheme = hasEnabledTheme;
			features.ui.showThemeSelector = !hasEnabledTheme;

			if (hasEnabledTheme) {
				features.appearance.themeConfig = theme;
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
		roomCaptionsConfig: MeetRoomCaptionsConfig,
		globalEnabled: boolean
	): CaptionsStatus {
		if (!roomCaptionsConfig.enabled) {
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
