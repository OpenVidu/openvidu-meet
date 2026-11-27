import bodyParser from 'body-parser';
import { Router } from 'express';
import * as waitingParticipantCtrl from '../controllers/waiting-participant.controller.js';
import * as meetingCtrl from '../controllers/meeting.controller.js';
import { apiKeyValidator, roomMemberTokenValidator, withAuth } from '../middlewares/auth.middleware.js';
import { apiLimiter } from '../middlewares/rate-limit.middleware.js';
import {
	validateBulkRejectWaitingParticipantsReq,
	validateGetMeetingReq,
	validateListChatMessagesReq,
	validateWaitingParticipantLeaveReq,
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
	validateGetMeetingReq,
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
	withRoomPermission('participantLowerHand'),
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

// Waiting participant routes: they answer with no meeting running, since participants wait before it starts.
meetingRouter.get(
	'/:roomId/waiting-participants',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('waitingParticipantAdmin'),
	waitingParticipantCtrl.getWaitingParticipants
);
meetingRouter.post(
	'/:roomId/waiting-participants/admit',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('waitingParticipantAdmin'),
	waitingParticipantCtrl.admitAllWaitingParticipants
);
meetingRouter.delete(
	'/:roomId/waiting-participants',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	validateBulkRejectWaitingParticipantsReq,
	withRoomPermission('waitingParticipantAdmin'),
	waitingParticipantCtrl.bulkRejectWaitingParticipants
);
meetingRouter.get(
	'/:roomId/waiting-participants/:participantIdentity',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('waitingParticipantAdmin'),
	waitingParticipantCtrl.getWaitingParticipant
);
meetingRouter.post(
	'/:roomId/waiting-participants/:participantIdentity/admit',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('waitingParticipantAdmin'),
	waitingParticipantCtrl.admitWaitingParticipant
);
meetingRouter.delete(
	'/:roomId/waiting-participants/:participantIdentity',
	withAuth(apiKeyValidator, roomMemberTokenValidator),
	withValidRoomId,
	withRoomPermission('waitingParticipantAdmin'),
	waitingParticipantCtrl.rejectWaitingParticipant
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
	withRoomPermission('participantSendReaction'),
	meetingCtrl.sendParticipantReaction
);

// The ticket is the only credential, and no header is needed, so a page that unloads sends it without a CORS preflight.
internalMeetingRouter.post(
	'/:roomId/waiting-participants/leave',
	withValidRoomId,
	validateWaitingParticipantLeaveReq,
	waitingParticipantCtrl.leaveWaiting
);

// Only a participant in the meeting reads its chat, so only the room member token they joined with is accepted.
internalMeetingRouter.get(
	'/:roomId/chat/messages',
	withAuth(roomMemberTokenValidator),
	withValidRoomId,
	validateListChatMessagesReq,
	withRoomPermission('chatRead'),
	meetingCtrl.listChatMessages
);
