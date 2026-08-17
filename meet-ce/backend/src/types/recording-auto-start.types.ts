import type { MeetRoomMemberRole } from '@openvidu-meet/typings';

/**
 * The trigger condition for a recording auto-start mode, expressed as data rather than a verdict:
 * how many participants of which room roles the meeting must already hold. Evaluating it against
 * the live meeting state is the caller's job (see
 * `LivekitWebhookService.isAutoStartThresholdReached`), so `RecordingHelper.getAutoStartConfig`
 * stays pure and never touches `MeetingService`.
 */
export interface MeetRecordingAutoStartPreset {
	minParticipants: number;
	/**
	 * Room roles whose participants count toward `minParticipants`. `first_participant` and
	 * `second_participant` list every {@link MeetRoomMemberRole}, so they count any standard
	 * participant — today's behavior. A mode gated on one specific role (a moderator joining, say)
	 * lists just that role instead of adding a separate counting mechanism.
	 */
	participantRoles: MeetRoomMemberRole[];
}
