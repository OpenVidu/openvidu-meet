import bodyParser from 'body-parser';
import { Router } from 'express';
import * as authCtrl from '../controllers/auth.controller.js';
import { authLimiter, loginLimiter } from '../middlewares/rate-limit.middleware.js';
import { validateLoginReq } from '../middlewares/request-validators/auth-validator.middleware.js';

export const authRouter: Router = Router();
authRouter.use(bodyParser.urlencoded({ extended: true }));
authRouter.use(bodyParser.json());

// Auth Routes
authRouter.post('/login', loginLimiter, validateLoginReq, authCtrl.login);
authRouter.post('/logout', authLimiter, authCtrl.logout);
authRouter.post('/refresh', authLimiter, authCtrl.refreshToken);
