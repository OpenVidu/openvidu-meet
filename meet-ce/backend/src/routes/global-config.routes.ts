import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as appearanceConfigCtrl from '../controllers/global-config/appearance-config.controller.js';
import * as securityConfigCtrl from '../controllers/global-config/security-config.controller.js';
import * as webhookConfigCtrl from '../controllers/global-config/webhook-config.controller.js';
import {
	allowAnonymous,
	tokenAndRoleValidator,
	validateRoomsAppearanceConfig,
	validateSecurityConfig,
	validateWebhookConfig,
	withAuth,
	withValidWebhookTestRequest
} from '../middlewares/index.js';

export const configRouter: Router = Router();
configRouter.use(bodyParser.urlencoded({ extended: true }));
configRouter.use(bodyParser.json());

// Webhook config
configRouter.put(
	'/webhooks',
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)),
	validateWebhookConfig,
	webhookConfigCtrl.updateWebhookConfig
);
configRouter.get('/webhooks', withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)), webhookConfigCtrl.getWebhookConfig);
configRouter.post('/webhooks/test', withValidWebhookTestRequest, webhookConfigCtrl.testWebhook);

// Security config
configRouter.put(
	'/security',
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)),
	validateSecurityConfig,
	securityConfigCtrl.updateSecurityConfig
);
configRouter.get('/security', withAuth(allowAnonymous), securityConfigCtrl.getSecurityConfig);

// Appearance config
configRouter.put(
	'/rooms/appearance',
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)),
	validateRoomsAppearanceConfig,
	appearanceConfigCtrl.updateRoomsAppearanceConfig
);
configRouter.get('/rooms/appearance', withAuth(allowAnonymous), appearanceConfigCtrl.getRoomsAppearanceConfig);
