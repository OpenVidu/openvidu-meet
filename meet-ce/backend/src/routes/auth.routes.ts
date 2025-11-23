import bodyParser from 'body-parser';
import { Router } from 'express';
import * as authCtrl from '../controllers/auth.controller.js';
import { withLoginLimiter } from '../middlewares/auth.middleware.js';
import { validateLoginReq } from '../middlewares/request-validators/auth-validator.middleware.js';

export const authRouter: Router = Router();
authRouter.use(bodyParser.urlencoded({ extended: true }));
authRouter.use(bodyParser.json());

// Auth Routes
authRouter.post('/login', validateLoginReq, withLoginLimiter, authCtrl.login);
authRouter.post('/logout', authCtrl.logout);
authRouter.post('/refresh', authCtrl.refreshToken);
