import { ConfigService } from './config.service.js';
import { Logger } from '../utils/logger.js';
import { MeetRoom, MeetRoomOptions } from '../../../typings/src/room.js';

/**
 * Service for handling Room-related API operations
 */
export class RoomService {
  private static instance: RoomService;
  private config: ConfigService;
  private logger: Logger;

  private constructor() {
    this.config = ConfigService.getInstance();
    this.logger = new Logger('RoomService');
  }

  /**
   * Get singleton instance of RoomService
   */
  public static getInstance(): RoomService {
    if (!RoomService.instance) {
      RoomService.instance = new RoomService();
    }
    return RoomService.instance;
  }

  /**
   * Fetch all rooms from the API
   */
  public async getAllRooms(): Promise<MeetRoom[]> {
    try {
      this.logger.info('Fetching all rooms from API');
      const response = await fetch(`${this.config.meetApiUrl}/rooms`, {
        headers: this.config.getApiHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch rooms: ${response.statusText}`);
      }

      const data: { pagination: any; rooms: MeetRoom[] } = await response.json();
      this.logger.debug(`Retrieved ${data.rooms.length} rooms`);
      return data.rooms;
    } catch (error) {
      this.logger.error('Error fetching rooms:', error);
      return [];
    }
  }

  /**
   * Create a new room
   */
  public async createRoom(roomData: MeetRoomOptions): Promise<MeetRoom | null> {
    try {
      this.logger.info(`Creating new room with prefix: ${roomData.roomIdPrefix}`);
      const response = await fetch(`${this.config.meetApiUrl}/rooms`, {
        method: 'POST',
        headers: this.config.getApiHeaders(),
        body: JSON.stringify(roomData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Room creation failed');
      }

      const newRoom: MeetRoom = await response.json();
      this.logger.info(`Room created successfully: ${newRoom.roomId}`);
      return newRoom;
    } catch (error) {
      this.logger.error('Error creating room:', error);
      return null;
    }
  }

  /**
   * Get a specific room by ID
   */
  public async getRoomById(roomId: string): Promise<MeetRoom | null> {
    try {
      this.logger.info(`Fetching room with id: ${roomId}`);
      const response = await fetch(`${this.config.meetApiUrl}/rooms/${roomId}`, {
        headers: this.config.getApiHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.warn(`Room not found: ${roomId}`);
          return null;
        }
        throw new Error(`Failed to fetch room: ${response.statusText}`);
      }

      const room = await response.json();
      return room;
    } catch (error) {
      this.logger.error(`Error fetching room ${roomId}:`, error);
      return null;
    }
  }
}
