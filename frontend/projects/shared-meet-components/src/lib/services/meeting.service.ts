import { Injectable } from '@angular/core';
import { HttpService } from '@lib/services';
import { LoggerService } from 'openvidu-components-angular';

@Injectable({
	providedIn: 'root'
})
export class MeetingService {
	protected readonly MEETINGS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/meetings`;

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService
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
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Kicks a participant from a meeting.
	 *
	 * @param roomId - The unique identifier of the meeting room
	 * @param participantId - The unique identifier of the participant to be kicked
	 * @returns A promise that resolves when the participant has been kicked
	 */
	async kickParticipant(roomId: string, participantId: string): Promise<void> {
		const path = `${this.MEETINGS_API}/${roomId}/participants/${participantId}`;
		await this.httpService.deleteRequest(path);
		this.log.d(`Participant '${participantId}' kicked from room ${roomId}`);
	}
}
