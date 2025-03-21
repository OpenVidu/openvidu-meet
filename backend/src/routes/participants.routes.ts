import { Router } from 'express';
import bodyParser from 'body-parser';
import * as participantCtrl from '../controllers/participant.controller.js';
import {
	validateParticipantDeletionRequest,
	validateParticipantTokenRequest
} from '../middlewares/request-validators/participant-validator.middleware.js';

export const internalParticipantsRouter = Router();
internalParticipantsRouter.use(bodyParser.urlencoded({ extended: true }));
internalParticipantsRouter.use(bodyParser.json());

internalParticipantsRouter.post('/token', validateParticipantTokenRequest, participantCtrl.generateParticipantToken);
internalParticipantsRouter.post(
	'/token/refresh',
	validateParticipantTokenRequest,
	participantCtrl.refreshParticipantToken
);
internalParticipantsRouter.delete(
	'/:participantName',
	validateParticipantDeletionRequest,
	participantCtrl.deleteParticipant
);
