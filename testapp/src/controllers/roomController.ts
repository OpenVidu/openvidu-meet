import { Request, Response } from 'express';
import { Server as IOServer } from 'socket.io';
import { ParticipantRole } from '../../../typings/src/participant';
// @ts-ignore
import { MeetWebhookEvent } from '../../../typings/src/webhook.model';

interface JoinRoomRequest {
	participantRole: ParticipantRole;
	roomUrl: string;
	participantName?: string;
}

export const joinRoom = (req: Request, res: Response) => {
	try {
		const {
			participantRole,
			roomUrl,
			participantName = 'User',
		} = req.body as JoinRoomRequest;
		if (!roomUrl) {
			throw new Error('Room URL is required.');
		}
		res.render('room', {
			roomUrl,
			participantRole,
			participantName,
			isModerator: participantRole === 'moderator',
		});
	} catch (error) {
		console.error('Error joining room:', error);
		res.status(500).send('Internal Server Error');
		return;
	}
};

export const handleWebhook = async (
	req: Request,
	res: Response,
	io: IOServer
): Promise<void> => {
	try {
		const webhookEvent = req.body as MeetWebhookEvent;

		// Log event details
		console.info(`Webhook received: ${webhookEvent.event}`);

		// Broadcast to all connected clients
		io.emit('webhookEvent', webhookEvent);
		res.status(200).send('Webhook received');
	} catch (error) {
		console.error('Error handling webhook:', error);
		res.status(400).json({
			message: 'Error handling webhook',
			error: (error as Error).message,
		});
	}
};
