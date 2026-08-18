import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { MeetAppearanceConfig, MeetRoomConfig, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { GlobalConfigService } from '../../../shared/services/global-config.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { InitialMediaEnabledPreferences, RoomFeatures } from '../models/features.model';
import { FeatureCalculator } from '../utils/features.utils';
import { LoggerService } from '../../../shared/services/logger.service';
import type { ILogger } from '../../../shared/models/logger.model';

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
	showViewRecordings: true,
	showFullscreen: true,
	showBackgrounds: true,
	showCaptionsControls: true,
	showCaptionsControlsDisabled: false,
	showChat: true,
	showChatInput: true,
	showParticipantList: true,
	showSettings: true,
	showThemeSelector: true,
	showLayoutSelector: true,
	showShareAccessLinks: false,
	showEndMeeting: false,
	showMakeModerator: false,
	showKickParticipants: false,
	showJoinMeeting: true
};

/**
 * Service responsible for calculating and providing the current set of enabled features in the meeting
 * based on room configuration, user permissions, and global settings.
 * This service acts as a single source of truth for feature availability across the app.
 */
@Service()
export class RoomFeatureService {
	protected log: ILogger = inject(LoggerService).get('OpenVidu Meet - RoomFeatureService');
	protected globalConfigService = inject(GlobalConfigService);
	protected roomMemberContextService = inject(RoomMemberContextService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);

	// Signals to handle reactive state
	protected roomConfig = signal<MeetRoomConfig | undefined>(undefined);
	// Client preference from the initial-audio-enabled / initial-video-enabled embed attributes (and
	// their URL query params): the participant's initial media state, not a permission.
	protected initialMediaEnabled = signal<InitialMediaEnabledPreferences>({ audioEnabled: true, videoEnabled: true });
	permissions = this.roomMemberContextService.permissions;

	// Computed signal to derive features based on current configurations
	public readonly features = computed<RoomFeatures>(() =>
		this.calculateFeatures(
			this.roomConfig(),
			this.permissions(),
			this.globalConfigService.roomAppearanceConfig(),
			this.globalConfigService.captionsGlobalEnabled(),
			this.initialMediaEnabled()
		)
	);

	/**
	 * Loads global feature configuration once the service is ready for requests.
	 * This ensures HTTP requests don't fire with an empty URL (race condition in webcomponent mode).
	 */
	private readonly loadConfigEffect = effect(() => {
		if (this.runtimeConfigService.isReadyForRequests()) {
			untracked(() => {
				void this.loadGlobalFeatureConfigs();
			});
		}
	});

	/**
	 * Updates room config
	 */
	setRoomConfig(config: MeetRoomConfig): void {
		this.log.d('Updating room config', config);
		this.roomConfig.set(config);
	}

	/**
	 * Updates the initial media state the embedding application asked for (initial-audio-enabled /
	 * initial-video-enabled). It only lowers the initial state — the permissions always win — and
	 * the participant may re-enable the device afterwards.
	 */
	setInitialMediaEnabled(preferences: InitialMediaEnabledPreferences): void {
		this.log.d('Updating initial media enabled preferences', preferences);
		this.initialMediaEnabled.set(preferences);
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
		captionsGlobalEnabled = false,
		initialMediaEnabled?: InitialMediaEnabledPreferences
	): RoomFeatures {
		const features = structuredClone(DEFAULT_FEATURES);

		if (roomConfig) {
			FeatureCalculator.applyRoomConfig(features, roomConfig, captionsGlobalEnabled);
		}

		if (permissions) {
			FeatureCalculator.applyPermissions(features, permissions);
		}

		if (initialMediaEnabled) {
			FeatureCalculator.applyInitialMediaEnabled(features, initialMediaEnabled);
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
