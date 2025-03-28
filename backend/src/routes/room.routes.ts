import { Router } from 'express';
import bodyParser from 'body-parser';
import * as roomCtrl from '../controllers/room.controller.js';
import {
	withAuth,
	tokenAndRoleValidator,
	apiKeyValidator,
	participantTokenValidator
} from '../middlewares/auth.middleware.js';
import {
	validateGetParticipantRoleRequest,
	validateGetRoomQueryParams,
	validateRoomRequest
} from '../middlewares/request-validators/room-validator.middleware.js';
import { UserRole } from '@typings-ce';
import { configureCreateRoomAuth, configureRoomAuthorization } from '../middlewares/room.middleware.js';

export const roomRouter = Router();

roomRouter.use(bodyParser.urlencoded({ extended: true }));
roomRouter.use(bodyParser.json());

// Room Routes
roomRouter.post('/', configureCreateRoomAuth, validateRoomRequest, roomCtrl.createRoom);
roomRouter.get(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	validateGetRoomQueryParams,
	roomCtrl.getRooms
);
roomRouter.get(
	'/:roomName',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN), participantTokenValidator),
	configureRoomAuthorization,
	validateGetRoomQueryParams,
	roomCtrl.getRoom
);
roomRouter.delete('/:roomName', withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)), roomCtrl.deleteRooms);

// Room preferences
roomRouter.put('/', withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)), roomCtrl.updateRoomPreferences);

// Internal room routes
export const internalRoomRouter = Router();
internalRoomRouter.use(bodyParser.urlencoded({ extended: true }));
internalRoomRouter.use(bodyParser.json());

internalRoomRouter.get('/:roomName/participant-role', validateGetParticipantRoleRequest, roomCtrl.getParticipantRole);
