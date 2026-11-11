import bodyParser from 'body-parser';
import { Router } from 'express';
import * as waitingRoomCtrl from '../controllers/waiting-room.controller.js';
import * as meetingCtrl from '../controllers/meeting.controller.js';
import { apiKeyValidator, roomMemberTokenValidator, withAuth } from '../middlewares/auth.middleware.js';
import { apiLimiter } from '../middlewares/rate-limit.middleware.js';
import {
	validateWaitingRoomDecisionReq,
	validateWaitingRoomLeaveReq,
	validateLowerAllHandsReq,
	validateMuteParticipantMediaReq,
	validateSendParticipantReactionReq,
	validateUpdateParticipantHandReq,
	validateUpdateParticipantRoleReq
} from '../middlewares/request-validators/meeting-validator.middleware.js';
import { withValidRoomId } from '../middlewares/request-validators/room-validator.middleware.js';
import { withHandUpdatePermission, withRoomPermission } from '../middlewares/room.middleware.js';

export const meetingRouter: Router = Router();
meetingRouter.use(bodyParser.urlencoded({ extended: true }));
meetingRouter.use(bodyParser.json());
meetingRouter.use(apiLimiter);

// Meetings Routes
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
	'/:roomId/participants/media',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateMuteParticipantMediaReq,
	withRoomPermission('participantMute'),
	meetingCtrl.muteAllParticipantsMedia
);
meetingRouter.put(
	'/:roomId/participants/:participantIdentity/media',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateMuteParticipantMediaReq,
	withRoomPermission('participantMute'),
	meetingCtrl.muteParticipantMedia
);
meetingRouter.put(
	'/:roomId/participants/:participantIdentity/role',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateUpdateParticipantRoleReq,
	withRoomPermission('participantPromote'),
	meetingCtrl.updateParticipantRole
);
meetingRouter.put(
	'/:roomId/participants/hand',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateLowerAllHandsReq,
	withRoomPermission('participantHandLower'),
	meetingCtrl.lowerAllHands
);
meetingRouter.put(
	'/:roomId/participants/:participantIdentity/hand',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateUpdateParticipantHandReq,
	withHandUpdatePermission,
	meetingCtrl.updateParticipantHand
);

// Waiting room routes: they answer with no meeting running, since participants wait before it starts.
meetingRouter.get(
	'/:roomId/waiting-room',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('waitingRoomAdmin'),
	waitingRoomCtrl.getWaitingRoom
);
meetingRouter.post(
	'/:roomId/waiting-room/admit',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateWaitingRoomDecisionReq,
	withRoomPermission('waitingRoomAdmin'),
	waitingRoomCtrl.admitFromWaitingRoom
);
meetingRouter.post(
	'/:roomId/waiting-room/reject',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateWaitingRoomDecisionReq,
	withRoomPermission('waitingRoomAdmin'),
	waitingRoomCtrl.rejectFromWaitingRoom
);

// Internal meeting routes
export const internalMeetingRouter: Router = Router();
internalMeetingRouter.use(bodyParser.urlencoded({ extended: true }));
internalMeetingRouter.use(bodyParser.json());
internalMeetingRouter.use(apiLimiter);

// Only a participant reacts, so only the room member token they joined with is accepted.
internalMeetingRouter.post(
	'/:roomId/reactions',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	validateSendParticipantReactionReq,
	withRoomPermission('participantReactionSend'),
	meetingCtrl.sendParticipantReaction
);

// The ticket is the only credential, and no header is needed, so a page that unloads sends it without a CORS preflight.
internalMeetingRouter.post(
	'/:roomId/waiting-room/leave',
	withValidRoomId,
	validateWaitingRoomLeaveReq,
	waitingRoomCtrl.leaveWaitingRoom
);
