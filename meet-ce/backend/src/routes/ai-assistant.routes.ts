import bodyParser from 'body-parser';
import { Router } from 'express';
import * as aiAssistantCtrl from '../controllers/ai-assistant.controller.js';
import { roomMemberTokenValidator, withAuth } from '../middlewares/auth.middleware.js';
import {
	validateAssistantIdPathParam,
	validateCreateAssistantReq
} from '../middlewares/request-validators/ai-assistant-validator.middleware.js';

export const aiAssistantRouter: Router = Router();
aiAssistantRouter.use(bodyParser.urlencoded({ extended: true }));
aiAssistantRouter.use(bodyParser.json());

aiAssistantRouter.post(
	'/assistants',
	withAuth(roomMemberTokenValidator),
	validateCreateAssistantReq,
	aiAssistantCtrl.createAssistant
);

aiAssistantRouter.delete(
	'/assistants/:assistantId',
	withAuth(roomMemberTokenValidator),
	validateAssistantIdPathParam,
	aiAssistantCtrl.cancelAssistant
);
