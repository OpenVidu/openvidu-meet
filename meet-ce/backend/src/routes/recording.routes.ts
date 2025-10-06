import { UserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as recordingCtrl from '../controllers/recording.controller.js';
import {
	apiKeyValidator,
	configureRecordingAuth,
	participantTokenValidator,
	recordingTokenValidator,
	tokenAndRoleValidator,
	withAuth,
	withCanDeleteRecordingsPermission,
	withCanRecordPermission,
	withCanRetrieveRecordingsPermission,
	withRecordingEnabled,
	withValidGetRecordingMediaRequest,
	withValidGetRecordingRequest,
	withValidGetRecordingUrlRequest,
	withValidMultipleRecordingIds,
	withValidRecordingFiltersRequest,
	withValidRecordingId,
	withValidStartRecordingRequest
} from '../middlewares/index.js';

export const recordingRouter: Router = Router();
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
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN), recordingTokenValidator),
	withValidMultipleRecordingIds,
	withCanDeleteRecordingsPermission,
	recordingCtrl.bulkDeleteRecordings
);
recordingRouter.get(
	'/download',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN), recordingTokenValidator),
	withValidMultipleRecordingIds,
	withCanRetrieveRecordingsPermission,
	recordingCtrl.downloadRecordingsZip
);
recordingRouter.get(
	'/:recordingId',
	withValidGetRecordingRequest,
	configureRecordingAuth,
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
	withValidGetRecordingMediaRequest,
	configureRecordingAuth,
	withCanRetrieveRecordingsPermission,
	recordingCtrl.getRecordingMedia
);
recordingRouter.get(
	'/:recordingId/url',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN), recordingTokenValidator),
	withValidGetRecordingUrlRequest,
	withCanRetrieveRecordingsPermission,
	recordingCtrl.getRecordingUrl
);

// Internal Recording Routes
export const internalRecordingRouter: Router = Router();
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
