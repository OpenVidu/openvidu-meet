import { MeetRoomOptions } from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { deleteAllRecordings, getAllRecordings } from '../services/recordingService';
import { createRoom, deleteAllRooms, deleteRoom, getAllRooms } from '../services/roomService';

export const getHome = async (_req: Request, res: Response) => {
	try {
		console.log('Fetching rooms');
		const rooms = await getAllRooms();
		console.log(`Rooms fetched successfully: ${rooms.length}`);
		res.render('index', { rooms });
	} catch (error) {
		console.error('Error fetching rooms:', error);
		console.error('Error details:', {
			message: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : 'No stack trace'
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
		console.log('Creating room with options:', JSON.stringify(req.body, null, 2));
		const roomOptions = processRoomForm(req.body);

		const result = await createRoom(roomOptions);
		console.log('Room created successfully:', result);
		res.redirect('/');
	} catch (error) {
		console.error('Error creating room:', error);
		console.error('Error details:', {
			message: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : 'No stack trace'
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
		const { roomId } = req.body;
		if (!roomId) {
			console.error('No roomId provided for deletion');
			res.status(400).send('Bad Request - roomId is required');
			return;
		}

		console.log(`Deleting room: ${roomId}`);
		await deleteRoom(roomId);
		console.log(`Room ${roomId} deleted successfully`);
		res.redirect('/');
	} catch (error) {
		console.error('Error deleting room:', error);
		console.error('Error details:', {
			message: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : 'No stack trace'
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

		if (allRooms.length === 0) {
			console.log('No rooms to delete');
			res.render('index', { rooms: [] });
			return;
		}

		const roomIds = allRooms.map((room) => room.roomId);
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
		const [recordings, rooms] = await Promise.all([getAllRecordings(), getAllRooms()]);

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
 * Converts flat form data to MeetRoomOptions structure
 */
const processRoomForm = (body: any): MeetRoomOptions => {
	const config = {
		chat: {
			enabled: body['config.chat.enabled'] === 'on'
		},
		recording: {
			enabled: body['config.recording.enabled'] === 'on'
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

	return {
		roomName: body.roomName,
		autoDeletionDate: body.autoDeletionDate ? new Date(body.autoDeletionDate).getTime() : undefined,
		config
	};
};
