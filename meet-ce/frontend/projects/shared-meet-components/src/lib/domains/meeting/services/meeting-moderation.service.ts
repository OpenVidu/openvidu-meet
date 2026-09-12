import { inject, Service } from '@angular/core';
import { MeetParticipantModerationAction, MeetParticipantMuteOptions } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';
import { LoggerService } from '../../../shared/services/logger.service';

@Service()
export class MeetingModerationService {
	protected readonly MEETINGS_API = `${HttpService.API_PATH_PREFIX}/meetings`;

	protected httpService = inject(HttpService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingModerationService');

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
	 * Turns off some of a participant's devices. Moderators cannot be muted, and the participant may
	 * turn the device back on.
	 *
	 * @param roomId - The unique identifier of the meeting room
	 * @param participantIdentity - The identity of the participant to mute
	 * @param media - The devices to turn off
	 */
	async muteParticipant(
		roomId: string,
		participantIdentity: string,
		media: MeetParticipantMuteOptions
	): Promise<void> {
		const path = `${this.MEETINGS_API}/${roomId}/participants/${participantIdentity}/media`;
		await this.httpService.putRequest(path, media);
		this.log.d(`Muted media of participant '${participantIdentity}' in room '${roomId}'`);
	}

	/**
	 * Turns off some of the devices of every participant in the meeting except the moderators.
	 *
	 * @param roomId - The unique identifier of the meeting room
	 * @param media - The devices to turn off
	 */
	async muteAllParticipants(roomId: string, media: MeetParticipantMuteOptions): Promise<void> {
		const path = `${this.MEETINGS_API}/${roomId}/participants/media`;
		await this.httpService.putRequest(path, media);
		this.log.d(`Muted media of every participant in room '${roomId}'`);
	}

	/**
	 * Changes the role of a participant in a meeting.
	 *
	 * @param roomId - The unique identifier of the meeting room
	 * @param participantIdentity - The identity of the participant whose role is to be changed
	 * @param action - Moderation action to apply
	 */
	async changeParticipantRole(
		roomId: string,
		participantIdentity: string,
		action: MeetParticipantModerationAction
	): Promise<void> {
		const path = `${this.MEETINGS_API}/${roomId}/participants/${participantIdentity}/role`;
		const body = { action };
		await this.httpService.putRequest(path, body);
		this.log.d(`Applied moderation action '${action}' to participant '${participantIdentity}' in room '${roomId}'`);
	}
}
