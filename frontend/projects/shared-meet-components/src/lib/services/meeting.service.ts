import { Injectable } from '@angular/core';
import { HttpService, ParticipantService } from '@lib/services';
import { LoggerService } from 'openvidu-components-angular';

@Injectable({
	providedIn: 'root'
})
export class MeetingService {
	protected readonly MEETINGS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/meetings`;

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService,
		protected participantService: ParticipantService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - MeetingService');
	}

	/**
	 * Ends a meeting by its room ID.
	 *
	 * @param roomId - The unique identifier of the meeting room
	 * @returns A promise that resolves when the meeting has been ended
	 */
	async endMeeting(roomId: string): Promise<any> {
		const path = `${this.MEETINGS_API}/${roomId}`;
		const headers = this.participantService.getParticipantRoleHeader();
		return this.httpService.deleteRequest(path, headers);
	}

	/**
	 * Kicks a participant from a meeting.
	 *
	 * @param roomId - The unique identifier of the meeting room
	 * @param participantIdentity - The identity of the participant to be kicked
	 * @returns A promise that resolves when the participant has been kicked
	 */
	async kickParticipant(roomId: string, participantIdentity: string): Promise<void> {
		const path = `${this.MEETINGS_API}/${roomId}/participants/${participantIdentity}`;
		const headers = this.participantService.getParticipantRoleHeader();
		await this.httpService.deleteRequest(path, headers);
		this.log.d(`Participant '${participantIdentity}' kicked from room ${roomId}`);
	}

	/**
	 * Changes the role of a participant in a meeting.
	 *
	 * @param roomId - The unique identifier of the meeting room
	 * @param participantIdentity - The identity of the participant whose role is to be changed
	 * @param newRole - The new role to be assigned to the participant
	 */
	async changeParticipantRole(roomId: string, participantIdentity: string, newRole: string): Promise<void> {
		const path = `${this.MEETINGS_API}/${roomId}/participants/${participantIdentity}/role`;
		const headers = this.participantService.getParticipantRoleHeader();
		const body = { role: newRole };
		await this.httpService.putRequest(path, body, headers);
		this.log.d(`Changed role of participant '${participantIdentity}' to '${newRole}' in room '${roomId}'`);
	}
}
