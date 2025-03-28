import { Router } from 'express';
import bodyParser from 'body-parser';
import * as authCtrl from '../controllers/auth.controller.js';
import { loginLimiter, tokenAndRoleValidator, withAuth } from '../middlewares/auth.middleware.js';
import { validateLoginRequest } from '../middlewares/request-validators/auth-validator.middleware.js';
import { UserRole } from '@typings-ce';

export const authRouter = Router();
authRouter.use(bodyParser.urlencoded({ extended: true }));
authRouter.use(bodyParser.json());

// Auth Routes
authRouter.post('/login', validateLoginRequest, loginLimiter, authCtrl.login);
authRouter.post('/logout', authCtrl.logout);
authRouter.post('/refresh', authCtrl.refreshToken);
authRouter.get(
	'/profile',
	withAuth(tokenAndRoleValidator(UserRole.ADMIN), tokenAndRoleValidator(UserRole.USER)),
	authCtrl.getProfile
);
