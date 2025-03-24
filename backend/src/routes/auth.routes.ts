import ms from 'ms';
import { Router } from 'express';
import bodyParser from 'body-parser';
import * as authCtrl from '../controllers/auth.controller.js';
import rateLimit from 'express-rate-limit';
import { tokenAndRoleValidator, withAuth } from '../middlewares/auth.middleware.js';
import { Role } from '@typings-ce';
import { validateLoginRequest } from '../middlewares/request-validators/auth-validator.middleware.js';

export const authRouter = Router();

// Limit login attempts for avoiding brute force attacks
const loginLimiter = rateLimit({
	windowMs: ms('15m'),
	limit: 5,
	message: 'Too many login attempts, please try again later'
});

authRouter.use(bodyParser.urlencoded({ extended: true }));
authRouter.use(bodyParser.json());

// Auth Routes
authRouter.post('/login', validateLoginRequest, loginLimiter, authCtrl.login);
authRouter.post('/logout', authCtrl.logout);
authRouter.post('/refresh', authCtrl.refreshToken);
authRouter.get(
	'/profile',
	withAuth(tokenAndRoleValidator(Role.ADMIN), tokenAndRoleValidator(Role.USER)),
	authCtrl.getProfile
);
