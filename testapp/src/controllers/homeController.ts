import { Request, Response } from 'express';
import { deleteAllRecordings, getAllRecordings } from '../services/recordingService';
import { createRoom, deleteAllRooms, deleteRoom, getAllRooms } from '../services/roomService';

export const getHome = async (_req: Request, res: Response) => {
    try {
        console.log('Fetching rooms from:', `${process.env.MEET_API_URL || 'http://localhost:6080/api/v1'}/rooms`);
        console.log('Using API key:', process.env.MEET_API_KEY || 'meet-api-key');

        const { rooms } = await getAllRooms();

        // Sort rooms by newest first
        rooms.sort((a, b) => {
            const dateA = new Date(a.creationDate);
            const dateB = new Date(b.creationDate);
            return dateB.getTime() - dateA.getTime();
        });

        console.log(`Rooms fetched successfully: ${rooms.length}`);
        res.render('index', { rooms });
    } catch (error) {
        console.error('Error fetching rooms:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace',
            apiUrl: process.env.MEET_API_URL || 'http://localhost:6080/api/v1',
            apiKey: process.env.MEET_API_KEY || 'meet-api-key'
        });
        res.status(500).send(
            'Internal Server Error - Failed to fetch rooms: ' +
                (error instanceof Error ? error.message : 'Unknown error')
        );
        return;
    }
};

export const postCreateRoom = async (req: Request, res: Response) => {
    try {
        console.log('Creating room with body:', JSON.stringify(req.body, null, 2));
        const { roomName, autoDeletionDate } = req.body;
        const config = processFormConfig(req.body);

        console.log('Processed config:', JSON.stringify(config, null, 2));
        console.log('Room creation parameters:', { roomName, autoDeletionDate });

        const result = await createRoom({ roomName, autoDeletionDate, config });
        console.log('Room created successfully:', result);
        res.redirect('/');
    } catch (error) {
        console.error('Error creating room:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace',
            requestBody: req.body
        });
        res.status(500).send(
            'Internal Server Error - Failed to create room: ' +
                (error instanceof Error ? error.message : 'Unknown error')
        );
        return;
    }
};

export const deleteRoomCtrl = async (req: Request, res: Response) => {
    try {
        console.log('Deleting room with body:', JSON.stringify(req.body, null, 2));
        const { roomId } = req.body;

        if (!roomId) {
            console.error('No roomId provided for deletion');
            res.status(400).send('Bad Request - roomId is required');
            return;
        }

        console.log(`Attempting to delete room: ${roomId}`);
        await deleteRoom(roomId);
        console.log(`Room ${roomId} deleted successfully`);
        res.redirect('/');
    } catch (error) {
        console.error('Error deleting room:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace',
            requestBody: req.body
        });
        res.status(500).send(
            'Internal Server Error - Failed to delete room: ' +
                (error instanceof Error ? error.message : 'Unknown error')
        );
        return;
    }
};

export const deleteAllRoomsCtrl = async (_req: Request, res: Response) => {
    try {
        console.log('Deleting all rooms...');
        const allRooms = await getAllRooms();
        console.log(`Found ${allRooms.rooms.length} rooms to delete`);

        if (allRooms.rooms.length === 0) {
            console.log('No rooms to delete');
            res.render('index', { rooms: [] });
            return;
        }

        const roomIds = allRooms.rooms.map((room) => room.roomId);
        console.log(`Deleting ${roomIds.length} rooms:`, roomIds);
        await deleteAllRooms(roomIds);
        console.log('All rooms deleted successfully');
        res.render('index', { rooms: [] });
    } catch (error) {
        console.error('Error deleting all rooms:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        res.status(500).send(
            'Internal Server Error - Failed to delete all rooms: ' +
                (error instanceof Error ? error.message : 'Unknown error')
        );
        return;
    }
};

export const deleteAllRecordingsCtrl = async (_req: Request, res: Response) => {
    try {
        console.log('Deleting all recordings...');
        const [{ recordings }, { rooms }] = await Promise.all([getAllRecordings(), getAllRooms()]);
        console.log(`Found ${recordings.length} recordings to delete`);

        if (recordings.length === 0) {
            console.log('No recordings to delete');
            res.render('index', { rooms });
            return;
        }

        const recordingIds = recordings.map((recording) => recording.recordingId);
        console.log(`Deleting ${recordingIds.length} recordings:`, recordingIds);
        await deleteAllRecordings(recordingIds);
        console.log('All recordings deleted successfully');
        res.render('index', { rooms });
    } catch (error) {
        console.error('Error deleting all recordings:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        res.status(500).send(
            'Internal Server Error - Failed to delete all recordings: ' +
                (error instanceof Error ? error.message : 'Unknown error')
        );
        return;
    }
};

/**
 * Converts flat form data to nested MeetRoomConfig object
 */
const processFormConfig = (body: any): any => {
    const config = {
        chat: {
            enabled: body['config.chat.enabled'] === 'on'
        },
        recording: {
            enabled: body['config.recording.enabled'] === 'on',
            // Only include allowAccessTo if recording is enabled
            ...(body['config.recording.enabled'] === 'on' && {
                allowAccessTo: body['config.recording.allowAccessTo'] || 'admin_moderator_speaker'
            })
        },
        virtualBackground: {
            enabled: body['config.virtualBackground.enabled'] === 'on'
        },
        e2ee: {
            enabled: body['config.e2ee.enabled'] === 'on'
        },
        captions: {
            enabled: body['config.captions.enabled'] === 'on'
        }
    };

    return config;
};
