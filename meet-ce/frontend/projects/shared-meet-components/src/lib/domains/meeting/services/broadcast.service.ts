import { inject, Service } from '@angular/core';
import { MeetBroadcastInfo, MeetBroadcastStartOptions, MeetBroadcastStopOptions } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';
import { BroadcastRequestedEvent, BroadcastStateService } from '../openvidu-components';

const errorMessageOf = (error: unknown): string | undefined => {
	const message = (error as { error?: { message?: unknown } } | undefined)?.error?.message;
	return typeof message === 'string' ? message : undefined;
};

/**
 * The live broadcast API: `/broadcasts`, one broadcast per destination, each of a room's meeting.
 */
@Service()
export class BroadcastService {
	private readonly httpService = inject(HttpService);
	private readonly broadcastState = inject(BroadcastStateService);
	private readonly broadcastsPath = `${HttpService.API_PATH_PREFIX}/broadcasts`;

	/**
	 * Sends what the local participant asks of the broadcasts, from the activity or from the host
	 * application, keeping {@link BroadcastStateService} told while it is pending and of a refusal,
	 * which is thrown back too. The broadcasts themselves arrive as signals.
	 */
	async request(request: BroadcastRequestedEvent): Promise<void> {
		this.broadcastState.requestStarted(request);

		try {
			if (request.action === 'start') {
				const { roomId, destinationIds, destinations } = request;
				const broadcasts = await this.startBroadcasts(roomId, { destinationIds, destinations });
				this.broadcastState.recordOwnBroadcasts(destinations ?? [], broadcasts);
			} else {
				await this.stopBroadcasts(request.roomId, { broadcastIds: request.broadcastIds });
			}

			this.broadcastState.requestSucceeded(request);
		} catch (error) {
			this.broadcastState.requestFailed(request, errorMessageOf(error));
			throw error;
		}
	}

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
