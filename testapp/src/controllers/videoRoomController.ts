import { Request, Response } from 'express';
import { Server } from 'socket.io';
import { ConfigService } from '../services/config.service.js';
import { Logger } from '../utils/logger.js';
import { MeetWebhookEvent } from '../../../typings/src/webhook.model.js';
import { ParticipantRole } from '../../../typings/src/participant.js';

// Initialize logger
const logger = new Logger('VideoRoomController');

/**
 * Join Room request body interface
 */
interface JoinRoomRequest {
  participantRole: ParticipantRole;
  roomUrl: string;
  participantName?: string;
}

/**
 * Handles joining a room with the specified role
 */
export const joinRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const { participantRole, roomUrl, participantName = 'User' } = req.body as JoinRoomRequest;

    if (!roomUrl) {
      throw new Error('Room URL is required.');
    }

    logger.info(`Joining room as ${participantRole}: ${roomUrl}`);

    const config = ConfigService.getInstance();

    res.render('videoRoom', {
      roomUrl,
      participantRole,
      participantName,
      isModerator: participantRole === 'moderator',
      apiKey: config.apiKey,
    });

    logger.info(`Successfully rendered video room for ${participantName}`);
  } catch (error) {
    logger.error('Error joining room:', error);
    res.status(400).json({ message: 'Error joining room', error: (error as Error).message });
  }
};

/**
 * Handles incoming webhook events from OpenVidu Meet
 */
export const handleWebhook = async (req: Request, res: Response, io: Server): Promise<void> => {
  try {
    const webhookEvent = req.body as MeetWebhookEvent;

    // Log event details
    logger.info(`Webhook received: ${webhookEvent.event}`, {
      type: webhookEvent.event,
      timestamp: webhookEvent.creationDate,
      data: webhookEvent.data,
    });

    // Broadcast to all connected clients
    io.emit('webhookEvent', webhookEvent);
    logger.debug('Event broadcast to all clients');

    res.status(200).send('Webhook received');
  } catch (error) {
    logger.error('Error handling webhook:', error);
    res.status(400).json({ message: 'Error handling webhook', error: (error as Error).message });
  }
};
