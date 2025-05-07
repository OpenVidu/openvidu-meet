import { Request, Response } from 'express';
import { RoomService } from '../services/room.service.js';
import { Logger } from '../utils/logger.js';
import { MeetRoomOptions } from '../../../typings/src/room.js';

// Initialize logger
const logger = new Logger('HomeController');

/**
 * Renders the home page with available rooms
 */
export const renderHomePage = async (req: Request, res: Response): Promise<void> => {
  const roomService = RoomService.getInstance();

  try {
    logger.info('Rendering home page');
    const rooms = await roomService.getAllRooms();
    res.render('home', { rooms });
  } catch (error) {
    logger.error('Error fetching rooms:', error);
    res.render('home', { rooms: [], error: 'Failed to load rooms' });
  }
};

/**
 * Creates a new room based on form data
 */
export const createRoom = async (req: Request, res: Response): Promise<void> => {
  const roomService = RoomService.getInstance();

  try {
    // Extract values from request body
    const { roomIdPrefix, autoDeletionDate } = req.body;

    logger.info(`Creating room with prefix: ${roomIdPrefix}`);

    const roomData: MeetRoomOptions = {
      roomIdPrefix,
      autoDeletionDate: new Date(autoDeletionDate).getTime(),
    };

    const newRoom = await roomService.createRoom(roomData);

    if (!newRoom) {
      throw new Error('Room creation failed');
    }

    logger.info(`Room created successfully: ${newRoom.roomId}`);

    // Redirect to home page showing the new room
    await renderHomePage(req, res);
  } catch (error) {
    logger.error('Room creation error:', error);
    res.status(500).json({ message: 'Error creating a room', error: (error as Error).message });
  }
};
