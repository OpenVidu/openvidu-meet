import { inject, Injectable } from '@angular/core';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { LoggerService, OpenViduService } from '../openvidu-components';
import { MeetingContextService } from './meeting-context.service';
import { MeetingService } from './meeting.service';

// Re-exported here for backward compatibility with existing import sites; the
// canonical declarations live alongside the bridge service that owns the
// signals these payloads describe.
export type {
	BackToRoomRequestDetail,
	MeetingClosedEventDetail,
	MeetingJoinedEventDetail,
	MeetingLeftEventDetail,
	ViewRecordingsRequestDetail
} from '../../../shared/services/webcomponent-bridge.service';

/**
 * Meeting-domain command bridge exposed to the Angular Elements
 * `<openvidu-meet>` webcomponent's public API.
 *
 * Hosts call `endMeeting()`, `leaveRoom()`, and `kickParticipant()` on the
 * custom element; the WC adapter forwards each call to this service, which
 * then delegates to the appropriate meeting-domain service after checking
 * permissions and room context.
 *
 * The signal-based event bus that lets shared code request WC-shell-level
 * actions lives separately on
 * {@link import('../../../shared/services/webcomponent-bridge.service').WebComponentBridgeService},
 * which is in `shared/` and has no meeting-domain dependencies.
 */
@Injectable({
	providedIn: 'root'
})
export class MeetingWebComponentManagerService {
	private readonly meetingService = inject(MeetingService);
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly openviduService = inject(OpenViduService);
	private readonly log = inject(LoggerService).get('MeetingWebComponentManagerService');

	/**
	 * Ends the meeting for all participants. Requires the local participant
	 * to hold the `canEndMeeting` permission; otherwise the call is a no-op.
	 */
	async endMeeting(): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('canEndMeeting')) {
			this.log.w('endMeeting() called but local participant lacks canEndMeeting permission');
			return;
		}

		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.w('endMeeting() called but room id is undefined');
			return;
		}

		try {
			this.log.d(`Ending meeting ${roomId}...`);
			await this.meetingService.endMeeting(roomId);
		} catch (error) {
			this.log.e('Error ending meeting:', error);
		}
	}

	/**
	 * Disconnects the local participant from the current room. Voluntary
	 * leave; surfaces as `LeftEventReason.VOLUNTARY_LEAVE` to the host.
	 */
	async leaveRoom(): Promise<void> {
		try {
			this.log.d('Leaving room...');
			await this.openviduService.disconnectRoom();
		} catch (error) {
			this.log.e('Error leaving room:', error);
		}
	}

	/**
	 * Removes the named participant from the meeting. Requires the local
	 * participant to hold the `canKickParticipants` permission; otherwise the
	 * call is a no-op.
	 */
	async kickParticipant(participantIdentity: string): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('canKickParticipants')) {
			this.log.w('kickParticipant() called but local participant lacks canKickParticipants permission');
			return;
		}

		if (!participantIdentity) {
			this.log.w('kickParticipant() called without a participant identity');
			return;
		}

		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.w('kickParticipant() called but room id is undefined');
			return;
		}

		try {
			this.log.d(`Kicking participant ${participantIdentity} from meeting ${roomId}...`);
			await this.meetingService.kickParticipant(roomId, participantIdentity);
		} catch (error) {
			this.log.e(`Error kicking participant ${participantIdentity}:`, error);
		}
	}
}
