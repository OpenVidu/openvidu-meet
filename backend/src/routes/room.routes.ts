import { UserRole } from '@typings-ce';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as roomCtrl from '../controllers/room.controller.js';
import {
	allowAnonymous,
	apiKeyValidator,
	configureRecordingTokenAuth,
	configureRoomAuthorization,
	participantTokenValidator,
	tokenAndRoleValidator,
	withAuth,
	withValidRoomBulkDeleteRequest,
	withValidRoomDeleteRequest,
	withValidRoomFiltersRequest,
	withValidRoomId,
	withValidRoomOptions,
	withValidRoomPreferences,
	withValidRoomSecret
} from '../middlewares/index.js';

export const roomRouter = Router();
roomRouter.use(bodyParser.urlencoded({ extended: true }));
roomRouter.use(bodyParser.json());

// Room Routes
roomRouter.post(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRoomOptions,
	roomCtrl.createRoom
);
roomRouter.get(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRoomFiltersRequest,
	roomCtrl.getRooms
);
roomRouter.delete(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRoomBulkDeleteRequest,
	roomCtrl.bulkDeleteRooms
);
roomRouter.get(
	'/:roomId',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN), participantTokenValidator),
	configureRoomAuthorization,
	withValidRoomId,
	roomCtrl.getRoom
);
roomRouter.delete(
	'/:roomId',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRoomDeleteRequest,
	roomCtrl.deleteRoom
);

// Internal room routes
export const internalRoomRouter = Router();
internalRoomRouter.use(bodyParser.urlencoded({ extended: true }));
internalRoomRouter.use(bodyParser.json());

internalRoomRouter.put(
	'/:roomId',
	withAuth(tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRoomId,
	withValidRoomPreferences,
	roomCtrl.updateRoomPreferences
);
internalRoomRouter.post(
	'/:roomId/recording-token',
	configureRecordingTokenAuth,
	withValidRoomId,
	withValidRoomSecret,
	roomCtrl.generateRecordingToken
);
internalRoomRouter.get(
	'/:roomId/roles',
	withAuth(allowAnonymous),
	withValidRoomId,
	roomCtrl.getRoomRolesAndPermissions
);
internalRoomRouter.get(
	'/:roomId/roles/:secret',
	withAuth(allowAnonymous),
	withValidRoomId,
	roomCtrl.getRoomRoleAndPermissions
);
