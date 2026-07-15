import { inject, Service } from '@angular/core';
import { MeetAnalytics } from '@openvidu-meet/typings';
import { HttpService } from './http.service';

@Service()
export class AnalyticsService {
	protected httpService = inject(HttpService);

	protected readonly ANALYTICS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/analytics`;

	/**
	 * Retrieves usage analytics for OpenVidu Meet.
	 * Includes metrics for rooms and recordings.
	 *
	 * @returns Analytics data with room and recording metrics
	 */
	async getAnalytics(): Promise<MeetAnalytics> {
		return this.httpService.getRequest(this.ANALYTICS_API);
	}
}
