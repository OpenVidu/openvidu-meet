import { inject, Service } from '@angular/core';
import { MeetBroadcastInfo, MeetBroadcastStartOptions, MeetBroadcastStopOptions } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';

/**
 * The live broadcast API of a meeting: `/meetings/{roomId}/broadcasts`, one broadcast per destination.
 */
@Service()
export class BroadcastService {
	private readonly httpService = inject(HttpService);

	async startBroadcasts(roomId: string, options: MeetBroadcastStartOptions = {}): Promise<MeetBroadcastInfo[]> {
		const { broadcasts } = await this.httpService.postRequest<{ broadcasts: MeetBroadcastInfo[] }>(
			this.broadcastsPath(roomId),
			options
		);
		return broadcasts;
	}

	async stopBroadcasts(roomId: string, options: MeetBroadcastStopOptions = {}): Promise<MeetBroadcastInfo[]> {
		const { broadcasts } = await this.httpService.postRequest<{ broadcasts: MeetBroadcastInfo[] }>(
			`${this.broadcastsPath(roomId)}/stop`,
			options
		);
		return broadcasts;
	}

	private broadcastsPath(roomId: string): string {
		return `${HttpService.API_PATH_PREFIX}/meetings/${roomId}/broadcasts`;
	}
}
