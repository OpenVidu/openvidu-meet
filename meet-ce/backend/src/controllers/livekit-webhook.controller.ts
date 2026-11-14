import type { Request, Response } from 'express';
import type { WebhookEvent, WebhookEventNames } from 'livekit-server-sdk';
import ms from 'ms';
import { container } from '../config/dependency-injector.config.js';
import { MeetLock } from '../helpers/redis.helper.js';
import { LivekitWebhookService } from '../services/livekit-webhook.service.js';
import { LoggerService } from '../services/logger.service.js';
import { MutexService } from '../services/mutex.service.js';

type WebhookHandler = (service: LivekitWebhookService, event: WebhookEvent) => Promise<void>;

const handlers: Partial<Record<WebhookEventNames, WebhookHandler>> = {
	egress_started: (service, { egressInfo }) => service.handleEgressStarted(egressInfo!),
	egress_updated: (service, { egressInfo }) => service.handleEgressUpdated(egressInfo!),
	egress_ended: (service, { egressInfo }) => service.handleEgressEnded(egressInfo!),
	participant_joined: (service, { room, participant }) => service.handleParticipantJoined(room!, participant!),
	participant_left: (service, { room, participant }) => service.handleParticipantLeft(room!, participant!),
	room_started: (service, { room }) => service.handleRoomStarted(room!),
	room_finished: (service, { room }) => service.handleRoomFinished(room!)
};

export const lkWebhookHandler = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const mutexService = container.get(MutexService);

	try {
		const lkWebhookService = container.get(LivekitWebhookService);
		const webhookEvent: WebhookEvent = await lkWebhookService.getEventFromWebhook(
			req.body as string,
			req.get('Authorization')
		);
		const handle = handlers[webhookEvent.event];

		if (!handle) {
			logger.debug(`Webhook skipped: ${webhookEvent.event}. OpenVidu Meet does not handle it.`);
			return res.status(200).send();
		}

		const webhookLockKey = MeetLock.getWebhookLock(webhookEvent);
		const belongsToOpenViduMeet = await lkWebhookService.webhookEventBelongsToOpenViduMeet(webhookEvent);

		if (!belongsToOpenViduMeet) {
			logger.verbose(`Webhook skipped: ${webhookEvent.event}. Not related to OpenVidu Meet.`);
			return res.status(200).send();
		}

		const executionResult = await mutexService.withLock(webhookLockKey, ms('5s'), async () => {
			logger.verbose(`Webhook received: ${webhookEvent.event}`);
			await handle(lkWebhookService, webhookEvent);
			return true;
		});

		if (executionResult === null) {
			logger.debug(`Webhook processing skipped: another instance is already processing '${webhookLockKey}'`);
			return res.status(200).send();
		}
	} catch (error) {
		logger.warn('Webhook event could not be processed', error);
	}

	return res.status(200).send();
};
