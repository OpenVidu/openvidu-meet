import { FormGroup } from '@angular/forms';
import { MeetRoom } from '@openvidu-meet/typings';

/**
 * State interface representing the lobby phase of a meeting.
 *
 * IMPORTANT: This state is ONLY relevant during the lobby phase (before joining the meeting).
 * Once the participant joins the meeting, MeetingContextService becomes the single source of truth.
 */
export interface LobbyState {
	room?: MeetRoom;
	roomId?: string;
	roomClosed: boolean;
	showRecordingCard: boolean;
	showBackButton: boolean;
	backButtonText: string;
	hasRoomE2EEEnabled: boolean;
	participantForm: FormGroup;
	roomMemberToken?: string;
}
