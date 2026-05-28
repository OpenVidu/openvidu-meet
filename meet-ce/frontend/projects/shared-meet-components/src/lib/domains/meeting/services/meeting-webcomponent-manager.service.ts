import { inject, Injectable, signal } from '@angular/core';
import { LeftEventReason } from '@openvidu-meet/typings';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { LoggerService, OpenViduService } from '../openvidu-components';
import { MeetingContextService } from './meeting-context.service';
import { MeetingService } from './meeting.service';

/**
 * Payload for the `joined` event surfaced to the webcomponent host.
 */
export interface MeetingJoinedEventDetail {
	roomId: string;
	participantIdentity: string;
}

/**
 * Payload for the `left` event surfaced to the webcomponent host. Carries the
 * precise {@link LeftEventReason} so hosts can distinguish voluntary leaves
 * from network drops, kicks, server shutdowns, etc.
 */
export interface MeetingLeftEventDetail {
	roomId: string;
	participantIdentity: string;
	reason: LeftEventReason;
}

/**
 * Payload for the `closed` event surfaced to the webcomponent host. Empty by
 * contract — `closed` is a pure lifecycle signal: the WC has finished its
 * post-meeting/post-recording flow and the host can unmount the element or
 * follow the configured leave-redirect URL.
 *
 * Internally we carry a monotonically-increasing nonce so consecutive
 * `emitClosedEvent()` calls always produce a new signal reference (the
 * payload itself has no observable fields).
 */
export interface MeetingClosedEventDetail {
	/** @internal Forces signal-equality to detect each emission as a change. */
	_nonce: number;
}

/**
 * Adapter between the shared meeting domain logic and the Angular Elements
 * `<openvidu-meet>` webcomponent.
 *
 * Direction of flow:
 * - **Out (domain → host):** event signals (`joinedEvent`, `leftEvent`) that
 *   the webcomponent observes and re-emits as DOM `CustomEvent`s on the
 *   custom element.
 * - **In (host → domain):** imperative command methods (`endMeeting()`,
 *   `leaveRoom()`, `kickParticipant()`) that the webcomponent's public API
 *   calls and that delegate to the appropriate domain services.
 *
 * This service is the single integration point between the shared library
 * and the webcomponent shell.
 */
@Injectable({
	providedIn: 'root'
})
export class MeetingWebComponentManagerService {
	private readonly meetingService = inject(MeetingService);
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly openviduService = inject(OpenViduService);
	private readonly log = inject(LoggerService).get('WebComponentManagerService');

	private readonly _joinedEvent = signal<MeetingJoinedEventDetail | null>(null);
	private readonly _leftEvent = signal<MeetingLeftEventDetail | null>(null);
	private readonly _closedEvent = signal<MeetingClosedEventDetail | null>(null);
	private _closedNonce = 0;

	/**
	 * Last `joined` payload, or `null` if the local participant has not joined
	 * yet in this session. The webcomponent observes this and dispatches the
	 * public `joined` DOM event. A new object reference is allocated on every
	 * emit so re-joins with identical room/identity still trigger the host
	 * effect.
	 */
	readonly joinedEvent = this._joinedEvent.asReadonly();

	/**
	 * Last `left` payload, or `null` if no leave has occurred yet in this
	 * session.
	 */
	readonly leftEvent = this._leftEvent.asReadonly();

	/**
	 * Last `closed` payload, or `null` until the WC has finished its
	 * post-meeting flow. Re-emissions yield a fresh reference even though the
	 * public payload is empty.
	 */
	readonly closedEvent = this._closedEvent.asReadonly();

	// ── Event emitters (domain → host) ─────────────────────────────────────

	emitJoinedEvent(detail: MeetingJoinedEventDetail): void {
		this.log.d('Emitting joined event', detail);
		this._joinedEvent.set({ ...detail });
	}

	emitLeftEvent(detail: MeetingLeftEventDetail): void {
		this.log.d('Emitting left event', detail);
		this._leftEvent.set({ ...detail });
	}

	emitClosedEvent(): void {
		this.log.d('Emitting closed event');
		this._closedEvent.set({ _nonce: ++this._closedNonce });
	}

	// ── Command methods (host → domain) ────────────────────────────────────

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
