import bodyParser from 'body-parser';
import { Router } from 'express';
import * as meetingCtrl from '../controllers/meeting.controller.js';
import {
	roomMemberTokenValidator,
	validateUpdateParticipantRequest,
	withAuth,
	withModeratorPermissions,
	withValidRoomId
} from '../middlewares/index.js';

export const internalMeetingRouter: Router = Router();
internalMeetingRouter.use(bodyParser.urlencoded({ extended: true }));
internalMeetingRouter.use(bodyParser.json());

// Internal Meetings Routes
internalMeetingRouter.delete(
	'/:roomId',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	withModeratorPermissions,
	meetingCtrl.endMeeting
);
internalMeetingRouter.delete(
	'/:roomId/participants/:participantIdentity',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	withModeratorPermissions,
	meetingCtrl.kickParticipantFromMeeting
);
internalMeetingRouter.put(
	'/:roomId/participants/:participantIdentity/role',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	withModeratorPermissions,
	validateUpdateParticipantRequest,
	meetingCtrl.updateParticipantRole
);
