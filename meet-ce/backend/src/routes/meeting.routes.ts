import bodyParser from 'body-parser';
import { Router } from 'express';
import * as meetingCtrl from '../controllers/meeting.controller.js';
import { apiKeyValidator, roomMemberTokenValidator, withAuth } from '../middlewares/auth.middleware.js';
import { apiLimiter } from '../middlewares/rate-limit.middleware.js';
import { validateUpdateParticipantRoleReq } from '../middlewares/request-validators/meeting-validator.middleware.js';
import { withValidRoomId } from '../middlewares/request-validators/room-validator.middleware.js';
import { withRoomPermission } from '../middlewares/room.middleware.js';

export const meetingRouter: Router = Router();
meetingRouter.use(bodyParser.urlencoded({ extended: true }));
meetingRouter.use(bodyParser.json());
meetingRouter.use(apiLimiter);

// Meetings Routes
// Live introspection (the meeting and its participants). Gated on `meetingRead`, which defaults to
// the holder's `meetingJoin` — so whoever may enter the meeting observes it and a recording-only
// link does not, unless an operator grants the two apart.
meetingRouter.get(
	'/:roomId',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('meetingRead'),
	meetingCtrl.getMeeting
);
meetingRouter.get(
	'/:roomId/participants',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('meetingRead'),
	meetingCtrl.getMeetingParticipants
);
meetingRouter.get(
	'/:roomId/participants/:participantIdentity',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('meetingRead'),
	meetingCtrl.getMeetingParticipant
);
meetingRouter.delete(
	'/:roomId',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('meetingEnd'),
	meetingCtrl.endMeeting
);
meetingRouter.delete(
	'/:roomId/participants/:participantIdentity',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('participantKick'),
	meetingCtrl.kickParticipantFromMeeting
);
meetingRouter.put(
	'/:roomId/participants/:participantIdentity/role',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateUpdateParticipantRoleReq,
	withRoomPermission('participantPromote'),
	meetingCtrl.updateParticipantRole
);
