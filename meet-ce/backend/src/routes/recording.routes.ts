import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as recordingCtrl from '../controllers/recording.controller.js';
import {
	apiKeyValidator,
	roomMemberTokenValidator,
	tokenAndRoleValidator,
	withAuth
} from '../middlewares/auth.middleware.js';
import {
	configureRecordingAuth,
	withCanDeleteRecordingsPermission,
	withCanRecordPermission,
	withCanRetrieveRecordingsPermission,
	withRecordingEnabled
} from '../middlewares/recording.middleware.js';
import {
	validateBulkDeleteRecordingsReq,
	validateGetRecordingMediaReq,
	validateGetRecordingReq,
	validateGetRecordingsReq,
	validateGetRecordingUrlReq,
	validateStartRecordingReq,
	withValidRecordingId
} from '../middlewares/request-validators/recording-validator.middleware.js';

export const recordingRouter: Router = Router();
recordingRouter.use(bodyParser.urlencoded({ extended: true }));
recordingRouter.use(bodyParser.json());

// Recording Routes
recordingRouter.get(
	'/',
	withAuth(
		apiKeyValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER),
		roomMemberTokenValidator
	),
	withCanRetrieveRecordingsPermission,
	validateGetRecordingsReq,
	recordingCtrl.getRecordings
);
recordingRouter.delete(
	'/',
	withAuth(
		apiKeyValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER),
		roomMemberTokenValidator
	),
	validateBulkDeleteRecordingsReq,
	withCanDeleteRecordingsPermission,
	recordingCtrl.bulkDeleteRecordings
);
recordingRouter.get(
	'/download',
	withAuth(
		apiKeyValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER),
		roomMemberTokenValidator
	),
	validateBulkDeleteRecordingsReq,
	withCanRetrieveRecordingsPermission,
	recordingCtrl.downloadRecordingsZip
);
recordingRouter.get(
	'/:recordingId',
	validateGetRecordingReq,
	configureRecordingAuth,
	withCanRetrieveRecordingsPermission,
	recordingCtrl.getRecording
);
recordingRouter.delete(
	'/:recordingId',
	withAuth(
		apiKeyValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER),
		roomMemberTokenValidator
	),
	withValidRecordingId,
	withCanDeleteRecordingsPermission,
	recordingCtrl.deleteRecording
);
recordingRouter.get(
	'/:recordingId/media',
	validateGetRecordingMediaReq,
	configureRecordingAuth,
	withCanRetrieveRecordingsPermission,
	recordingCtrl.getRecordingMedia
);
recordingRouter.get(
	'/:recordingId/url',
	withAuth(
		apiKeyValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER),
		roomMemberTokenValidator
	),
	validateGetRecordingUrlReq,
	withCanRetrieveRecordingsPermission,
	recordingCtrl.getRecordingUrl
);

// Internal Recording Routes
export const internalRecordingRouter: Router = Router();
internalRecordingRouter.use(bodyParser.urlencoded({ extended: true }));
internalRecordingRouter.use(bodyParser.json());

internalRecordingRouter.post(
	'/',
	validateStartRecordingReq,
	withRecordingEnabled,
	withAuth(roomMemberTokenValidator),
	withCanRecordPermission,
	recordingCtrl.startRecording
);
internalRecordingRouter.post(
	'/:recordingId/stop',
	withValidRecordingId,
	withRecordingEnabled,
	withAuth(roomMemberTokenValidator),
	withCanRecordPermission,
	recordingCtrl.stopRecording
);
