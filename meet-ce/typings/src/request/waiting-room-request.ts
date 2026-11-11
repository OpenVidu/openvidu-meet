/**
 * Payload of the `waitingRoomAdmit` and `waitingRoomReject` embedded commands, and body of the `waitingRoomAdmit` and
 * `waitingRoomReject` operations next to the `roomId` of the meeting: the waiting participants to decide on,
 * one or several.
 */
export interface MeetWaitingRoomDecisionOptions {
	/**
	 * Identities of the waiting participants to decide on, 1 to 100 distinct ones. Omitted, everyone
	 * waiting: `waitingRoomAdmit` admits the first in line up to the free places, and `waitingRoomReject` rejects
	 * everyone waiting when it runs. An empty list is refused. A decision on named participants applies
	 * to all of them or to none.
	 */
	participantIdentities?: string[];
}
