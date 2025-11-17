import { inject, Injectable } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { LoggerService } from 'openvidu-components-angular';
import { HttpService } from '../http.service';
import { MeetRoom } from 'node_modules/@openvidu-meet/typings/dist/room';
import { NotificationService } from '../notification.service';

@Injectable({
	providedIn: 'root'
})
export class MeetingService {
	protected readonly MEETINGS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/meetings`;
	protected loggerService: LoggerService = inject(LoggerService);
	protected notificationService = inject(NotificationService);

	protected httpService: HttpService = inject(HttpService);
	protected clipboard = inject(Clipboard);

	protected log = this.loggerService.get('OpenVidu Meet - MeetingService');

	/**
	 * Copies the meeting speaker link to the clipboard.
	 */
	copyMeetingSpeakerLink(room: MeetRoom): void {
		const speakerLink = room.speakerUrl;
		this.clipboard.copy(speakerLink);
		this.notificationService.showSnackbar('Speaker link copied to clipboard');
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
	 * @param participantIdentity - The identity of the participant to be kicked
	 * @returns A promise that resolves when the participant has been kicked
	 */
	async kickParticipant(roomId: string, participantIdentity: string): Promise<void> {
		const path = `${this.MEETINGS_API}/${roomId}/participants/${participantIdentity}`;
		await this.httpService.deleteRequest(path);
		this.log.d(`Participant '${participantIdentity}' kicked from room '${roomId}'`);
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
		const body = { role: newRole };
		await this.httpService.putRequest(path, body);
		this.log.d(`Changed role of participant '${participantIdentity}' to '${newRole}' in room '${roomId}'`);
	}
}
