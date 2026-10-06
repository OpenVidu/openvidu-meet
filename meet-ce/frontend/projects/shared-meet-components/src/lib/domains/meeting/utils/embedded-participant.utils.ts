import type { MeetParticipantPayload } from '@openvidu-meet/typings';
import { MeetRoomMemberRole, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import type { Participant } from '../openvidu-components';
import { parseParticipantMetadata } from '../openvidu-components';

export const toParticipantRole = (badge: MeetRoomMemberUIBadge | undefined): MeetRoomMemberRole =>
	!badge || badge === MeetRoomMemberUIBadge.OTHER ? MeetRoomMemberRole.SPEAKER : MeetRoomMemberRole.MODERATOR;

/**
 * Builds the {@link MeetParticipantPayload} lifecycle shape for a participant — the
 * client-side twin of the backend's `MeetParticipantHelper.toParticipantPayload()`: the
 * identity/correlation fields come from the Meet token metadata the participant carries, the role
 * from its badge (`OTHER` or no Meet metadata → speaker), and the join date from LiveKit.
 *
 * @param participant - The LiveKit participant to convert.
 */
export const toEmbeddedParticipantPayload = (participant: Participant): MeetParticipantPayload => {
	const meetingMetadata = parseParticipantMetadata(participant.metadata);

	return {
		participantIdentity: participant.identity,
		participantName: participant.name ?? participant.identity,
		externalId: meetingMetadata?.externalId,
		metadata: meetingMetadata?.metadata,
		role: toParticipantRole(meetingMetadata?.badge),
		joinDate: participant.joinedAt?.getTime() ?? 0
	};
};
