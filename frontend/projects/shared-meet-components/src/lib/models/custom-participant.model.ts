import { MeetTokenMetadata, ParticipantRole } from '@lib/typings/ce';
import { ParticipantModel, ParticipantProperties } from 'openvidu-components-angular';

// Represents a participant in the application.
export class CustomParticipantModel extends ParticipantModel {
	// Indicates the role of the participant.
	private _meetRole: ParticipantRole;

	//  Creates a new instance of CustomParticipantModel.
	constructor(props: ParticipantProperties) {
		super(props);
		const participant = props.participant;
		this._meetRole = extractParticipantRole(participant.metadata);
	}

	// Sets the role of the participant.
	set meetRole(role: ParticipantRole) {
		this._meetRole = role;
	}

	// Checks if the participant is a moderator.
	// Returns true if the participant's role is MODERATOR, otherwise false.
	isModerator(): boolean {
		return this._meetRole === ParticipantRole.MODERATOR;
	}
}

const extractParticipantRole = (metadata: any): ParticipantRole => {
	let parsedMetadata: MeetTokenMetadata = metadata;
	try {
		parsedMetadata = JSON.parse(metadata || '{}');
	} catch (e) {
		console.warn('Failed to parse participant metadata:', e);
	}
	if (!parsedMetadata || typeof parsedMetadata !== 'object') {
		return ParticipantRole.PUBLISHER;
	}
	return parsedMetadata.selectedRole || ParticipantRole.PUBLISHER;
};
