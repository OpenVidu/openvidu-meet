import { inject, Service } from '@angular/core';
import { MeetBroadcastDestinationOptions, MeetBroadcastInfo, MeetBroadcastStartOptions } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';

/**
 * The live broadcast API of a meeting: `/meetings/{roomId}/broadcasts`.
 */
@Service()
export class BroadcastService {
	private readonly httpService = inject(HttpService);

	startBroadcast(roomId: string, options: MeetBroadcastStartOptions = {}): Promise<MeetBroadcastInfo> {
		return this.httpService.postRequest(this.broadcastsPath(roomId), options);
	}

	stopBroadcast(roomId: string, broadcastId: string): Promise<MeetBroadcastInfo> {
		return this.httpService.postRequest(`${this.broadcastsPath(roomId)}/${broadcastId}/stop`, {});
	}

	addDestination(
		roomId: string,
		broadcastId: string,
		destination: MeetBroadcastDestinationOptions
	): Promise<MeetBroadcastInfo> {
		return this.httpService.postRequest(`${this.broadcastsPath(roomId)}/${broadcastId}/destinations`, destination);
	}

	updateDestination(
		roomId: string,
		broadcastId: string,
		destinationId: string,
		active: boolean
	): Promise<MeetBroadcastInfo> {
		return this.httpService.putRequest(
			`${this.broadcastsPath(roomId)}/${broadcastId}/destinations/${destinationId}`,
			{
				active
			}
		);
	}

	private broadcastsPath(roomId: string): string {
		return `${HttpService.API_PATH_PREFIX}/meetings/${roomId}/broadcasts`;
	}
}
