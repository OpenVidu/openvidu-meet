import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as webhookCtrl from '../controllers/webhook.controller.js';
import { accessTokenValidator, apiKeyValidator, withAuth } from '../middlewares/auth.middleware.js';
import { apiLimiter } from '../middlewares/rate-limit.middleware.js';
import { validateWebhookOptionsReq } from '../middlewares/request-validators/webhook-validator.middleware.js';

export const webhookRouter: Router = Router();
webhookRouter.use(bodyParser.urlencoded({ extended: true }));
webhookRouter.use(bodyParser.json());
webhookRouter.use(apiLimiter);

// Webhook Routes
// Webhooks deliver events from every room, so managing them is deployment-level: a
// service-to-service API key or an admin from the console.
webhookRouter.post(
	'/',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)),
	validateWebhookOptionsReq,
	webhookCtrl.createWebhook
);
webhookRouter.get('/', withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)), webhookCtrl.getWebhooks);
webhookRouter.get(
	'/:webhookId',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)),
	webhookCtrl.getWebhook
);
webhookRouter.put(
	'/:webhookId',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)),
	validateWebhookOptionsReq,
	webhookCtrl.updateWebhook
);
webhookRouter.delete(
	'/:webhookId',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)),
	webhookCtrl.deleteWebhook
);
webhookRouter.post(
	'/:webhookId/test',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)),
	webhookCtrl.sendWebhookTestEvent
);
