import { inject, Service } from '@angular/core';
import { EmbeddedCommandName, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import {
	LocalMediaControlService,
	LocalMediaStateService,
	LocalTrackService,
	MeetingLiveKitService
} from '../../meeting/openvidu-components';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { MeetingModerationService } from '../../meeting/services/meeting-moderation.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { LoggerService } from '../../../shared/services/logger.service';

/** Commands that also work from the prejoin screen; every other command needs an active session. */
const PREJOIN_CAPABLE_COMMANDS: ReadonlySet<EmbeddedCommandName> = new Set([
	EmbeddedCommandName.MEDIA_TOGGLE_AUDIO,
	EmbeddedCommandName.MEDIA_TOGGLE_VIDEO
]);

/**
 * Meeting-domain command bridge for the `<openvidu-meet>` webcomponent and the iframe `postMessage`
 * bridge. Both transports call these methods, so every command is accepted or rejected identically
 * through {@link run}.
 */
@Service()
export class EmbeddedCommandService {
	private readonly meetingModerationService = inject(MeetingModerationService);
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);
	private readonly localMediaControlService = inject(LocalMediaControlService);
	private readonly localMediaState = inject(LocalMediaStateService);
	private readonly localTrackService = inject(LocalTrackService);
	private readonly log = inject(LoggerService).get('EmbeddedCommandService');

	async meetingEnd(): Promise<void> {
		await this.run(EmbeddedCommandName.MEETING_END, 'meetingEnd', async () => {
			const roomId = this.meetingContextService.roomId();

			if (!roomId) {
				this.log.w('meetingEnd() called but room id is undefined');
				return;
			}

			await this.meetingModerationService.endMeeting(roomId);
		});
	}

	async meetingLeave(): Promise<void> {
		await this.run(EmbeddedCommandName.MEETING_LEAVE, null, () => this.meetingLiveKitService.disconnect());
	}

	async participantKick(participantIdentity: string): Promise<void> {
		await this.run(EmbeddedCommandName.PARTICIPANT_KICK, 'participantKick', async () => {
			const roomId = this.meetingContextService.roomId();

			if (!participantIdentity || !roomId) {
				this.log.w('participantKick() called without a participant identity or room id');
				return;
			}

			await this.meetingModerationService.kickParticipant(roomId, participantIdentity);
		});
	}

	async mediaToggleAudio(enabled?: boolean): Promise<void> {
		await this.run(EmbeddedCommandName.MEDIA_TOGGLE_AUDIO, 'mediaPublishAudio', () =>
			this.localMediaControlService.setMicrophoneEnabled(enabled ?? !this.localMediaState.microphoneEnabled())
		);
	}

	async mediaToggleVideo(enabled?: boolean): Promise<void> {
		await this.run(EmbeddedCommandName.MEDIA_TOGGLE_VIDEO, 'mediaPublishVideo', () =>
			this.localMediaControlService.setCameraEnabled(enabled ?? !this.localMediaState.cameraEnabled())
		);
	}

	async mediaToggleScreenShare(enabled?: boolean): Promise<void> {
		await this.run(EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE, 'mediaShareScreen', () =>
			this.localMediaControlService.setScreenShareEnabled(enabled ?? !this.localMediaState.screenShareEnabled())
		);
	}

	private async run(
		command: EmbeddedCommandName,
		permission: keyof MeetRoomMemberPermissions | null,
		action: () => Promise<void>
	): Promise<void> {
		if (permission && !this.roomMemberContextService.hasPermission(permission)) {
			this.log.w(`${command} rejected: local participant lacks the '${permission}' permission`);
			return;
		}

		const allowed =
			this.meetingLiveKitService.isSessionActive() ||
			(PREJOIN_CAPABLE_COMMANDS.has(command) && this.localTrackService.prejoinActive());

		if (!allowed) {
			this.log.w(`${command} rejected: not available in the current meeting phase`);
			return;
		}

		try {
			await action();
		} catch (error) {
			this.log.e(`Error running ${command}:`, error);
		}
	}

	/** @deprecated Renamed to {@link EmbeddedCommandService.meetingEnd}. Removed in 3.12.0. */
	endMeeting(): Promise<void> {
		return this.meetingEnd();
	}

	/** @deprecated Renamed to {@link EmbeddedCommandService.meetingLeave}. Removed in 3.12.0. */
	leaveRoom(): Promise<void> {
		return this.meetingLeave();
	}

	/** @deprecated Renamed to {@link EmbeddedCommandService.participantKick}. Removed in 3.12.0. */
	kickParticipant(participantIdentity: string): Promise<void> {
		return this.participantKick(participantIdentity);
	}
}
