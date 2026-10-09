import type {
	EmbeddedEventName,
	EmbeddedEventPayloadFor,
	MeetParticipantInfo,
	MeetParticipantPayload
} from '@openvidu-meet/typings';
import {
	handRaiseDateOf,
	MeetRoomMemberRole,
	MeetRoomMemberUIBadge,
	participantLeaveReasonOf
} from '@openvidu-meet/typings';
import type { Participant } from '../openvidu-components';
import { DisconnectReason, parseParticipantMetadata } from '../openvidu-components';

export const toParticipantRole = (badge: MeetRoomMemberUIBadge | undefined): MeetRoomMemberRole =>
	!badge || badge === MeetRoomMemberUIBadge.OTHER ? MeetRoomMemberRole.SPEAKER : MeetRoomMemberRole.MODERATOR;

/**
 * The join date the server stamped, read like the backend's `MeetParticipantHelper.extractJoinDate()`.
 * LiveKit's public `joinedAt` cannot serve: it is rounded down to the second, and it is the current
 * time until LiveKit has applied the participant's info.
 */
const joinDateOf = (participant: Participant): number => {
	const info = participant['participantInfo'];
	const joinedAtMs = Number(info?.joinedAtMs ?? 0);

	return joinedAtMs > 0 ? joinedAtMs : Number(info?.joinedAt ?? 0) * 1000;
};

/**
 * Builds the {@link MeetParticipantPayload} lifecycle shape for a participant — the
 * client-side twin of the backend's `MeetParticipantHelper.toParticipantPayload()`: the
 * identity/correlation fields come from the Meet token metadata the participant carries, the role
 * from its badge (`OTHER` or no Meet metadata → speaker), and the join date from the participant
 * info LiveKit holds, 0 until it has applied it.
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
		joinDate: joinDateOf(participant)
	};
};

/**
 * Builds the live {@link MeetParticipantInfo} snapshot of a participant, the client-side twin of the
 * backend's `MeetParticipantHelper.toParticipantInfo()`: its media state read from its published
 * tracks and its hand from the attributes the server writes.
 *
 * @param participant - The LiveKit participant to convert.
 */
export const toEmbeddedParticipantInfo = (participant: Participant): MeetParticipantInfo => {
	const handRaiseDate = handRaiseDateOf(participant.attributes);

	return {
		...toEmbeddedParticipantPayload(participant),
		audioActive: participant.isMicrophoneEnabled,
		videoActive: participant.isCameraEnabled,
		screenShareActive: participant.isScreenShareEnabled,
		handRaised: handRaiseDate !== undefined,
		...(handRaiseDate !== undefined && { handRaiseDate })
	};
};

/**
 * Builds the participant of the embedded `participantLeft` event: the lifecycle shape plus why they
 * left, mapped from the reason LiveKit gives every client the same way the `participantLeft` webhook
 * maps it.
 *
 * @param participant - The LiveKit participant that left.
 * @param disconnectReason - The reason LiveKit gave, absent when it gave none.
 */
export const toEmbeddedDepartedParticipant = (
	participant: Participant,
	disconnectReason: DisconnectReason | undefined
): EmbeddedEventPayloadFor<EmbeddedEventName.PARTICIPANT_LEFT>['participant'] => ({
	...toEmbeddedParticipantPayload(participant),
	leaveReason: participantLeaveReasonOf(
		disconnectReason === undefined ? undefined : DisconnectReason[disconnectReason]
	)
});
