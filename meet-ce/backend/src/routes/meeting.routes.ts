import bodyParser from 'body-parser';
import { Router } from 'express';
import * as meetingCtrl from '../controllers/meeting.controller.js';
import { roomMemberTokenValidator, withAuth } from '../middlewares/auth.middleware.js';
import { apiLimiter } from '../middlewares/rate-limit.middleware.js';
import { validateUpdateParticipantRoleReq } from '../middlewares/request-validators/meeting-validator.middleware.js';
import { withValidRoomId } from '../middlewares/request-validators/room-validator.middleware.js';
import { withRoomMemberPermission } from '../middlewares/room-member.middleware.js';

export const internalMeetingRouter: Router = Router();
internalMeetingRouter.use(bodyParser.urlencoded({ extended: true }));
internalMeetingRouter.use(bodyParser.json());
internalMeetingRouter.use(apiLimiter);

// Internal Meetings Routes
// Live introspection (the meeting and its participants). Gated on `meetingJoin`: whoever may enter
// the meeting may observe it; a recording-only link (meetingJoin=false) may not.
internalMeetingRouter.get(
	'/:roomId',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	withRoomMemberPermission('meetingJoin'),
	meetingCtrl.getMeeting
);
internalMeetingRouter.get(
	'/:roomId/participants',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	withRoomMemberPermission('meetingJoin'),
	meetingCtrl.getMeetingParticipants
);
internalMeetingRouter.get(
	'/:roomId/participants/:participantIdentity',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	withRoomMemberPermission('meetingJoin'),
	meetingCtrl.getMeetingParticipant
);
internalMeetingRouter.delete(
	'/:roomId',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	withRoomMemberPermission('meetingEnd'),
	meetingCtrl.endMeeting
);
internalMeetingRouter.delete(
	'/:roomId/participants/:participantIdentity',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	withRoomMemberPermission('participantKick'),
	meetingCtrl.kickParticipantFromMeeting
);
internalMeetingRouter.put(
	'/:roomId/participants/:participantIdentity/role',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	validateUpdateParticipantRoleReq,
	withRoomMemberPermission('participantPromote'),
	meetingCtrl.updateParticipantRole
);
