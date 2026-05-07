import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as apiKeyCtrl from '../controllers/api-key.controller.js';
import { accessTokenValidator, withAuth } from '../middlewares/auth.middleware.js';

export const apiKeyRouter: Router = Router();
apiKeyRouter.use(bodyParser.urlencoded({ extended: true }));
apiKeyRouter.use(bodyParser.json());

// API Key Routes
apiKeyRouter.post('/', withAuth(accessTokenValidator(MeetUserRole.ADMIN)), apiKeyCtrl.createApiKey);
apiKeyRouter.get('/', withAuth(accessTokenValidator(MeetUserRole.ADMIN)), apiKeyCtrl.getApiKeys);
apiKeyRouter.delete('/', withAuth(accessTokenValidator(MeetUserRole.ADMIN)), apiKeyCtrl.deleteApiKeys);
