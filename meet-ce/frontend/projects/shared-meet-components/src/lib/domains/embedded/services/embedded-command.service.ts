import { inject, Service } from '@angular/core';
import {
	LocalMediaControlService,
	LocalMediaStateService,
	MeetingLiveKitService
} from '../../meeting/openvidu-components';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { MeetingModerationService } from '../../meeting/services/meeting-moderation.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { LoggerService } from '../../../shared/services/logger.service';

/**
 * Meeting-domain command bridge exposed to the Angular Elements
 * `<openvidu-meet>` webcomponent's public API.
 *
 * Hosts call `meetingEnd()`, `meetingLeave()` and `participantKick()` on the
 * custom element; the WC adapter forwards each call to this service, which
 * then delegates to the appropriate meeting-domain service after checking
 * permissions and room context.
 *
 * The former action-first spellings are kept as `@deprecated` aliases that forward to the
 * canonical method, and are removed in **3.12.0**. Each canonical method holds the whole
 * implementation so the alias adds no behaviour of its own.
 *
 * The signal-based bridge for shell-level actions lives separately on
 * `EmbeddedEventBusService` (in `shared/`, no meeting-domain deps).
 */
@Service()
export class EmbeddedCommandService {
	private readonly meetingModerationService = inject(MeetingModerationService);
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);
	private readonly localMediaControlService = inject(LocalMediaControlService);
	private readonly localMediaState = inject(LocalMediaStateService);
	private readonly log = inject(LoggerService).get('EmbeddedCommandService');

	/**
	 * Ends the meeting for all participants. Requires the local participant
	 * to hold the `meetingEnd` permission; otherwise the call is a no-op.
	 */
	async meetingEnd(): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('meetingEnd')) {
			this.log.w('meetingEnd() called but local participant lacks meetingEnd permission');
			return;
		}

		const roomId = this.meetingContextService.roomId();

		if (!roomId) {
			this.log.w('meetingEnd() called but room id is undefined');
			return;
		}

		try {
			this.log.d(`Ending meeting ${roomId}...`);
			await this.meetingModerationService.endMeeting(roomId);
		} catch (error) {
			this.log.e('Error ending meeting:', error);
		}
	}

	/**
	 * Disconnects the local participant from the current room. Voluntary
	 * leave; surfaces as `LeftEventReason.VOLUNTARY_LEAVE` to the host.
	 */
	async meetingLeave(): Promise<void> {
		try {
			this.log.d('Leaving room...');
			await this.meetingLiveKitService.disconnect();
		} catch (error) {
			this.log.e('Error leaving room:', error);
		}
	}

	/**
	 * Removes the named participant from the meeting. Requires the local
	 * participant to hold the `participantKick` permission; otherwise the
	 * call is a no-op.
	 */
	async participantKick(participantIdentity: string): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('participantKick')) {
			this.log.w('participantKick() called but local participant lacks participantKick permission');
			return;
		}

		if (!participantIdentity) {
			this.log.w('participantKick() called without a participant identity');
			return;
		}

		const roomId = this.meetingContextService.roomId();

		if (!roomId) {
			this.log.w('participantKick() called but room id is undefined');
			return;
		}

		try {
			this.log.d(`Kicking participant ${participantIdentity} from meeting ${roomId}...`);
			await this.meetingModerationService.kickParticipant(roomId, participantIdentity);
		} catch (error) {
			this.log.e(`Error kicking participant ${participantIdentity}:`, error);
		}
	}

	/**
	 * Toggles the local participant's microphone, or sets it when `enabled` is provided.
	 * Requires the `mediaPublishAudio` permission; otherwise the call is a no-op.
	 */
	async mediaToggleAudio(enabled?: boolean): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('mediaPublishAudio')) {
			this.log.w('mediaToggleAudio() called but local participant lacks mediaPublishAudio permission');
			return;
		}

		try {
			const targetEnabled = enabled ?? !this.localMediaState.microphoneEnabled();
			this.log.d(`Setting microphone enabled to ${targetEnabled}...`);
			await this.localMediaControlService.setMicrophoneEnabled(targetEnabled);
		} catch (error) {
			this.log.e('Error toggling microphone:', error);
		}
	}

	/**
	 * Toggles the local participant's camera, or sets it when `enabled` is provided.
	 * Requires the `mediaPublishVideo` permission; otherwise the call is a no-op.
	 */
	async mediaToggleVideo(enabled?: boolean): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('mediaPublishVideo')) {
			this.log.w('mediaToggleVideo() called but local participant lacks mediaPublishVideo permission');
			return;
		}

		try {
			const targetEnabled = enabled ?? !this.localMediaState.cameraEnabled();
			this.log.d(`Setting camera enabled to ${targetEnabled}...`);
			await this.localMediaControlService.setCameraEnabled(targetEnabled);
		} catch (error) {
			this.log.e('Error toggling camera:', error);
		}
	}

	/**
	 * Toggles the local participant's screen share, or sets it when `enabled` is provided.
	 * Requires the `mediaShareScreen` permission; otherwise the call is a no-op.
	 */
	async mediaToggleScreenShare(enabled?: boolean): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('mediaShareScreen')) {
			this.log.w('mediaToggleScreenShare() called but local participant lacks mediaShareScreen permission');
			return;
		}

		try {
			const targetEnabled = enabled ?? !this.localMediaState.screenShareEnabled();
			this.log.d(`Setting screen share enabled to ${targetEnabled}...`);
			await this.localMediaControlService.setScreenShareEnabled(targetEnabled);
		} catch (error) {
			this.log.e('Error toggling screen share:', error);
		}
	}

	// ── Deprecated aliases ───────────────────────────────────────────────────
	// Pure forwarders, so a host still on the 3.8.0 spelling goes through exactly the same
	// code path as a migrated one.

	/**
	 * @deprecated Renamed to {@link EmbeddedCommandService.meetingEnd}. Removed in 3.12.0.
	 */
	endMeeting(): Promise<void> {
		return this.meetingEnd();
	}

	/**
	 * @deprecated Renamed to {@link EmbeddedCommandService.meetingLeave}. Removed in 3.12.0.
	 */
	leaveRoom(): Promise<void> {
		return this.meetingLeave();
	}

	/**
	 * @deprecated Renamed to {@link EmbeddedCommandService.participantKick}. Removed in 3.12.0.
	 */
	kickParticipant(participantIdentity: string): Promise<void> {
		return this.participantKick(participantIdentity);
	}
}
