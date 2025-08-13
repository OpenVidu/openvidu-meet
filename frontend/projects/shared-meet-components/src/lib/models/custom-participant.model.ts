import { MeetTokenMetadata, ParticipantRole } from '@lib/typings/ce';
import { ParticipantModel, ParticipantProperties } from 'openvidu-components-angular';

// Represents a participant in the application.
export class CustomParticipantModel extends ParticipantModel {
	// Indicates the role of the participant.
	private _meetRole: ParticipantRole;

	constructor(props: ParticipantProperties) {
		super(props);
		const participant = props.participant;
		this._meetRole = extractParticipantRole(participant.metadata);
	}

	set meetRole(role: ParticipantRole) {
		this._meetRole = role;
	}

	isModerator(): boolean {
		return this._meetRole === ParticipantRole.MODERATOR;
	}
}

const extractParticipantRole = (metadata: any): ParticipantRole => {
	let parsedMetadata: MeetTokenMetadata | undefined;
	try {
		parsedMetadata = JSON.parse(metadata || '{}');
	} catch (e) {
		console.warn('Failed to parse participant metadata:', e);
	}

	if (!parsedMetadata || typeof parsedMetadata !== 'object') {
		return ParticipantRole.SPEAKER;
	}
	return parsedMetadata.selectedRole || ParticipantRole.SPEAKER;
};
