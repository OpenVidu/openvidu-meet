import { Request, Response } from 'express';
import { WebhookEvent } from 'livekit-server-sdk';
import ms from 'ms';
import { container } from '../config/dependency-injector.config.js';
import { MeetLock } from '../helpers/redis.helper.js';
import { LivekitWebhookService } from '../services/livekit-webhook.service.js';
import { LoggerService } from '../services/logger.service.js';
import { MutexService } from '../services/mutex.service.js';

export const lkWebhookHandler = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const mutexService = container.get(MutexService);

	try {
		const lkWebhookService = container.get(LivekitWebhookService);
		const webhookEvent: WebhookEvent = await lkWebhookService.getEventFromWebhook(req.body, req.get('Authorization')!);
		const webhookLockKey = MeetLock.getWebhookLock(webhookEvent);

		const executionResult = await mutexService.withLock(webhookLockKey, ms('5s'), async () => {
			const { event: eventType, egressInfo, room, participant } = webhookEvent;

			const belongsToOpenViduMeet = await lkWebhookService.webhookEventBelongsToOpenViduMeet(webhookEvent);

			if (!belongsToOpenViduMeet) {
				logger.verbose(`Webhook skipped: ${eventType}. Not related to OpenVidu Meet.`);
				return;
			}

			logger.info(`Webhook received: ${eventType}`);
			logger.debug(`Webhook event object: ${JSON.stringify(webhookEvent, null, 2)}`);

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
				case 'participant_left':
					await lkWebhookService.handleParticipantLeft(room!, participant!);
					break;
				case 'room_started':
					await lkWebhookService.handleRoomStarted(room!);
					break;
				case 'room_finished':
					await lkWebhookService.handleRoomFinished(room!);
					break;
				default:
					break;
			}

			return true;
		});

		if (executionResult === null) {
			logger.debug(`Webhook processing skipped: another instance is already processing '${webhookLockKey}'`);
			return res.status(200).send();
		}
	} catch (error) {
		logger.error(`Error handling webhook event: ${error}`);
	}

	return res.status(200).send();
};
