import { Router } from 'express';
import bodyParser from 'body-parser';
import * as recordingCtrl from '../controllers/recording.controller.js';
import { withAuth, participantTokenValidator, tokenAndRoleValidator } from '../middlewares/auth.middleware.js';
import { withRecordingEnabledAndCorrectPermissions } from '../middlewares/recording.middleware.js';
import { Role } from '@typings-ce';

export const recordingRouter = Router();

recordingRouter.use(bodyParser.urlencoded({ extended: true }));
recordingRouter.use(bodyParser.json());

// Recording Routes
recordingRouter.post(
	'/',
	withAuth(participantTokenValidator),
	withRecordingEnabledAndCorrectPermissions,
	recordingCtrl.startRecording
);
recordingRouter.put(
	'/:recordingId',
	withAuth(participantTokenValidator),
	/* withRecordingEnabledAndCorrectPermissions,*/ recordingCtrl.stopRecording
);
recordingRouter.get(
	'/:recordingId/stream',
	withAuth(participantTokenValidator),
	/*withRecordingEnabledAndCorrectPermissions,*/ recordingCtrl.streamRecording
);
recordingRouter.delete(
	'/:recordingId',
	withAuth(tokenAndRoleValidator(Role.ADMIN), participantTokenValidator),
	/*withRecordingEnabledAndCorrectPermissions,*/
	recordingCtrl.deleteRecording
);
