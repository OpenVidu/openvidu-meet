import { Router } from 'express';
import bodyParser from 'body-parser';
import * as recordingCtrl from '../controllers/recording.controller.js';
import { UserRole } from '@typings-ce';
import {
	withAuth,
	participantTokenValidator,
	tokenAndRoleValidator,
	withRecordingEnabled,
	withCorrectPermissions,
	withValidGetRecordingsRequest,
	withValidRecordingBulkDeleteRequest,
	withValidRecordingId,
	withValidStartRecordingRequest,
	apiKeyValidator
} from '../middlewares/index.js';

export const recordingRouter = Router();
recordingRouter.use(bodyParser.urlencoded({ extended: true }));
recordingRouter.use(bodyParser.json());

// Recording Routes
recordingRouter.post(
	'/',
	withRecordingEnabled,
	withAuth(participantTokenValidator),
	withCorrectPermissions,
	withValidStartRecordingRequest,
	recordingCtrl.startRecording
);
recordingRouter.put(
	'/:recordingId',
	withRecordingEnabled,
	withAuth(participantTokenValidator),
	withCorrectPermissions,
	withValidRecordingId,
	recordingCtrl.stopRecording
);
recordingRouter.delete(
	'/:recordingId',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRecordingId,
	recordingCtrl.deleteRecording
);
recordingRouter.get(
	'/:recordingId',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRecordingId,
	recordingCtrl.getRecording
);
recordingRouter.get(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	withValidGetRecordingsRequest,
	recordingCtrl.getRecordings
);
recordingRouter.delete(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRecordingBulkDeleteRequest,
	recordingCtrl.bulkDeleteRecordings
);

// Internal Recording Routes
export const internalRecordingRouter = Router();
internalRecordingRouter.use(bodyParser.urlencoded({ extended: true }));
internalRecordingRouter.use(bodyParser.json());

internalRecordingRouter.get(
	'/:recordingId/stream',
	withAuth(tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRecordingId,
	recordingCtrl.streamRecording
);
