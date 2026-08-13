import { inject, Service } from '@angular/core';
import { MeetWebhook, MeetWebhookOptions } from '@openvidu-meet/typings';
import { HttpService } from './http.service';

/**
 * Client of the webhook resource: the endpoints OpenVidu Meet delivers event notifications to,
 * each optionally filtered by event type and scoped to a single room. The resource lives on the
 * public API; the console reaches it with the admin session.
 */
@Service()
export class WebhookService {
	protected httpService = inject(HttpService);

	protected readonly WEBHOOKS_API = `${HttpService.API_PATH_PREFIX}/webhooks`;

	async getWebhooks(): Promise<MeetWebhook[]> {
		const { webhooks } = await this.httpService.getRequest<{ webhooks: MeetWebhook[] }>(this.WEBHOOKS_API);
		return webhooks;
	}

	async createWebhook(options: MeetWebhookOptions): Promise<MeetWebhook> {
		return this.httpService.postRequest<MeetWebhook>(this.WEBHOOKS_API, options);
	}

	/**
	 * Replaces the definition of a webhook (PUT semantics: an omitted optional field is cleared).
	 */
	async updateWebhook(webhookId: string, options: MeetWebhookOptions): Promise<MeetWebhook> {
		return this.httpService.putRequest<MeetWebhook>(`${this.WEBHOOKS_API}/${webhookId}`, options);
	}

	async deleteWebhook(webhookId: string): Promise<void> {
		await this.httpService.deleteRequest(`${this.WEBHOOKS_API}/${webhookId}`);
	}

	/**
	 * Sends a test event to the stored URL of a webhook.
	 */
	async testWebhook(webhookId: string): Promise<void> {
		await this.httpService.postRequest(`${this.WEBHOOKS_API}/${webhookId}/test`);
	}
}
