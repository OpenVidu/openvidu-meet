import { MeetRoomMemberRole, MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';
import { ParticipantModel, ParticipantProperties } from 'openvidu-components-angular';

// Represents a participant in the application.
export class CustomParticipantModel extends ParticipantModel {
	// Indicates the original role of the participant.
	private _meetOriginalRole: MeetRoomMemberRole;
	// Indicates the current role of the participant.
	private _meetRole: MeetRoomMemberRole;

	constructor(props: ParticipantProperties) {
		super(props);
		const participant = props.participant;
		this._meetOriginalRole = extractParticipantRole(participant.metadata);
		this._meetRole = this._meetOriginalRole;
	}

	set meetRole(role: MeetRoomMemberRole) {
		this._meetRole = role;
	}

	/**
	 * Checks if the current role of the participant is moderator.
	 * @returns True if the current role is moderator, false otherwise.
	 */
	isModerator(): boolean {
		return this._meetRole === MeetRoomMemberRole.MODERATOR;
	}

	/**
	 * Checks if the original role of the participant is moderator.
	 * @returns True if the original role is moderator, false otherwise.
	 */
	isOriginalModerator(): boolean {
		return this._meetOriginalRole === MeetRoomMemberRole.MODERATOR;
	}
}

const extractParticipantRole = (metadata: any): MeetRoomMemberRole => {
	let parsedMetadata: MeetRoomMemberTokenMetadata | undefined;
	try {
		parsedMetadata = JSON.parse(metadata || '{}');
	} catch (e) {
		console.warn('Failed to parse participant metadata:', e);
	}

	if (!parsedMetadata || typeof parsedMetadata !== 'object') {
		return MeetRoomMemberRole.SPEAKER;
	}
	return parsedMetadata.role || MeetRoomMemberRole.SPEAKER;
};
