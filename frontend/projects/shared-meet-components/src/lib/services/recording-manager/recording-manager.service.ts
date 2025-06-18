import { Injectable } from '@angular/core';
import { HttpService } from '../../services';

@Injectable({
	providedIn: 'root'
})
export class RecordingManagerService {
	constructor(private httpService: HttpService) {}

	/**
	 * Starts recording for a room
	 */
	async startRecording(roomId: string): Promise<void> {
		try {
			await this.httpService.startRecording(roomId);
		} catch (error) {
			console.error('Error starting recording:', error);
			throw error;
		}
	}

	/**
	 * Stops recording by recording ID
	 */
	async stopRecording(recordingId: string | undefined): Promise<void> {
		if (!recordingId) {
			throw new Error('Recording ID not found when stopping recording');
		}

		try {
			await this.httpService.stopRecording(recordingId);
		} catch (error) {
			console.error('Error stopping recording:', error);
			throw error;
		}
	}
}
