import { MeetUserRole } from '@openvidu-meet/typings';
import bodyParser from 'body-parser';
import { Router } from 'express';
import * as recordingCtrl from '../controllers/recording.controller.js';
import {
	accessTokenValidator,
	apiKeyValidator,
	roomMemberTokenValidator,
	withAuth
} from '../middlewares/auth.middleware.js';
import {
	authorizeRecordingAccess,
	authorizeRecordingControl,
	setupRecordingAuthentication,
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
recordingRouter.post(
	'/',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	validateStartRecordingReq,
	withRecordingEnabled,
	authorizeRecordingControl,
	recordingCtrl.startRecording
);
recordingRouter.get(
	'/',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	validateGetRecordingsReq,
	recordingCtrl.getRecordings
);
recordingRouter.delete(
	'/',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	validateBulkDeleteRecordingsReq,
	recordingCtrl.bulkDeleteRecordings
);
recordingRouter.get(
	'/download',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	validateBulkDeleteRecordingsReq,
	recordingCtrl.downloadRecordingsZip
);
recordingRouter.get(
	'/:recordingId',
	validateGetRecordingReq,
	setupRecordingAuthentication,
	authorizeRecordingAccess('canRetrieveRecordings', true),
	recordingCtrl.getRecording
);
recordingRouter.delete(
	'/:recordingId',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	withValidRecordingId,
	authorizeRecordingAccess('canDeleteRecordings'),
	recordingCtrl.deleteRecording
);
recordingRouter.post(
	'/:recordingId/stop',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRecordingId,
	authorizeRecordingControl,
	recordingCtrl.stopRecording
);
recordingRouter.get(
	'/:recordingId/media',
	validateGetRecordingMediaReq,
	setupRecordingAuthentication,
	authorizeRecordingAccess('canRetrieveRecordings', true),
	recordingCtrl.getRecordingMedia
);
recordingRouter.get(
	'/:recordingId/url',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	validateGetRecordingUrlReq,
	authorizeRecordingAccess('canRetrieveRecordings'),
	recordingCtrl.getRecordingUrl
);
