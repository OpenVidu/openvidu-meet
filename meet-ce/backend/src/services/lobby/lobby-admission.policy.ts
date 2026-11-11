import type { MeetRoomConfig, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MeetLobbyParticipantType, MeetLobbyStatus } from '@openvidu-meet/typings';
import { injectable } from 'inversify';
import { MeetRoomMemberHelper } from '../../helpers/room-member.helper.js';
import type { LobbyWait } from '../../models/lobby.model.js';

/** Who makes a request: the `memberId` and `userId` of its credential, none for an anonymous link. */
export interface LobbyRequester {
	memberId?: string;
	userId?: string;
}

/**
 * What a request with a ticket gets, by the state of the ticket's wait:
 * - `forbidden`: the ticket was presented with another principal's credential;
 * - `waiting`: still in line, so the ticket is answered again;
 * - `admitted`: the join steps run, with the admission used just before the token is issued;
 * - `rejoin`: the wait ended as admitted, so an ordinary join with the wait's participant, through the gate as it stands;
 * - `ended`: the wait ended otherwise, is unknown or belongs to another room, with its status when known.
 */
export type LobbyTicketAnswer =
	| { kind: 'forbidden' }
	| { kind: 'waiting' }
	| { kind: 'admitted' }
	| { kind: 'rejoin' }
	| { kind: 'ended'; status?: MeetLobbyStatus };

const PERMISSIONS_WITHOUT_IDENTITY = [
	'recordingList',
	'recordingPlay',
	'recordingDownload',
	'recordingDelete',
	'roomShareAccessLinks'
] as const satisfies readonly (keyof MeetRoomMemberPermissions)[];

/**
 * The rules of the waiting room that need no state: who waits, what a room member token without a
 * participant identity may do, and what a ticket gets.
 */
@injectable()
export class LobbyAdmissionPolicy {
	/** Whether a participant with these permissions waits before joining the room's meeting. */
	mustWait(config: Pick<MeetRoomConfig, 'lobby'>, permissions: MeetRoomMemberPermissions): boolean {
		return config.lobby.enabled && !permissions.lobbyBypass;
	}

	/**
	 * The permissions a room member token holds for the server's checks: in a room with the waiting room
	 * on, a token without a participant identity, one obtained without joining, keeps only the recording
	 * permissions and `roomShareAccessLinks`.
	 */
	permissionsOf(
		config: Pick<MeetRoomConfig, 'lobby'>,
		permissions: MeetRoomMemberPermissions,
		participantIdentity?: string
	): MeetRoomMemberPermissions {
		if (!config.lobby.enabled || participantIdentity) return permissions;

		const kept = Object.fromEntries(PERMISSIONS_WITHOUT_IDENTITY.map((key) => [key, permissions[key]]));
		return { ...MeetRoomMemberHelper.noPermissions(), ...kept };
	}

	/** The principal a wait is bound to, so that a ticket presented with another credential is refused. */
	principalOf({ memberId, userId }: LobbyRequester): string | undefined {
		return memberId || userId || undefined;
	}

	/** How the participant asks to join, from the credential of the request, never from what the client says. */
	participantTypeOf({ memberId, userId }: LobbyRequester): MeetLobbyParticipantType {
		if (userId) return MeetLobbyParticipantType.USER;

		if (memberId) return MeetLobbyParticipantType.IDENTIFIED_GUEST;

		return MeetLobbyParticipantType.ANONYMOUS;
	}

	answerTicket(wait: LobbyWait | null, roomId: string, requester: LobbyRequester): LobbyTicketAnswer {
		if (!wait || wait.roomId !== roomId) return { kind: 'ended' };

		if (wait.principal !== this.principalOf(requester)) return { kind: 'forbidden' };

		if (!wait.ended && wait.status === MeetLobbyStatus.WAITING) return { kind: 'waiting' };

		if (wait.status === MeetLobbyStatus.ADMITTED) return { kind: wait.ended ? 'rejoin' : 'admitted' };

		return { kind: 'ended', status: wait.status };
	}
}
