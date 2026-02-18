import { computed, inject, Injectable, signal } from '@angular/core';
import { MeetAppearanceConfig, MeetRoomConfig, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { LoggerService } from 'openvidu-components-angular';
import { GlobalConfigService } from '../../../shared/services/global-config.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomFeatures } from '../models/features.model';
import { FeatureCalculator } from '../utils/features.utils';

/**
 * Base configuration for features, used as a starting point before applying room-specific and user-specific configurations
 */
const DEFAULT_FEATURES: RoomFeatures = {
	videoEnabled: true,
	audioEnabled: true,
	showCamera: true,
	showMicrophone: true,
	showScreenShare: true,
	showStartStopRecording: true,
	showChat: true,
	showBackgrounds: true,
	showParticipantList: true,
	showSettings: true,
	showFullscreen: true,
	showThemeSelector: true,
	showLayoutSelector: true,
	showCaptionsControls: true,
	showCaptionsControlsDisabled: false,
	showShareAccessLinks: true,
	showMakeModerator: false,
	showEndMeeting: false,
	showKickParticipants: false,
	showViewRecordings: true,
	showJoinMeeting: true
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
	permissions = this.roomMemberContextService.permissions;

	// Computed signal to derive features based on current configurations
	public readonly features = computed<RoomFeatures>(() =>
		this.calculateFeatures(
			this.roomConfig(),
			this.permissions(),
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
		permissions?: MeetRoomMemberPermissions,
		appearanceConfig?: MeetAppearanceConfig,
		captionsGlobalEnabled: boolean = false
	): RoomFeatures {
		const features = structuredClone(DEFAULT_FEATURES);

		if (roomConfig) {
			FeatureCalculator.applyRoomConfig(features, roomConfig, captionsGlobalEnabled);
		}

		if (permissions) {
			FeatureCalculator.applyPermissions(features, permissions);
		}

		if (appearanceConfig) {
			FeatureCalculator.applyAppearanceConfig(features, appearanceConfig);
		}

		this.log.d('Calculated features', features);
		return features;
	}

	/**
	 * Resets all configurations to their initial values
	 */
	reset(): void {
		this.roomConfig.set(undefined);
	}
}
