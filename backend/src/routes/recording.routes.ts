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
	withValidRecordingFiltersRequest,
	withValidRecordingBulkDeleteRequest,
	withValidRecordingId,
	withValidStartRecordingRequest,
	apiKeyValidator
} from '../middlewares/index.js';

export const recordingRouter = Router();
recordingRouter.use(bodyParser.urlencoded({ extended: true }));
recordingRouter.use(bodyParser.json());

// Recording Routes
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
	withValidRecordingFiltersRequest,
	recordingCtrl.getRecordings
);
recordingRouter.delete(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRecordingBulkDeleteRequest,
	recordingCtrl.bulkDeleteRecordings
);

recordingRouter.get(
	'/:recordingId/media',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	withValidRecordingId,
	recordingCtrl.getRecordingMedia
);

// Internal Recording Routes
export const internalRecordingRouter = Router();
internalRecordingRouter.use(bodyParser.urlencoded({ extended: true }));
internalRecordingRouter.use(bodyParser.json());

internalRecordingRouter.post(
	'/',
	withValidStartRecordingRequest,
	withRecordingEnabled,
	withAuth(participantTokenValidator),
	withCorrectPermissions,
	recordingCtrl.startRecording
);

internalRecordingRouter.post(
	'/:recordingId/stop',
	withValidRecordingId,
	withRecordingEnabled,
	withAuth(participantTokenValidator),
	withCorrectPermissions,
	recordingCtrl.stopRecording
);
