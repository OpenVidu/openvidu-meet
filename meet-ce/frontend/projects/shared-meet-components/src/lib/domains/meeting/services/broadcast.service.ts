import { inject, Service } from '@angular/core';
import { MeetBroadcastBulkStopResponse, MeetBroadcastInfo, MeetBroadcastStartOptions } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';
import { BroadcastRequestedEvent, BroadcastStateService, isBroadcastRunning } from '../openvidu-components';

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
	private startInFlight?: Promise<MeetBroadcastInfo[]>;

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
				const start = this.startBroadcasts(roomId, { destinationIds, destinations });
				this.startInFlight = start;
				const broadcasts = await start.finally(() => {
					if (this.startInFlight === start) this.startInFlight = undefined;
				});
				this.broadcastState.recordOwnBroadcasts(destinations ?? [], broadcasts);
			} else if (request.broadcastId) {
				await this.stopBroadcast(request.broadcastId);
			} else {
				await this.stopEveryBroadcast();
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

	async stopBroadcast(broadcastId: string): Promise<MeetBroadcastInfo> {
		return this.httpService.deleteRequest<MeetBroadcastInfo>(
			`${this.broadcastsPath}/${encodeURIComponent(broadcastId)}`
		);
	}

	async bulkStopBroadcasts(broadcastIds: string[]): Promise<MeetBroadcastBulkStopResponse> {
		const query = broadcastIds.map(encodeURIComponent).join(',');
		return this.httpService.deleteRequest<MeetBroadcastBulkStopResponse>(
			`${this.broadcastsPath}?broadcastIds=${query}`
		);
	}

	/** Stops the running broadcasts, those of a start still being answered included. */
	private async stopEveryBroadcast(): Promise<void> {
		const started = (await this.startInFlight?.catch(() => [])) ?? [];
		const running = this.broadcastState.inProgress().filter(({ status }) => isBroadcastRunning(status));
		const broadcastIds = new Set([...running, ...started].map(({ broadcastId }) => broadcastId));

		if (broadcastIds.size > 0) await this.bulkStopBroadcasts([...broadcastIds]);
	}
}
