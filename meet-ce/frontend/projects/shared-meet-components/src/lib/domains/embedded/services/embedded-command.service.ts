import { inject, Service } from '@angular/core';
import { EmbeddedCommandName, MeetParticipantMuteOptions, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import {
	LocalMediaService,
	MeetingLiveKitService,
	MeetingPhaseService,
	ScreenShareService
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
	private readonly localMedia = inject(LocalMediaService);
	private readonly screenShare = inject(ScreenShareService);
	private readonly meetingPhase = inject(MeetingPhaseService);
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

	async participantMute(participantIdentity: string, media: MeetParticipantMuteOptions): Promise<void> {
		await this.run(EmbeddedCommandName.PARTICIPANT_MUTE, 'participantMute', async () => {
			const roomId = this.meetingContextService.roomId();

			if (!participantIdentity || !roomId) {
				this.log.w('participantMute() called without a participant identity or room id');
				return;
			}

			await this.meetingModerationService.muteParticipant(roomId, participantIdentity, media);
		});
	}

	async participantMuteAll(media: MeetParticipantMuteOptions): Promise<void> {
		await this.run(EmbeddedCommandName.PARTICIPANT_MUTE_ALL, 'participantMute', async () => {
			const roomId = this.meetingContextService.roomId();

			if (!roomId) {
				this.log.w('participantMuteAll() called but room id is undefined');
				return;
			}

			await this.meetingModerationService.muteAllParticipants(roomId, media);
		});
	}

	async mediaToggleAudio(active?: boolean): Promise<void> {
		await this.run(EmbeddedCommandName.MEDIA_TOGGLE_AUDIO, 'mediaPublishAudio', () =>
			this.localMedia.setMicrophoneEnabled(this.resolveToggle(active, this.localMedia.microphone.enabled()))
		);
	}

	async mediaToggleVideo(active?: boolean): Promise<void> {
		await this.run(EmbeddedCommandName.MEDIA_TOGGLE_VIDEO, 'mediaPublishVideo', () =>
			this.localMedia.setCameraEnabled(this.resolveToggle(active, this.localMedia.camera.enabled()))
		);
	}

	async mediaToggleScreenShare(active?: boolean): Promise<void> {
		await this.run(EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE, 'mediaShareScreen', () =>
			this.screenShare.setEnabled(this.resolveToggle(active, this.screenShare.enabled()))
		);
	}

	/** Anything other than an actual boolean (e.g. a webcomponent attribute string) means "toggle". */
	private resolveToggle(active: boolean | undefined, currentlyEnabled: boolean): boolean {
		return typeof active === 'boolean' ? active : !currentlyEnabled;
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
			(PREJOIN_CAPABLE_COMMANDS.has(command) && this.meetingPhase.phase() === 'prejoin');

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
