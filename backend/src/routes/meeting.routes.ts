import bodyParser from 'body-parser';
import { Router } from 'express';
import * as meetingCtrl from '../controllers/meeting.controller.js';
import * as participantCtrl from '../controllers/participant.controller.js';
import {
	participantTokenValidator,
	validateUpdateParticipantRequest,
	withAuth,
	withModeratorPermissions,
	withValidRoomId
} from '../middlewares/index.js';

export const internalMeetingRouter = Router();
internalMeetingRouter.use(bodyParser.urlencoded({ extended: true }));
internalMeetingRouter.use(bodyParser.json());

// Internal Meetings Routes
internalMeetingRouter.delete(
	'/:roomId',
	withAuth(participantTokenValidator),
	withValidRoomId,
	withModeratorPermissions,
	meetingCtrl.endMeeting
);
internalMeetingRouter.patch(
	'/:roomId/participants/:participantIdentity',
	withAuth(participantTokenValidator),
	withValidRoomId,
	withModeratorPermissions,
	validateUpdateParticipantRequest,
	participantCtrl.updateParticipant
);
internalMeetingRouter.delete(
	'/:roomId/participants/:participantIdentity',
	withAuth(participantTokenValidator),
	withValidRoomId,
	withModeratorPermissions,
	participantCtrl.deleteParticipant
);
