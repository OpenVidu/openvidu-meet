import { Router } from 'express';
import bodyParser from 'body-parser';
import * as roomCtrl from '../controllers/room.controller.js';
import {
	withAuth,
	tokenAndRoleValidator,
	apiKeyValidator,
	participantTokenValidator,
	validateGetParticipantRoleRequest,
	withValidRoomFiltersRequest,
	withValidRoomOptions,
	configureCreateRoomAuth,
	configureRoomAuthorization,
	withValidRoomPreferences,
	withValidRoomBulkDeleteRequest,
	withValidRoomId,
	withValidRoomDeleteRequest
} from '../middlewares/index.js';

import { UserRole } from '@typings-ce';

export const roomRouter = Router();
roomRouter.use(bodyParser.urlencoded({ extended: true }));
roomRouter.use(bodyParser.json());

// Room Routes
roomRouter.post('/', configureCreateRoomAuth, withValidRoomOptions, roomCtrl.createRoom);
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

// Room preferences
internalRoomRouter.put(
	'/:roomId',
	withAuth(tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRoomPreferences,
	roomCtrl.updateRoomPreferences
);

internalRoomRouter.get('/:roomId/participant-role', validateGetParticipantRoleRequest, roomCtrl.getParticipantRole);
