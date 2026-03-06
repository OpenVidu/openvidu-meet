import { MeetRoomMemberTokenMetadata, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import { ParticipantModel, ParticipantProperties } from 'openvidu-components-angular';

/**
 * Interface for computed participant display properties
 */
export interface ParticipantDisplayProperties {
	showBadge: boolean;
	showModerationControls: boolean;
	showMakeModeratorButton: boolean;
	showUnmakeModeratorButton: boolean;
	showKickButton: boolean;
}

// Represents a participant in the application.
export class CustomParticipantModel extends ParticipantModel {
	private _meetBadge = MeetRoomMemberUIBadge.OTHER;
	private _isPromotedModerator = false;

	constructor(props: ParticipantProperties) {
		super(props);
		this.updateModerationMetadata(props.participant.metadata);
	}

	set meetBadge(badge: MeetRoomMemberUIBadge) {
		this._meetBadge = badge;
	}

	set promotedModerator(isPromoted: boolean) {
		this._isPromotedModerator = isPromoted;
	}

	private updateModerationMetadata(metadata: unknown): void {
		const parsedMetadata = parseParticipantMetadata(metadata);
		this._meetBadge = parsedMetadata?.badge || MeetRoomMemberUIBadge.OTHER;
		this._isPromotedModerator = Boolean(parsedMetadata?.isPromotedModerator);
	}

	/**
	 * Gets the participant's badge.
	 * @returns The MeetRoomMemberUIBadge representing the participant's badge.
	 */
	getBadge(): MeetRoomMemberUIBadge {
		return this._meetBadge;
	}

	/**
	 * Checks if the participant has a badge other than OTHER.
	 * @returns True if the participant has a badge, false otherwise.
	 */
	hasBadge(): boolean {
		return this._meetBadge !== MeetRoomMemberUIBadge.OTHER;
	}

	/**
	 * Checks if the participant is a promoted moderator (not an original moderator).
	 * @returns True if the participant is a promoted moderator, false otherwise.
	 */
	isPromotedModerator(): boolean {
		return this._isPromotedModerator;
	}
}

const parseParticipantMetadata = (metadata: unknown): MeetRoomMemberTokenMetadata | undefined => {
	let parsedMetadata: MeetRoomMemberTokenMetadata | undefined;
	try {
		parsedMetadata = JSON.parse((metadata as string) || '{}');
	} catch (e) {
		console.warn('Failed to parse participant metadata:', e);
	}

	if (!parsedMetadata || typeof parsedMetadata !== 'object') {
		return undefined;
	}

	return parsedMetadata;
};
