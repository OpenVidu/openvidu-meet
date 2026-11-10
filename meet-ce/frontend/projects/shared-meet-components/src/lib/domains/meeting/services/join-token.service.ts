import { HttpErrorResponse } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { LoggerService } from '../../../shared/services/logger.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { roomMemberTokenFailure } from '../../room-members/utils/room-member-token-failure.utils';
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

/**
 * Requests the token a participant joins the meeting with. It is requested when they commit to joining,
 * not before: the request reserves their name, checks the meeting's capacity and creates the meeting.
 */
@Service()
export class JoinTokenService {
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly e2eeService = inject(E2eeService);
	private readonly navigationService = inject(NavigationService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - JoinTokenService');

	/** Resolves to the room member token to connect with; a refusal shows its error screen and rejects. */
	async request({ participantName, e2eeKey, nameTypedByParticipant }: JoinRequest): Promise<string> {
		try {
			// The correlation fields are not encrypted: they belong to the host application, which already knows them.
			const token = await this.roomMemberContextService.generateToken(this.meetingContextService.roomId()!, {
				secret: this.meetingContextService.roomSecret(),
				joinMeeting: true,
				participantName: await this.nameInToken(participantName, e2eeKey),
				participantExternalId: this.roomMemberContextService.participantExternalId(),
				participantMetadata: this.roomMemberContextService.participantMetadata()
			});

			if (nameTypedByParticipant) {
				this.roomMemberContextService.saveParticipantNameToStorage(participantName);
			}

			this.meetingContextService.setIsActiveMeeting(true);
			return token;
		} catch (error) {
			this.log.e('Error generating room member token for joining meeting:', error);
			const reason = roomMemberTokenFailure(error);

			if (error instanceof HttpErrorResponse && error.status === 422) {
				this.log.e('Invalid participant data:', this.describeValidationError(error));
			}

			await this.navigationService.redirectToErrorPage(reason, true);
			throw new Error('Error generating room member token', { cause: error });
		}
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
