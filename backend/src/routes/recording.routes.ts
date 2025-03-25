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
	withValidStartRecordingRequest,
	withRecordingEnabled,
	withAuth(participantTokenValidator),
	withCorrectPermissions,
	recordingCtrl.startRecording
);
recordingRouter.put(
	'/:recordingId',
	withValidRecordingId,
	withRecordingEnabled,
	withAuth(participantTokenValidator),
	withCorrectPermissions,
	recordingCtrl.stopRecording
);
recordingRouter.delete(
	'/:recordingId',
	withValidRecordingId,
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	recordingCtrl.deleteRecording
);
recordingRouter.get(
	'/:recordingId',
	withValidRecordingId,
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	recordingCtrl.getRecording
);
recordingRouter.get(
	'/',
	withValidGetRecordingsRequest,
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	recordingCtrl.getRecordings
);
recordingRouter.delete(
	'/',
	withValidRecordingBulkDeleteRequest,
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	recordingCtrl.bulkDeleteRecordings
);

// Internal Recording Routes
export const internalRecordingRouter = Router();
internalRecordingRouter.use(bodyParser.urlencoded({ extended: true }));
internalRecordingRouter.use(bodyParser.json());

internalRecordingRouter.get(
	'/:recordingId/stream',
	withValidRecordingId,
	withAuth(tokenAndRoleValidator(UserRole.ADMIN)),
	recordingCtrl.streamRecording
);
