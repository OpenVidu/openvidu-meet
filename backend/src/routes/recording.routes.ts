import { UserRole } from '@typings-ce';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as recordingCtrl from '../controllers/recording.controller.js';
import {
	apiKeyValidator,
	configureRecordingMediaAuth,
	participantTokenValidator,
	recordingTokenValidator,
	tokenAndRoleValidator,
	withAuth,
	withCanDeleteRecordingsPermission,
	withCanRecordPermission,
	withCanRetrieveRecordingsPermission,
	withRecordingEnabled,
	withValidGetMediaRequest,
	withValidRecordingBulkDeleteRequest,
	withValidRecordingFiltersRequest,
	withValidRecordingId,
	withValidStartRecordingRequest
} from '../middlewares/index.js';

export const recordingRouter = Router();
recordingRouter.use(bodyParser.urlencoded({ extended: true }));
recordingRouter.use(bodyParser.json());

// Recording Routes
recordingRouter.get(
	'/',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN), recordingTokenValidator),
	withCanRetrieveRecordingsPermission,
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
	'/:recordingId',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN), recordingTokenValidator),
	withValidRecordingId,
	withCanRetrieveRecordingsPermission,
	recordingCtrl.getRecording
);
recordingRouter.delete(
	'/:recordingId',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN), recordingTokenValidator),
	withValidRecordingId,
	withCanDeleteRecordingsPermission,
	recordingCtrl.deleteRecording
);
recordingRouter.get(
	'/:recordingId/media',
	withValidGetMediaRequest,
	configureRecordingMediaAuth,
	withCanRetrieveRecordingsPermission,
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
	withCanRecordPermission,
	recordingCtrl.startRecording
);
internalRecordingRouter.post(
	'/:recordingId/stop',
	withValidRecordingId,
	withRecordingEnabled,
	withAuth(participantTokenValidator),
	withCanRecordPermission,
	recordingCtrl.stopRecording
);
