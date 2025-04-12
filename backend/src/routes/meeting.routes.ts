import { Router } from 'express';
import bodyParser from 'body-parser';
import * as meetingCtrl from '../controllers/meeting.controller.js';
import * as participantCtrl from '../controllers/participant.controller.js';
import { withModeratorPermissions, participantTokenValidator, withAuth } from '../middlewares/index.js';

export const internalMeetingRouter = Router();
internalMeetingRouter.use(bodyParser.urlencoded({ extended: true }));
internalMeetingRouter.use(bodyParser.json());

// Internal Meetings Routes
internalMeetingRouter.delete(
	':roomId',
	withAuth(participantTokenValidator),
	withModeratorPermissions,
	meetingCtrl.endMeeting
);
internalMeetingRouter.delete(
	':roomId/participants/:participantName',
	withAuth(participantTokenValidator),
	withModeratorPermissions,
	participantCtrl.deleteParticipant
);
