import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as analyticsCtrl from '../controllers/analytics.controller.js';
import { accessTokenValidator, withAuth } from '../middlewares/auth.middleware.js';

export const analyticsRouter: Router = Router();
analyticsRouter.use(bodyParser.urlencoded({ extended: true }));
analyticsRouter.use(bodyParser.json());

// Analytics Routes
analyticsRouter.get('/', withAuth(accessTokenValidator(MeetUserRole.ADMIN)), analyticsCtrl.getAnalytics);
