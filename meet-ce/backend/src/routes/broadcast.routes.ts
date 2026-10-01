import { Router } from 'express';
import * as broadcastCtrl from '../controllers/broadcast.controller.js';
import { apiKeyValidator, roomMemberTokenValidator, withAuth } from '../middlewares/auth.middleware.js';
import { withAddDestinationsPermissionToStart, withBroadcastEnabled } from '../middlewares/broadcast.middleware.js';
import {
	validateAddBroadcastDestinationReq,
	validateBroadcastFieldsReq,
	validateStartBroadcastReq,
	validateUpdateBroadcastDestinationReq
} from '../middlewares/request-validators/broadcast-validator.middleware.js';
import { withValidRoomId } from '../middlewares/request-validators/room-validator.middleware.js';
import { withRoomPermission } from '../middlewares/room.middleware.js';

/**
 * `/meetings/:roomId/broadcasts`: the live broadcast of a meeting. Mounted by the meeting router,
 * whose body parsing and rate limit it inherits, and reads `roomId` from the mount path.
 */
export const broadcastRouter: Router = Router({ mergeParams: true });

broadcastRouter.post(
	'/',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateBroadcastFieldsReq,
	validateStartBroadcastReq,
	withRoomPermission('broadcastControl'),
	withAddDestinationsPermissionToStart,
	withBroadcastEnabled,
	broadcastCtrl.startBroadcast
);
broadcastRouter.get(
	'/',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateBroadcastFieldsReq,
	withRoomPermission('meetingRead'),
	broadcastCtrl.getBroadcasts
);
broadcastRouter.get(
	'/:broadcastId',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateBroadcastFieldsReq,
	withRoomPermission('meetingRead'),
	broadcastCtrl.getBroadcast
);
broadcastRouter.post(
	'/:broadcastId/stop',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateBroadcastFieldsReq,
	withRoomPermission('broadcastControl'),
	broadcastCtrl.stopBroadcast
);
broadcastRouter.post(
	'/:broadcastId/destinations',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateBroadcastFieldsReq,
	validateAddBroadcastDestinationReq,
	withRoomPermission('broadcastControl'),
	withRoomPermission('broadcastAddDestinations'),
	broadcastCtrl.addBroadcastDestination
);
broadcastRouter.put(
	'/:broadcastId/destinations/:destinationId',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateBroadcastFieldsReq,
	validateUpdateBroadcastDestinationReq,
	withRoomPermission('broadcastControl'),
	broadcastCtrl.updateBroadcastDestination
);
