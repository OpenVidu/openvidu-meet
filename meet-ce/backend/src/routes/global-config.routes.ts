import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as globalConfigCtrl from '../controllers/global-config.controller.js';
import { accessTokenValidator, allowAnonymous, withAuth } from '../middlewares/auth.middleware.js';
import { apiLimiter } from '../middlewares/rate-limit.middleware.js';
import {
	validateUpdateRoomsAppearanceConfigReq,
	validateUpdateSecurityConfigReq
} from '../middlewares/request-validators/config-validator.middleware.js';

export const configRouter: Router = Router();
configRouter.use(bodyParser.urlencoded({ extended: true }));
configRouter.use(bodyParser.json());
configRouter.use(apiLimiter);

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

// Captions config
configRouter.get('/captions', withAuth(allowAnonymous), globalConfigCtrl.getCaptionsConfig);
