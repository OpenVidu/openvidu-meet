import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as userCtrl from '../controllers/user.controller.js';
import { tokenAndRoleValidator, withAuth } from '../middlewares/auth.middleware.js';
import { validateChangePasswordReq } from '../middlewares/request-validators/user-validator.middleware.js';

export const userRouter: Router = Router();
userRouter.use(bodyParser.urlencoded({ extended: true }));
userRouter.use(bodyParser.json());

// Users Routes
userRouter.get('/profile', withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER)), userCtrl.getProfile);
userRouter.post(
	'/change-password',
	withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER)),
	validateChangePasswordReq,
	userCtrl.changePassword
);
