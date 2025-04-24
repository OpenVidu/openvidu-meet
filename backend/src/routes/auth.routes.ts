import { UserRole } from '@typings-ce';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as authCtrl from '../controllers/auth.controller.js';
import { tokenAndRoleValidator, validateLoginRequest, withAuth, withLoginLimiter } from '../middlewares/index.js';

export const authRouter = Router();
authRouter.use(bodyParser.urlencoded({ extended: true }));
authRouter.use(bodyParser.json());

// Auth Routes
authRouter.post('/login', validateLoginRequest, withLoginLimiter, authCtrl.login);
authRouter.post('/logout', authCtrl.logout);
authRouter.post('/refresh', authCtrl.refreshToken);
authRouter.get(
	'/profile',
	withAuth(tokenAndRoleValidator(UserRole.ADMIN), tokenAndRoleValidator(UserRole.USER)),
	authCtrl.getProfile
);
