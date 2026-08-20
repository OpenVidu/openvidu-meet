import {
	MeetAppearanceConfig,
	MeetRoomCaptionsConfig,
	MeetRoomConfig,
	MeetRoomMemberPermissions
} from '@openvidu-meet/typings';
import type { InitialMediaState } from '../../meeting/openvidu-components';
import { CaptionsStatus, InitialMediaRequest, RoomFeatures } from '../models/features.model';

/**
 * Utility class responsible for calculating the enabled features in the meeting — and the participant's
 * initial media state — from the room configuration, the participant permissions and the global
 * appearance settings.
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
		features.showCamera = permissions.mediaPublishVideo;
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
	 * Precedence, not conjunction: the embedding application's request decides whenever it is set — to
	 * either value, so it can also *raise* a room default of `false` — otherwise the room-wide
	 * `config.initial*Enabled` does, and `true` when neither says anything. The room field is a default,
	 * not a policy: enforcing a device off is the `mediaPublish*` permission's job, and being signed
	 * into the token puts it above the whole chain.
	 */
	static resolveInitialMediaState(
		request: InitialMediaRequest,
		permissions?: MeetRoomMemberPermissions,
		roomConfig?: MeetRoomConfig
	): InitialMediaState {
		return {
			microphone:
				(permissions?.mediaPublishAudio ?? true) &&
				(request.audioEnabled ?? roomConfig?.initialAudioEnabled ?? true),
			camera:
				(permissions?.mediaPublishVideo ?? true) &&
				(request.videoEnabled ?? roomConfig?.initialVideoEnabled ?? true)
		};
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
