import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as userCtrl from '../controllers/user.controller.js';
import { accessTokenValidator, apiKeyValidator, withAuth } from '../middlewares/auth.middleware.js';
import { apiLimiter, sensitiveActionLimiter } from '../middlewares/rate-limit.middleware.js';
import {
	validateBulkDeleteUsersReq,
	validateChangePasswordReq,
	validateCreateUserReq,
	validateGetUsersReq,
	validateResetUserPasswordReq,
	validateUpdateUserRoleReq
} from '../middlewares/request-validators/user-validator.middleware.js';

// Public user routes
export const userRouter: Router = Router();
userRouter.use(bodyParser.urlencoded({ extended: true }));
userRouter.use(bodyParser.json());
userRouter.use(apiLimiter);

// Users Routes
userRouter.post(
	'/',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)),
	validateCreateUserReq,
	userCtrl.createUser
);
userRouter.get(
	'/',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	validateGetUsersReq,
	userCtrl.getUsers
);
userRouter.delete(
	'/',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)),
	validateBulkDeleteUsersReq,
	userCtrl.bulkDeleteUsers
);

userRouter.get(
	'/:userId',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	userCtrl.getUser
);
userRouter.put(
	'/:userId/password',
	sensitiveActionLimiter,
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)),
	validateResetUserPasswordReq,
	userCtrl.resetUserPassword
);
userRouter.put(
	'/:userId/role',
	withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)),
	validateUpdateUserRoleReq,
	userCtrl.updateUserRole
);
userRouter.delete('/:userId', withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN)), userCtrl.deleteUser);

// Internal user routes
export const internalUserRouter: Router = Router();
internalUserRouter.use(bodyParser.urlencoded({ extended: true }));
internalUserRouter.use(bodyParser.json());
internalUserRouter.use(apiLimiter);

internalUserRouter.get(
	'/me',
	withAuth(accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)),
	userCtrl.getMe
);
internalUserRouter.post(
	'/change-password',
	sensitiveActionLimiter,
	withAuth(accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)),
	validateChangePasswordReq,
	userCtrl.changePassword
);
