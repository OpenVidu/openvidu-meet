import { UserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as analyticsCtrl from '../controllers/analytics.controller.js';
import { tokenAndRoleValidator, withAuth } from '../middlewares/index.js';

export const analyticsRouter: Router = Router();
analyticsRouter.use(bodyParser.urlencoded({ extended: true }));
analyticsRouter.use(bodyParser.json());

// Analytics Routes
analyticsRouter.get('/', withAuth(tokenAndRoleValidator(UserRole.ADMIN)), analyticsCtrl.getAnalytics);
