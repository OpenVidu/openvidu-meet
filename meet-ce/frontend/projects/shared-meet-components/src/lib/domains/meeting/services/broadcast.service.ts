import { inject, Service } from '@angular/core';
import { MeetBroadcastInfo, MeetBroadcastStartOptions, MeetBroadcastStopOptions } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';

/**
 * The live broadcast API: `/broadcasts`, one broadcast per destination, each of a room's meeting.
 */
@Service()
export class BroadcastService {
	private readonly httpService = inject(HttpService);
	private readonly broadcastsPath = `${HttpService.API_PATH_PREFIX}/broadcasts`;

	async getBroadcasts(roomId: string): Promise<MeetBroadcastInfo[]> {
		const { broadcasts } = await this.httpService.getRequest<{ broadcasts: MeetBroadcastInfo[] }>(
			`${this.broadcastsPath}?roomId=${encodeURIComponent(roomId)}`
		);
		return broadcasts;
	}

	async startBroadcasts(roomId: string, options: MeetBroadcastStartOptions = {}): Promise<MeetBroadcastInfo[]> {
		const { broadcasts } = await this.httpService.postRequest<{ broadcasts: MeetBroadcastInfo[] }>(
			this.broadcastsPath,
			{ roomId, ...options }
		);
		return broadcasts;
	}

	async stopBroadcasts(roomId: string, options: MeetBroadcastStopOptions = {}): Promise<MeetBroadcastInfo[]> {
		const { broadcasts } = await this.httpService.postRequest<{ broadcasts: MeetBroadcastInfo[] }>(
			`${this.broadcastsPath}/stop`,
			{ roomId, ...options }
		);
		return broadcasts;
	}
}
