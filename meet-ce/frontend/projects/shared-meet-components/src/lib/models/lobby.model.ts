import { FormGroup } from '@angular/forms';
import { MeetRoom } from '@openvidu-meet/typings';

/**
 * State interface representing the lobby state of a meeting
 */
export interface LobbyState {
	room?: MeetRoom;
	roomId: string;
	roomSecret: string;
	roomClosed: boolean;
	hasRecordings: boolean;
	showRecordingCard: boolean;
	showBackButton: boolean;
	backButtonText: string;
	isE2EEEnabled: boolean;
	participantForm: FormGroup;
	roomMemberToken: string;
}
