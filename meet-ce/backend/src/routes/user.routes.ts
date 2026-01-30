import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as userCtrl from '../controllers/user.controller.js';
import { accessTokenValidator, withAuth } from '../middlewares/auth.middleware.js';
import {
	validateBulkDeleteUsersReq,
	validateChangePasswordReq,
	validateCreateUserReq,
	validateGetUsersReq,
	validateResetUserPasswordReq,
	validateUpdateUserRoleReq
} from '../middlewares/request-validators/user-validator.middleware.js';

export const userRouter: Router = Router();
userRouter.use(bodyParser.urlencoded({ extended: true }));
userRouter.use(bodyParser.json());

// Users Routes
userRouter.post('/', withAuth(accessTokenValidator(MeetUserRole.ADMIN)), validateCreateUserReq, userCtrl.createUser);
userRouter.get(
	'/',
	withAuth(accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	validateGetUsersReq,
	userCtrl.getUsers
);
userRouter.delete(
	'/',
	withAuth(accessTokenValidator(MeetUserRole.ADMIN)),
	validateBulkDeleteUsersReq,
	userCtrl.bulkDeleteUsers
);

userRouter.get(
	'/me',
	withAuth(accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)),
	userCtrl.getMe
);
userRouter.post(
	'/change-password',
	withAuth(accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)),
	validateChangePasswordReq,
	userCtrl.changePassword
);

userRouter.get('/:userId', withAuth(accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER)), userCtrl.getUser);
userRouter.put(
	'/:userId/password',
	withAuth(accessTokenValidator(MeetUserRole.ADMIN)),
	validateResetUserPasswordReq,
	userCtrl.resetUserPassword
);
userRouter.put(
	'/:userId/role',
	withAuth(accessTokenValidator(MeetUserRole.ADMIN)),
	validateUpdateUserRoleReq,
	userCtrl.updateUserRole
);
userRouter.delete('/:userId', withAuth(accessTokenValidator(MeetUserRole.ADMIN)), userCtrl.deleteUser);
