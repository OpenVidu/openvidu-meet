import { Router } from 'express';
import bodyParser from 'body-parser';
import * as roomCtrl from '../controllers/room.controller.js';
import {
	withAuth,
	tokenAndRoleValidator,
	apiKeyValidator,
	participantTokenValidator,
	validateGetParticipantRoleRequest,
	validateGetRoomQueryParams,
	withValidRoomOptions,
	configureCreateRoomAuth,
	configureRoomAuthorization
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
	validateGetRoomQueryParams,
	roomCtrl.getRooms
);
roomRouter.get(
	'/:roomId',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN), participantTokenValidator),
	configureRoomAuthorization,
	validateGetRoomQueryParams,
	roomCtrl.getRoom
);
roomRouter.delete('/:roomId', withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)), roomCtrl.deleteRooms);

// Room preferences
roomRouter.put('/', withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)), roomCtrl.updateRoomPreferences);

// Internal room routes
export const internalRoomRouter = Router();
internalRoomRouter.use(bodyParser.urlencoded({ extended: true }));
internalRoomRouter.use(bodyParser.json());

internalRoomRouter.get('/:roomId/participant-role', validateGetParticipantRoleRequest, roomCtrl.getParticipantRole);
