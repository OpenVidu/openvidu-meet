import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as userCtrl from '../controllers/user.controller.js';
import { tokenAndRoleValidator, withAuth } from '../middlewares/auth.middleware.js';
import {
	validateBulkDeleteUsersReq,
	validateChangePasswordReq,
	validateCreateUserReq,
	validateGetUsersReq
} from '../middlewares/request-validators/user-validator.middleware.js';

export const userRouter: Router = Router();
userRouter.use(bodyParser.urlencoded({ extended: true }));
userRouter.use(bodyParser.json());

// Users Routes
userRouter.post('/', withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)), validateCreateUserReq, userCtrl.createUser);
userRouter.get(
	'/',
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	validateGetUsersReq,
	userCtrl.getUsers
);
userRouter.delete(
	'/',
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)),
	validateBulkDeleteUsersReq,
	userCtrl.bulkDeleteUsers
);

userRouter.get(
	'/me',
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)),
	userCtrl.getMe
);
userRouter.post(
	'/change-password',
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)),
	validateChangePasswordReq,
	userCtrl.changePassword
);

userRouter.get('/:userId', withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER)), userCtrl.getUser);
userRouter.delete('/:userId', withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)), userCtrl.deleteUser);
