import { MeetEventOrigin } from './embedded/events.js';
import type { MeetParticipantHandChangedPayload } from './webhook.js';

/**
 * LiveKit participant attributes OpenVidu Meet writes server-side. Clients render from the
 * attribute values LiveKit delivers with each participant and from their changes, so a late joiner
 * sees the current state without any extra exchange. A removed attribute arrives as an empty string.
 */
export enum MeetParticipantAttribute {
	/**
	 * Timestamp when the participant raised their hand (milliseconds since epoch), present while it is
	 * raised. The raised-hand queue is ordered by it.
	 */
	HAND_RAISE_DATE = 'meet.handRaiseDate',
	/**
	 * Set to {@link MeetEventOrigin.MODERATOR} in the same update that removes
	 * {@link MeetParticipantAttribute.HAND_RAISE_DATE} when a moderator lowers the hand, so every
	 * client can tell a moderator lower from a self lower. Cleared by the next raise.
	 */
	HAND_LOWERED_BY = 'meet.handLoweredBy'
}

/**
 * Attribute values a hand change writes: the raise timestamp and who lowered the hand, with an
 * empty string removing a key.
 */
export type MeetHandAttributes = Record<MeetParticipantAttribute, string>;

/**
 * The attribute values that raise a hand at `raiseDate`.
 */
export const raisedHandAttributes = (raiseDate: number): MeetHandAttributes => ({
	[MeetParticipantAttribute.HAND_RAISE_DATE]: String(raiseDate),
	[MeetParticipantAttribute.HAND_LOWERED_BY]: ''
});

/**
 * The attribute values that lower a hand, recording who lowered it.
 */
export const loweredHandAttributes = (origin: MeetParticipantHandChangedPayload['origin']): MeetHandAttributes => ({
	[MeetParticipantAttribute.HAND_RAISE_DATE]: '',
	[MeetParticipantAttribute.HAND_LOWERED_BY]: origin === MeetEventOrigin.MODERATOR ? origin : ''
});

/**
 * The raise timestamp a participant's attributes carry, or `undefined` while the hand is lowered.
 */
export const handRaiseDateOf = (attributes: Readonly<Record<string, string>> | undefined): number | undefined => {
	const raiseDate = Number(attributes?.[MeetParticipantAttribute.HAND_RAISE_DATE]);
	return raiseDate > 0 ? raiseDate : undefined;
};

/**
 * Who lowered a hand according to its attributes: a moderator when the marker is set, the
 * participant otherwise.
 */
export const handLoweredByOf = (
	attributes: Readonly<Record<string, string>> | undefined
): MeetParticipantHandChangedPayload['origin'] =>
	attributes?.[MeetParticipantAttribute.HAND_LOWERED_BY] === MeetEventOrigin.MODERATOR
		? MeetEventOrigin.MODERATOR
		: MeetEventOrigin.PARTICIPANT;
