import { Router } from 'express';
import bodyParser from 'body-parser';
import * as recordingCtrl from '../controllers/recording.controller.js';
import { Role } from '@typings-ce';
import {
	withAuth,
	participantTokenValidator,
	tokenAndRoleValidator,
	withRecordingEnabledAndCorrectPermissions,
	withValidGetRecordingsRequest,
	withValidRecordingBulkDeleteRequest,
	withValidRecordingId,
	withValidStartRecordingRequest
} from '../middlewares/index.js';

export const recordingRouter = Router();
recordingRouter.use(bodyParser.urlencoded({ extended: true }));
recordingRouter.use(bodyParser.json());

// Recording Routes
recordingRouter.post(
	'/',
	withAuth(participantTokenValidator),
	withRecordingEnabledAndCorrectPermissions,
	withValidStartRecordingRequest,
	recordingCtrl.startRecording
);
recordingRouter.put(
	'/:recordingId',
	withAuth(participantTokenValidator),
	/* withRecordingEnabledAndCorrectPermissions,*/ withValidRecordingId,
	recordingCtrl.stopRecording
);

recordingRouter.delete(
	'/:recordingId',
	withAuth(tokenAndRoleValidator(Role.ADMIN), participantTokenValidator),
	/*withRecordingEnabledAndCorrectPermissions,*/
	withValidRecordingId,
	recordingCtrl.deleteRecording
);
recordingRouter.get('/:recordingId', withValidRecordingId, recordingCtrl.getRecording);
recordingRouter.get('/', withValidGetRecordingsRequest, recordingCtrl.getRecordings);
recordingRouter.delete('/', withValidRecordingBulkDeleteRequest, recordingCtrl.bulkDeleteRecordings);

// Internal Recording Routes
export const internalRecordingRouter = Router();
internalRecordingRouter.use(bodyParser.urlencoded({ extended: true }));
internalRecordingRouter.use(bodyParser.json());

internalRecordingRouter.get(
	'/:recordingId/stream',
	withAuth(participantTokenValidator),
	/*withRecordingEnabledAndCorrectPermissions,*/ withValidRecordingId,
	recordingCtrl.streamRecording
);
