import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as globalConfigCtrl from '../controllers/global-config.controller.js';
import { accessTokenValidator, allowAnonymous, withAuth } from '../middlewares/auth.middleware.js';
import {
	validateTestWebhookReq,
	validateUpdateRoomsAppearanceConfigReq,
	validateUpdateSecurityConfigReq,
	validateUpdateWebhookConfigReq
} from '../middlewares/request-validators/config-validator.middleware.js';

export const configRouter: Router = Router();
configRouter.use(bodyParser.urlencoded({ extended: true }));
configRouter.use(bodyParser.json());

// Webhook config
configRouter.put(
	'/webhooks',
	withAuth(accessTokenValidator(MeetUserRole.ADMIN)),
	validateUpdateWebhookConfigReq,
	globalConfigCtrl.updateWebhookConfig
);
configRouter.get('/webhooks', withAuth(accessTokenValidator(MeetUserRole.ADMIN)), globalConfigCtrl.getWebhookConfig);
configRouter.post('/webhooks/test', validateTestWebhookReq, globalConfigCtrl.testWebhook);

// Security config
configRouter.put(
	'/security',
	withAuth(accessTokenValidator(MeetUserRole.ADMIN)),
	validateUpdateSecurityConfigReq,
	globalConfigCtrl.updateSecurityConfig
);
configRouter.get('/security', withAuth(allowAnonymous), globalConfigCtrl.getSecurityConfig);

// Appearance config
configRouter.put(
	'/rooms/appearance',
	withAuth(accessTokenValidator(MeetUserRole.ADMIN)),
	validateUpdateRoomsAppearanceConfigReq,
	globalConfigCtrl.updateRoomsAppearanceConfig
);
configRouter.get('/rooms/appearance', withAuth(allowAnonymous), globalConfigCtrl.getRoomsAppearanceConfig);
