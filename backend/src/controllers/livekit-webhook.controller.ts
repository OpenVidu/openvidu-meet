import { Request, Response } from 'express';
import { LoggerService } from '../services/logger.service.js';
import { LivekitWebhookService } from '../services/livekit-webhook.service.js';
import { WebhookEvent } from 'livekit-server-sdk';
import { container } from '../config/dependency-injector.config.js';

export const lkWebhookHandler = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	try {
		const lkWebhookService = container.get(LivekitWebhookService);

		const webhookEvent: WebhookEvent = await lkWebhookService.getEventFromWebhook(
			req.body,
			req.get('Authorization')!
		);
		const { event: eventType, egressInfo, room, participant } = webhookEvent;

		const belongsToOpenViduMeet = await lkWebhookService.webhookEventBelongsToOpenViduMeet(webhookEvent);

		if (!belongsToOpenViduMeet) {
			logger.verbose(`Skipping webhook, event is not related to OpenVidu Meet: ${eventType}`);
			return res.status(200).send();
		}

		logger.verbose(`Received webhook event: ${eventType}`);

		switch (eventType) {
			case 'egress_started':
				await lkWebhookService.handleEgressStarted(egressInfo!);
				break;
			case 'egress_updated':
				await lkWebhookService.handleEgressUpdated(egressInfo!);
				break;
			case 'egress_ended':
				await lkWebhookService.handleEgressEnded(egressInfo!);
				break;
			case 'participant_joined':
				await lkWebhookService.handleParticipantJoined(room!, participant!);
				break;
			case 'room_finished':
				await lkWebhookService.handleRoomFinished(room!);
				break;
			default:
				break;
		}
	} catch (error) {
		logger.error(`Error handling webhook event: ${error}`);
	}

	return res.status(200).send();
};
