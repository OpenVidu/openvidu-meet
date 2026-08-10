import { inject, Service } from '@angular/core';
import { MeetingLiveKitService } from '../../meeting/openvidu-components';
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
	private readonly log = inject(LoggerService).get('EmbeddedCommandService');

	/**
	 * Ends the meeting for all participants. Requires the local participant
	 * to hold the `canEndMeeting` permission; otherwise the call is a no-op.
	 */
	async meetingEnd(): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('canEndMeeting')) {
			this.log.w('meetingEnd() called but local participant lacks canEndMeeting permission');
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
	 * participant to hold the `canKickParticipants` permission; otherwise the
	 * call is a no-op.
	 */
	async participantKick(participantIdentity: string): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('canKickParticipants')) {
			this.log.w('participantKick() called but local participant lacks canKickParticipants permission');
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
