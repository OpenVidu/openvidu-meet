import { HttpErrorResponse } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { MeetWaitingRoomTicketResponse } from '@openvidu-meet/typings';
import { LoggerService } from '../../../shared/services/logger.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { isWaitingRoomFull, roomMemberTokenFailure } from '../../room-members/utils/room-member-token-failure.utils';
import { E2eeService } from '../openvidu-components/services/e2ee/e2ee.service';
import { MeetingContextService } from './meeting-context.service';

/** What the participant joins as. */
export interface JoinRequest {
	participantName: string;
	/** Empty when the room is not encrypted. */
	e2eeKey: string;
	/** Whether the participant typed the name, rather than it coming from their membership, account or link. */
	nameTypedByParticipant: boolean;
}

/** The answer to a request to join: the token to connect with, or the ticket of a wait to be let in. */
export type JoinAnswer = { kind: 'token'; token: string } | { kind: 'waiting'; ticket: MeetWaitingRoomTicketResponse };

/**
 * Requests the token a participant joins the meeting with. It is requested when they commit to joining,
 * not before: the request reserves their name, checks the meeting's capacity and creates the meeting,
 * unless the participant has to wait to be let in.
 */
@Service()
export class JoinTokenService {
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly e2eeService = inject(E2eeService);
	private readonly navigationService = inject(NavigationService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - JoinTokenService');

	/**
	 * Resolves to the token to connect with, or to the ticket of a wait. A refusal shows its error screen
	 * and rejects, except a full waiting room, whose screen belongs to the waiting room.
	 */
	async request(join: JoinRequest): Promise<JoinAnswer> {
		try {
			return await this.ask(join);
		} catch (error) {
			if (isWaitingRoomFull(error)) throw error;

			await this.showFailure(error);
			throw new Error('Error generating room member token', { cause: error });
		}
	}

	/** Asks for the token of a wait with its ticket. Its failures are the caller's to handle. */
	requestWithTicket(join: JoinRequest, waitingRoomTicket: string): Promise<JoinAnswer> {
		return this.ask(join, waitingRoomTicket);
	}

	/** Shows the error screen of a refused request to join. */
	async showFailure(error: unknown): Promise<void> {
		this.log.e('Error generating room member token for joining meeting:', error);

		if (error instanceof HttpErrorResponse && error.status === 422) {
			this.log.e('Invalid participant data:', this.describeValidationError(error));
		}

		await this.navigationService.redirectToErrorPage(roomMemberTokenFailure(error), true);
	}

	private async ask(
		{ participantName, e2eeKey, nameTypedByParticipant }: JoinRequest,
		waitingRoomTicket?: string
	): Promise<JoinAnswer> {
		// The correlation fields are not encrypted: they belong to the host application, which already knows them.
		const answer = await this.roomMemberContextService.requestJoin(this.meetingContextService.roomId()!, {
			secret: this.meetingContextService.roomSecret(),
			joinMeeting: true,
			participantName: await this.nameInToken(participantName, e2eeKey),
			participantExternalId: this.roomMemberContextService.participantExternalId(),
			participantMetadata: this.roomMemberContextService.participantMetadata(),
			...(waitingRoomTicket && { waitingRoomTicket })
		});

		if (nameTypedByParticipant) {
			this.roomMemberContextService.saveParticipantNameToStorage(participantName);
		}

		return 'waitingRoomTicket' in answer
			? { kind: 'waiting', ticket: answer }
			: { kind: 'token', token: answer.token };
	}

	/** An encrypted meeting gets the name encrypted, so the server never sees it in plain text. */
	private async nameInToken(participantName: string, e2eeKey: string): Promise<string> {
		if (!e2eeKey || !participantName) return participantName;

		await this.e2eeService.setE2EEKey(e2eeKey);
		return this.e2eeService.encrypt(participantName);
	}

	private describeValidationError(error: HttpErrorResponse): string {
		const details: { field: string; message: string }[] = error.error?.details ?? [];
		return details.map(({ field, message }) => `${field}: ${message}`).join('; ') || error.error?.message;
	}
}
