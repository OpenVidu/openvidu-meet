import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as roomCtrl from '../controllers/room.controller.js';
import {
	allowAnonymous,
	apiKeyValidator,
	roomMemberTokenValidator,
	tokenAndRoleValidator,
	withAuth
} from '../middlewares/auth.middleware.js';
import { configureRoomMemberTokenAuth } from '../middlewares/participant.middleware.js';
import {
	validateBulkDeleteRoomsReq,
	validateCreateRoomMemberTokenReq,
	validateCreateRoomReq,
	validateDeleteRoomReq,
	validateGetRoomsReq,
	validateUpdateRoomConfigReq,
	validateUpdateRoomStatusReq,
	withValidRoomId
} from '../middlewares/request-validators/room-validator.middleware.js';
import { configureRoomAuthorization } from '../middlewares/room.middleware.js';

export const roomRouter: Router = Router();
roomRouter.use(bodyParser.urlencoded({ extended: true }));
roomRouter.use(bodyParser.json());

// Room Routes
roomRouter.post(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN)),
	validateCreateRoomReq,
	roomCtrl.createRoom
);
roomRouter.get(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN)),
	validateGetRoomsReq,
	roomCtrl.getRooms
);
roomRouter.delete(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN)),
	validateBulkDeleteRoomsReq,
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
	validateDeleteRoomReq,
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
	validateUpdateRoomConfigReq,
	roomCtrl.updateRoomConfig
);

roomRouter.put(
	'/:roomId/status',
	withAuth(apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN)),
	withValidRoomId,
	validateUpdateRoomStatusReq,
	roomCtrl.updateRoomStatus
);

// Internal room routes
export const internalRoomRouter: Router = Router();
internalRoomRouter.use(bodyParser.urlencoded({ extended: true }));
internalRoomRouter.use(bodyParser.json());

internalRoomRouter.post(
	'/:roomId/token',
	withValidRoomId,
	validateCreateRoomMemberTokenReq,
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
