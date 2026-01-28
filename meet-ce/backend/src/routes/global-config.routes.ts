import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as globalConfigCtrl from '../controllers/global-config.controller.js';
import { allowAnonymous, tokenAndRoleValidator, withAuth } from '../middlewares/auth.middleware.js';
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
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)),
	validateUpdateWebhookConfigReq,
	globalConfigCtrl.updateWebhookConfig
);
configRouter.get('/webhooks', withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)), globalConfigCtrl.getWebhookConfig);
configRouter.post('/webhooks/test', validateTestWebhookReq, globalConfigCtrl.testWebhook);

// Security config
configRouter.put(
	'/security',
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)),
	validateUpdateSecurityConfigReq,
	globalConfigCtrl.updateSecurityConfig
);
configRouter.get('/security', withAuth(allowAnonymous), globalConfigCtrl.getSecurityConfig);

// Appearance config
configRouter.put(
	'/rooms/appearance',
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)),
	validateUpdateRoomsAppearanceConfigReq,
	globalConfigCtrl.updateRoomsAppearanceConfig
);
configRouter.get('/rooms/appearance', withAuth(allowAnonymous), globalConfigCtrl.getRoomsAppearanceConfig);

// Captions config
configRouter.get('/captions', withAuth(allowAnonymous), globalConfigCtrl.getCaptionsConfig);
