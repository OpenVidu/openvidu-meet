import bodyParser from 'body-parser';
import { Router } from 'express';
import * as meetingCtrl from '../controllers/meeting.controller.js';
import * as participantCtrl from '../controllers/participant.controller.js';
import { participantTokenValidator, withAuth, withModeratorPermissions, withValidParticipantRole, withValidRoomId } from '../middlewares/index.js';

export const internalMeetingRouter = Router();
internalMeetingRouter.use(bodyParser.urlencoded({ extended: true }));
internalMeetingRouter.use(bodyParser.json());

// Internal Meetings Routes
internalMeetingRouter.delete(
	'/:roomId',
	withAuth(participantTokenValidator),
	withModeratorPermissions,
	withValidRoomId,
	meetingCtrl.endMeeting
);
internalMeetingRouter.delete(
	'/:roomId/participants/:participantName',
	withAuth(participantTokenValidator),
	withModeratorPermissions,
	withValidRoomId,
	participantCtrl.deleteParticipant
);

internalMeetingRouter.patch(
	'/:roomId/participants/:participantName',
	withAuth(participantTokenValidator),
	withModeratorPermissions,
	withValidRoomId,
	withValidParticipantRole,
	participantCtrl.changeParticipantRole
);
