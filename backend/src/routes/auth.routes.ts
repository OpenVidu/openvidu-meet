import bodyParser from 'body-parser';
import { Router } from 'express';
import * as authCtrl from '../controllers/auth.controller.js';
import { tokenAndRoleValidator, validateLoginRequest, withAuth, withLoginLimiter } from '../middlewares/index.js';
import { UserRole } from '@typings-ce';

export const authRouter = Router();
authRouter.use(bodyParser.urlencoded({ extended: true }));
authRouter.use(bodyParser.json());

// Auth Routes
authRouter.post('/login', validateLoginRequest, withLoginLimiter, authCtrl.login);
authRouter.post('/logout', authCtrl.logout);
authRouter.post('/refresh', authCtrl.refreshToken);

// API Key Routes
authRouter.post('/api-keys', withAuth(tokenAndRoleValidator(UserRole.ADMIN)), authCtrl.createApiKey);
authRouter.get('/api-keys', withAuth(tokenAndRoleValidator(UserRole.ADMIN)), authCtrl.getApiKeys);
authRouter.delete('/api-keys', withAuth(tokenAndRoleValidator(UserRole.ADMIN)), authCtrl.deleteApiKeys);
