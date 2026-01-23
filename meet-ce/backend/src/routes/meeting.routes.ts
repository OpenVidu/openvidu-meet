import bodyParser from 'body-parser';
import { Router } from 'express';
import * as meetingCtrl from '../controllers/meeting.controller.js';
import { roomMemberTokenValidator, withAuth } from '../middlewares/auth.middleware.js';
import { validateUpdateParticipantRoleReq } from '../middlewares/request-validators/meeting-validator.middleware.js';
import { withValidRoomId } from '../middlewares/request-validators/room-validator.middleware.js';
import { withRoomMemberPermission } from '../middlewares/room-member.middleware.js';

export const internalMeetingRouter: Router = Router();
internalMeetingRouter.use(bodyParser.urlencoded({ extended: true }));
internalMeetingRouter.use(bodyParser.json());

// Internal Meetings Routes
internalMeetingRouter.delete(
	'/:roomId',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	withRoomMemberPermission('canEndMeeting'),
	meetingCtrl.endMeeting
);
internalMeetingRouter.delete(
	'/:roomId/participants/:participantIdentity',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	withRoomMemberPermission('canKickParticipants'),
	meetingCtrl.kickParticipantFromMeeting
);
internalMeetingRouter.put(
	'/:roomId/participants/:participantIdentity/role',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	validateUpdateParticipantRoleReq,
	withRoomMemberPermission('canMakeModerator'),
	meetingCtrl.updateParticipantRole
);
