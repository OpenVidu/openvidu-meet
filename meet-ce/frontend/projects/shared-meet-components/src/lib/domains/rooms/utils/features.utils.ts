import {
	MeetAppearanceConfig,
	MeetRoomCaptionsConfig,
	MeetRoomConfig,
	MeetRoomMemberPermissions
} from '@openvidu-meet/typings';
import { CaptionsStatus, InitialMediaMutedPreferences, RoomFeatures } from '../models/features.model';

/**
 * Utility class responsible for calculating the enabled features in the meeting based on room configuration, participant permissions, and global appearance settings.
 * This class provides static methods to apply different layers of configuration to derive the final set of features that should be available in the UI.
 */
export class FeatureCalculator {
	static applyRoomConfig(features: RoomFeatures, roomConfig: MeetRoomConfig, captionsGlobalEnabled: boolean): void {
		features.showStartStopRecording = roomConfig.recording.enabled;
		features.showChat = roomConfig.chat.enabled;
		features.showBackgrounds = roomConfig.virtualBackground.enabled;
		const captionsStatus = this.computeCaptionsStatus(roomConfig.captions, captionsGlobalEnabled);
		features.showCaptionsControls = captionsStatus !== 'HIDDEN';
		features.showCaptionsControlsDisabled = captionsStatus === 'DISABLED_WITH_WARNING';
	}

	static applyPermissions(features: RoomFeatures, permissions: MeetRoomMemberPermissions): void {
		// Recording
		if (features.showStartStopRecording) {
			features.showStartStopRecording = permissions.recordingControl;
		}

		// Chat: chatRead gates the whole panel; chatWrite gates the message input within it.
		if (features.showChat) {
			features.showChat = permissions.chatRead;
		}

		// The input is writable only when the chat is visible AND the member may write.
		features.showChatInput = features.showChat && permissions.chatWrite;

		// Backgrounds
		if (features.showBackgrounds) {
			features.showBackgrounds = permissions.mediaChangeVirtualBackground;
		}

		// Media features
		features.videoEnabled = permissions.mediaPublishVideo;
		features.showCamera = permissions.mediaPublishVideo;
		features.audioEnabled = permissions.mediaPublishAudio;
		features.showMicrophone = permissions.mediaPublishAudio;
		features.showScreenShare = permissions.mediaShareScreen;
		features.showShareAccessLinks = permissions.roomShareAccessLinks;
		features.showMakeModerator = permissions.participantPromote;
		features.showEndMeeting = permissions.meetingEnd;
		features.showKickParticipants = permissions.participantKick;
		features.showViewRecordings = permissions.recordingList;
		features.showJoinMeeting = permissions.meetingJoin;
	}

	/**
	 * Applies the embedding application's initial media state (initial-audio-muted /
	 * initial-video-muted). It only ever lowers `audioEnabled`/`videoEnabled`, so a permission
	 * that already denies the device always wins, and it leaves the `show*` controls untouched:
	 * this is the initial state, not a capability — the participant may re-enable the device.
	 */
	static applyInitialMediaMuted(features: RoomFeatures, initialMediaMuted: InitialMediaMutedPreferences): void {
		if (initialMediaMuted.audioMuted) {
			features.audioEnabled = false;
		}

		if (initialMediaMuted.videoMuted) {
			features.videoEnabled = false;
		}
	}

	static applyAppearanceConfig(features: RoomFeatures, appearanceConfig: MeetAppearanceConfig): void {
		if (appearanceConfig?.themes.length > 0 && appearanceConfig.themes[0].enabled) {
			features.showThemeSelector = false;
		}
	}

	/**
	 * Computes the captions status based on room and global configuration
	 * HIDDEN: room config disabled
	 * ENABLED: room config enabled AND global config enabled
	 * DISABLED_WITH_WARNING: room config enabled BUT global config disabled
	 */
	protected static computeCaptionsStatus(
		roomCaptionsConfig: MeetRoomCaptionsConfig,
		globalEnabled: boolean
	): CaptionsStatus {
		if (!roomCaptionsConfig.enabled) {
			return 'HIDDEN';
		}

		return globalEnabled ? 'ENABLED' : 'DISABLED_WITH_WARNING';
	}
}
