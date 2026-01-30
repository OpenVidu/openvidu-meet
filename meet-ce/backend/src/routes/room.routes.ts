import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as roomMemberCtrl from '../controllers/room-member.controller.js';
import * as roomCtrl from '../controllers/room.controller.js';
import {
	accessTokenValidator,
	apiKeyValidator,
	roomMemberTokenValidator,
	withAuth
} from '../middlewares/auth.middleware.js';
import {
	validateBulkDeleteRoomMembersReq,
	validateCreateRoomMemberReq,
	validateCreateRoomMemberTokenReq,
	validateGetRoomMembersReq,
	validateUpdateRoomMemberReq
} from '../middlewares/request-validators/room-member-validator.middleware.js';
import {
	validateBulkDeleteRoomsReq,
	validateCreateRoomReq,
	validateDeleteRoomReq,
	validateGetRoomsReq,
	validateUpdateRoomAnonymousReq,
	validateUpdateRoomConfigReq,
	validateUpdateRoomRolesReq,
	validateUpdateRoomStatusReq,
	withValidRoomId
} from '../middlewares/request-validators/room-validator.middleware.js';
import {
	authorizeRoomMemberAccess,
	authorizeRoomMemberTokenGeneration,
	setupRoomMemberTokenAuthentication
} from '../middlewares/room-member.middleware.js';
import { authorizeRoomAccess, authorizeRoomManagement } from '../middlewares/room.middleware.js';

export const roomRouter: Router = Router();
roomRouter.use(bodyParser.urlencoded({ extended: true }));
roomRouter.use(bodyParser.json());

// Room Routes
roomRouter.post(
	'/',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	validateCreateRoomReq,
	roomCtrl.createRoom
);
roomRouter.get(
	'/',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)),
	validateGetRoomsReq,
	roomCtrl.getRooms
);
roomRouter.delete(
	'/',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	validateBulkDeleteRoomsReq,
	roomCtrl.bulkDeleteRooms
);

roomRouter.get(
	'/:roomId',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	withValidRoomId,
	authorizeRoomAccess,
	roomCtrl.getRoom
);
roomRouter.delete(
	'/:roomId',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	validateDeleteRoomReq,
	authorizeRoomManagement,
	roomCtrl.deleteRoom
);

roomRouter.get(
	'/:roomId/config',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	withValidRoomId,
	authorizeRoomAccess,
	roomCtrl.getRoomConfig
);
roomRouter.put(
	'/:roomId/config',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	withValidRoomId,
	validateUpdateRoomConfigReq,
	authorizeRoomManagement,
	roomCtrl.updateRoomConfig
);

roomRouter.put(
	'/:roomId/status',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	withValidRoomId,
	validateUpdateRoomStatusReq,
	authorizeRoomManagement,
	roomCtrl.updateRoomStatus
);
roomRouter.put(
	'/:roomId/roles',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	withValidRoomId,
	validateUpdateRoomRolesReq,
	authorizeRoomManagement,
	roomCtrl.updateRoomRoles
);
roomRouter.put(
	'/:roomId/anonymous',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	withValidRoomId,
	validateUpdateRoomAnonymousReq,
	authorizeRoomManagement,
	roomCtrl.updateRoomAnonymous
);

// Room Member Routes
roomRouter.post(
	'/:roomId/members',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	withValidRoomId,
	validateCreateRoomMemberReq,
	authorizeRoomManagement,
	roomMemberCtrl.createRoomMember
);
roomRouter.get(
	'/:roomId/members',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	withValidRoomId,
	validateGetRoomMembersReq,
	authorizeRoomManagement,
	roomMemberCtrl.getRoomMembers
);
roomRouter.delete(
	'/:roomId/members',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	withValidRoomId,
	validateBulkDeleteRoomMembersReq,
	authorizeRoomManagement,
	roomMemberCtrl.bulkDeleteRoomMembers
);

roomRouter.get(
	'/:roomId/members/:memberId',
	withAuth(apiKeyValidator, roomMemberTokenValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	withValidRoomId,
	authorizeRoomMemberAccess,
	roomMemberCtrl.getRoomMember
);
roomRouter.put(
	'/:roomId/members/:memberId',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	withValidRoomId,
	validateUpdateRoomMemberReq,
	authorizeRoomManagement,
	roomMemberCtrl.updateRoomMember
);
roomRouter.delete(
	'/:roomId/members/:memberId',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	withValidRoomId,
	authorizeRoomManagement,
	roomMemberCtrl.deleteRoomMember
);

// Internal room routes
export const internalRoomRouter: Router = Router();
internalRoomRouter.use(bodyParser.urlencoded({ extended: true }));
internalRoomRouter.use(bodyParser.json());

internalRoomRouter.post(
	'/:roomId/members/token',
	withValidRoomId,
	validateCreateRoomMemberTokenReq,
	setupRoomMemberTokenAuthentication,
	authorizeRoomMemberTokenGeneration,
	roomMemberCtrl.generateRoomMemberToken
);
