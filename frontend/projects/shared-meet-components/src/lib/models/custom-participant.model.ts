import { MeetTokenMetadata, ParticipantRole } from '@lib/typings/ce';
import { ParticipantModel, ParticipantProperties } from 'openvidu-components-angular';

// Represents a participant in the application.
export class CustomParticipantModel extends ParticipantModel {
	// Indicates the original role of the participant.
	private _meetOriginalRole: ParticipantRole;
	// Indicates the current role of the participant.
	private _meetRole: ParticipantRole;

	constructor(props: ParticipantProperties) {
		super(props);
		const participant = props.participant;
		this._meetOriginalRole = extractParticipantRole(participant.metadata);
		this._meetRole = this._meetOriginalRole;
	}

	set meetRole(role: ParticipantRole) {
		this._meetRole = role;
	}

	/**
	 * Checks if the current role of the participant is moderator.
	 * @returns True if the current role is moderator, false otherwise.
	 */
	isModerator(): boolean {
		return this._meetRole === ParticipantRole.MODERATOR;
	}

	/**
	 * Checks if the original role of the participant is moderator.
	 * @returns True if the original role is moderator, false otherwise.
	 */
	isOriginalModerator(): boolean {
		return this._meetOriginalRole === ParticipantRole.MODERATOR;
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
