import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as roomCtrl from '../controllers/room.controller.js';
import {
	allowAnonymous,
	apiKeyValidator,
	configureRoomAuthorization,
	configureRoomMemberTokenAuth,
	roomMemberTokenValidator,
	tokenAndRoleValidator,
	withAuth,
	withValidRoomBulkDeleteRequest,
	withValidRoomConfig,
	withValidRoomDeleteRequest,
	withValidRoomFiltersRequest,
	withValidRoomId,
	withValidRoomMemberTokenRequest,
	withValidRoomOptions,
	withValidRoomStatus
} from '../middlewares/index.js';

export const roomRouter: Router = Router();
roomRouter.use(bodyParser.urlencoded({ extended: true }));
roomRouter.use(bodyParser.json());

// Room Routes
roomRouter.post(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN)),
	withValidRoomOptions,
	roomCtrl.createRoom
);
roomRouter.get(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN)),
	withValidRoomFiltersRequest,
	roomCtrl.getRooms
);
roomRouter.delete(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN)),
	withValidRoomBulkDeleteRequest,
	roomCtrl.bulkDeleteRooms
);

roomRouter.get(
	'/:roomId',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN), roomMemberTokenValidator),
	withValidRoomId,
	configureRoomAuthorization,
	roomCtrl.getRoom
);
roomRouter.delete(
	'/:roomId',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN)),
	withValidRoomDeleteRequest,
	roomCtrl.deleteRoom
);

roomRouter.get(
	'/:roomId/config',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN), roomMemberTokenValidator),
	withValidRoomId,
	configureRoomAuthorization,
	roomCtrl.getRoomConfig
);
roomRouter.put(
	'/:roomId/config',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN)),
	withValidRoomId,
	withValidRoomConfig,
	roomCtrl.updateRoomConfig
);

roomRouter.put(
	'/:roomId/status',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN)),
	withValidRoomId,
	withValidRoomStatus,
	roomCtrl.updateRoomStatus
);

// Internal room routes
export const internalRoomRouter: Router = Router();
internalRoomRouter.use(bodyParser.urlencoded({ extended: true }));
internalRoomRouter.use(bodyParser.json());

internalRoomRouter.post(
	'/:roomId/token',
	withValidRoomId,
	withValidRoomMemberTokenRequest,
	configureRoomMemberTokenAuth,
	roomCtrl.generateRoomMemberToken
);
internalRoomRouter.get(
	'/:roomId/roles',
	withAuth(allowAnonymous),
	withValidRoomId,
	roomCtrl.getRoomMemberRolesAndPermissions
);
internalRoomRouter.get(
	'/:roomId/roles/:secret',
	withAuth(allowAnonymous),
	withValidRoomId,
	roomCtrl.getRoomMemberRoleAndPermissions
);
