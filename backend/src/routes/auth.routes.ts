import { Router } from 'express';
import bodyParser from 'body-parser';
import * as authCtrl from '../controllers/auth.controller.js';
import { validateLoginRequest, withLoginLimiter, tokenAndRoleValidator, withAuth } from '../middlewares/index.js';
import { UserRole } from '@typings-ce';

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
