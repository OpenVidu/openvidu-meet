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
	authorizeBulkRecordingAccess,
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
recordingRouter.get(
	'/',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	validateGetRecordingsReq,
	authorizeBulkRecordingAccess('canRetrieveRecordings'),
	recordingCtrl.getRecordings
);
recordingRouter.delete(
	'/',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	validateBulkDeleteRecordingsReq,
	authorizeBulkRecordingAccess('canDeleteRecordings'),
	recordingCtrl.bulkDeleteRecordings
);
recordingRouter.get(
	'/download',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	validateBulkDeleteRecordingsReq,
	authorizeBulkRecordingAccess('canRetrieveRecordings'),
	recordingCtrl.downloadRecordingsZip
);
recordingRouter.get(
	'/:recordingId',
	validateGetRecordingReq,
	setupRecordingAuthentication,
	authorizeRecordingAccess('canRetrieveRecordings'),
	recordingCtrl.getRecording
);
recordingRouter.delete(
	'/:recordingId',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	withValidRecordingId,
	authorizeRecordingAccess('canDeleteRecordings'),
	recordingCtrl.deleteRecording
);
recordingRouter.get(
	'/:recordingId/media',
	validateGetRecordingMediaReq,
	setupRecordingAuthentication,
	authorizeRecordingAccess('canRetrieveRecordings'),
	recordingCtrl.getRecordingMedia
);
recordingRouter.get(
	'/:recordingId/url',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	),
	validateGetRecordingUrlReq,
	authorizeRecordingAccess('canRetrieveRecordings'),
	recordingCtrl.getRecordingUrl
);

// Internal Recording Routes
export const internalRecordingRouter: Router = Router();
internalRecordingRouter.use(bodyParser.urlencoded({ extended: true }));
internalRecordingRouter.use(bodyParser.json());

internalRecordingRouter.post(
	'/',
	withAuth(roomMemberTokenValidator),
	validateStartRecordingReq,
	withRecordingEnabled,
	authorizeRecordingControl,
	recordingCtrl.startRecording
);
internalRecordingRouter.post(
	'/:recordingId/stop',
	withAuth(roomMemberTokenValidator),
	withValidRecordingId,
	authorizeRecordingControl,
	recordingCtrl.stopRecording
);
