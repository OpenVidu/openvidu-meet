import { Router } from 'express';
import bodyParser from 'body-parser';
import * as roomCtrl from '../controllers/room.controller.js';
import { withAuth, tokenAndRoleValidator, apiKeyValidator } from '../middlewares/auth.middleware.js';
import {
	validateGetRoomQueryParams,
	validateRoomRequest
} from '../middlewares/request-validators/room-validator.middleware.js';
import { Role } from '@typings-ce';

export const roomRouter = Router();

roomRouter.use(bodyParser.urlencoded({ extended: true }));
roomRouter.use(bodyParser.json());

// Room Routes
roomRouter.post(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(Role.ADMIN), tokenAndRoleValidator(Role.USER)),
	validateRoomRequest,
	roomCtrl.createRoom
);
roomRouter.get(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(Role.ADMIN)),
	validateGetRoomQueryParams,
	roomCtrl.getRooms
);
roomRouter.get(
	'/:roomName',
	withAuth(apiKeyValidator, tokenAndRoleValidator(Role.ADMIN), tokenAndRoleValidator(Role.USER)),
	validateGetRoomQueryParams,
	roomCtrl.getRoom
);
roomRouter.delete('/:roomName', withAuth(apiKeyValidator, tokenAndRoleValidator(Role.ADMIN)), roomCtrl.deleteRooms);

// Room preferences
roomRouter.put('/', withAuth(apiKeyValidator, tokenAndRoleValidator(Role.ADMIN)), roomCtrl.updateRoomPreferences);
