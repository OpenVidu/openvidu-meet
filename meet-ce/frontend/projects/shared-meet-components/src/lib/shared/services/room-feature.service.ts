import { computed, inject, Injectable, signal } from '@angular/core';
import { MeetAppearanceConfig, MeetRoomCaptionsConfig, MeetRoomConfig, MeetRoomMemberPermissions, MeetRoomMemberRole } from '@openvidu-meet/typings';
import { LoggerService } from 'openvidu-components-angular';
import { RoomMemberContextService } from '../../domains/room-members/services/room-member-context.service';
import { CaptionsStatus, RoomFeatures } from '../models/app.model';
import { GlobalConfigService } from './global-config.service';

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
	protected globalConfigService = inject(GlobalConfigService);
	protected roomMemberContextService = inject(RoomMemberContextService);

	// Signals to handle reactive state
	protected roomConfig = signal<MeetRoomConfig | undefined>(undefined);

	// Computed signal to derive features based on current configurations
	public readonly features = computed<RoomFeatures>(() =>
		this.calculateFeatures(
			this.roomConfig(),
			this.roomMemberContextService.role(),
			this.roomMemberContextService.permissions(),
			this.globalConfigService.roomAppearanceConfig(),
			this.globalConfigService.captionsGlobalEnabled()
		)
	);

	constructor(protected loggerService: LoggerService) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomFeatureService');
		void this.loadGlobalFeatureConfigs();
	}

	/**
	 * Updates room config
	 */
	setRoomConfig(config: MeetRoomConfig): void {
		this.log.d('Updating room config', config);
		this.roomConfig.set(config);
	}

	protected async loadGlobalFeatureConfigs(): Promise<void> {
		const [appearanceResult, captionsResult] = await Promise.allSettled([
			this.globalConfigService.loadRoomsAppearanceConfig(),
			this.globalConfigService.loadCaptionsConfig()
		]);

		if (appearanceResult.status === 'rejected') {
			this.log.e('Could not load room appearance config for features:', appearanceResult.reason);
		}
		if (captionsResult.status === 'rejected') {
			this.log.e('Could not load captions config for features:', captionsResult.reason);
		}
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
	}
}
