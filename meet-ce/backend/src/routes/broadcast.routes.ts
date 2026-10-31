import bodyParser from 'body-parser';
import { Router } from 'express';
import * as broadcastCtrl from '../controllers/broadcast.controller.js';
import { apiKeyValidator, roomMemberTokenValidator, withAuth } from '../middlewares/auth.middleware.js';
import {
	bodyRoomId,
	broadcastRoomId,
	queryRoomId,
	withEditPermissionToStart,
	withBroadcastEnabled
} from '../middlewares/broadcast.middleware.js';
import { apiLimiter } from '../middlewares/rate-limit.middleware.js';
import {
	validateBroadcastFieldsReq,
	validateBroadcastIdReq,
	validateGetBroadcastsReq,
	validateStartBroadcastReq,
	validateStopBroadcastsReq
} from '../middlewares/request-validators/broadcast-validator.middleware.js';
import { withRoomPermission } from '../middlewares/room.middleware.js';

/**
 * `/broadcasts`: the live broadcasts of the meetings, one per destination, each addressed by its own
 * id as a recording is.
 */
export const broadcastRouter: Router = Router();
broadcastRouter.use(bodyParser.urlencoded({ extended: true }));
broadcastRouter.use(bodyParser.json());
broadcastRouter.use(apiLimiter);

broadcastRouter.post(
	'/',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	validateBroadcastFieldsReq,
	validateStartBroadcastReq,
	withRoomPermission('broadcastControl', bodyRoomId),
	withEditPermissionToStart,
	withBroadcastEnabled,
	broadcastCtrl.startBroadcasts
);
broadcastRouter.get(
	'/',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	validateGetBroadcastsReq,
	withRoomPermission('meetingRead', queryRoomId),
	broadcastCtrl.getBroadcasts
);
broadcastRouter.post(
	'/stop',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	validateBroadcastFieldsReq,
	validateStopBroadcastsReq,
	withRoomPermission('broadcastControl', bodyRoomId),
	broadcastCtrl.stopBroadcasts
);
broadcastRouter.get(
	'/:broadcastId',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	validateBroadcastIdReq,
	validateBroadcastFieldsReq,
	withRoomPermission('meetingRead', broadcastRoomId),
	broadcastCtrl.getBroadcast
);
