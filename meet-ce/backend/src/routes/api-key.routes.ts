import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as apiKeyCtrl from '../controllers/api-key.controller.js';
import { tokenAndRoleValidator, withAuth } from '../middlewares/index.js';

export const apiKeyRouter: Router = Router();
apiKeyRouter.use(bodyParser.urlencoded({ extended: true }));
apiKeyRouter.use(bodyParser.json());

// API Key Routes
apiKeyRouter.post('/', withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)), apiKeyCtrl.createApiKey);
apiKeyRouter.get('/', withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)), apiKeyCtrl.getApiKeys);
apiKeyRouter.delete('/', withAuth(tokenAndRoleValidator(MeetUserRole.ADMIN)), apiKeyCtrl.deleteApiKeys);
