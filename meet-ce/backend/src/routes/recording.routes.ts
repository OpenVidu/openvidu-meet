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
import { apiLimiter } from '../middlewares/rate-limit.middleware.js';
import {
	applyRecordingListAccessFilters,
	authorizeRecordingAccess,
	authorizeRecordingControl,
	setupRecordingAuthentication,
	validateBulkDeleteRecordingsAccess,
	validateDownloadRecordingsAccess,
	withRecordingStartAllowed
} from '../middlewares/recording.middleware.js';
import {
	validateBulkDeleteRecordingsReq,
	validateGetRecordingLinkReq,
	validateGetRecordingMediaReq,
	validateGetRecordingReq,
	validateGetRecordingsReq,
	validateGetRecordingUrlReq,
	validateStartRecordingReq,
	validateStopRecordingReq,
	withValidRecordingId
} from '../middlewares/request-validators/recording-validator.middleware.js';

export const recordingRouter: Router = Router();
recordingRouter.use(bodyParser.urlencoded({ extended: true }));
recordingRouter.use(bodyParser.json());
recordingRouter.use(apiLimiter);

// Recording Routes
recordingRouter.post(
	'/',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	validateStartRecordingReq,
	authorizeRecordingControl,
	withRecordingStartAllowed,
	recordingCtrl.startRecording
);
recordingRouter.get(
	'/',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER)
	),
	validateGetRecordingsReq,
	applyRecordingListAccessFilters,
	recordingCtrl.getRecordings
);
recordingRouter.delete(
	'/',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER)
	),
	validateBulkDeleteRecordingsReq,
	validateBulkDeleteRecordingsAccess,
	recordingCtrl.bulkDeleteRecordings
);
recordingRouter.get(
	'/download',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER)
	),
	validateBulkDeleteRecordingsReq,
	validateDownloadRecordingsAccess,
	recordingCtrl.downloadRecordingsZip
);
recordingRouter.get(
	'/:recordingId',
	validateGetRecordingReq,
	setupRecordingAuthentication('recordingPlay'),
	authorizeRecordingAccess('recordingPlay', true),
	recordingCtrl.getRecording
);
recordingRouter.delete(
	'/:recordingId',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER)
	),
	withValidRecordingId,
	authorizeRecordingAccess('recordingDelete'),
	recordingCtrl.deleteRecording
);
recordingRouter.post(
	'/:recordingId/stop',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	validateStopRecordingReq,
	authorizeRecordingControl,
	recordingCtrl.stopRecording
);
recordingRouter.get(
	'/:recordingId/media',
	validateGetRecordingMediaReq,
	setupRecordingAuthentication('recordingPlay'),
	authorizeRecordingAccess('recordingPlay', true),
	recordingCtrl.getRecordingMedia
);
// Same media stream as /media but served as an attachment and gated by recordingDownload instead of
// recordingPlay: the split lets a deployment grant playback without granting copies (D9).
recordingRouter.get(
	'/:recordingId/download',
	validateGetRecordingMediaReq,
	setupRecordingAuthentication('recordingDownload'),
	authorizeRecordingAccess('recordingDownload', true),
	recordingCtrl.downloadRecordingMedia
);
recordingRouter.get(
	'/:recordingId/url',
	withAuth(
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER)
	),
	validateGetRecordingUrlReq,
	authorizeRecordingAccess('recordingPlay'),
	recordingCtrl.getRecordingUrl
);

// Internal recording routes
export const internalRecordingRouter: Router = Router();
internalRecordingRouter.use(bodyParser.urlencoded({ extended: true }));
internalRecordingRouter.use(bodyParser.json());
internalRecordingRouter.use(apiLimiter);

// Tells the recording view page whether the link it was opened with downloads or only plays.
internalRecordingRouter.get(
	'/:recordingId/link',
	validateGetRecordingLinkReq,
	setupRecordingAuthentication('recordingPlay'),
	authorizeRecordingAccess('recordingPlay', true),
	recordingCtrl.getRecordingLink
);
