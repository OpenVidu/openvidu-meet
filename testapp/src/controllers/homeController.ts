import { Request, Response } from 'express';
import {
	getAllRooms,
	createRoom,
	deleteRoom,
	deleteAllRooms,
} from '../services/roomService';
import {
	deleteAllRecordings,
	getAllRecordings,
} from '../services/recordingService';

export const getHome = async (req: Request, res: Response) => {
	try {
		const { rooms } = await getAllRooms();

		//sort rooms by newest first
		rooms.sort((a, b) => {
			const dateA = new Date(a.creationDate);
			const dateB = new Date(b.creationDate);
			return dateB.getTime() - dateA.getTime();
		});

		console.log(`Rooms fetched: ${rooms.length}`);
		res.render('index', { rooms });
	} catch (error) {
		console.error('Error fetching rooms:', error);
		res.status(500).send('Internal Server Error');
		return;
	}
};

export const postCreateRoom = async (req: Request, res: Response) => {
	try {
		const { roomIdPrefix, autoDeletionDate } = req.body;
		const preferences = processFormPreferences(req.body);

		await createRoom({ roomIdPrefix, autoDeletionDate, preferences });
		res.redirect('/');
	} catch (error) {
		console.error('Error creating room:', error);
		res.status(500).send('Internal Server Error');
		return;
	}
};

export const deleteRoomCtrl = async (req: Request, res: Response) => {
	try {
		const { roomId } = req.body;
		await deleteRoom(roomId);
		res.redirect('/');
	} catch (error) {
		console.error('Error deleting room:', error);
		res.status(500).send('Internal Server Error');
		return;
	}
};

export const deleteAllRoomsCtrl = async (_req: Request, res: Response) => {
	try {
		const allRooms = await getAllRooms();
		if (allRooms.rooms.length === 0) {
			console.log('No rooms to delete');
			res.render('index', { rooms: [] });
			return;
		}
		const roomIds = allRooms.rooms.map((room) => room.roomId);
		console.log(`Deleting ${roomIds.length} rooms`, roomIds);
		await deleteAllRooms(roomIds);
		res.render('index', { rooms: [] });
	} catch (error) {
		console.error('Error deleting all rooms:', error);
		res.status(500).send('Internal Server Error ' + JSON.stringify(error));
		return;
	}
};

export const deleteAllRecordingsCtrl = async (_req: Request, res: Response) => {
	try {
		const [{ recordings }, { rooms }] = await Promise.all([
			getAllRecordings(),
			getAllRooms(),
		]);
		if (recordings.length === 0) {
			console.log('No recordings to delete');
			res.render('index', { rooms });
			return;
		}
		const recordingIds = recordings.map((recording) => recording.recordingId);
		await deleteAllRecordings(recordingIds);
		console.log(`Deleted ${recordingIds.length} recordings`);
		res.render('index', { rooms });
	} catch (error) {
		console.error('Error deleting all recordings:', error);
		res.status(500).send('Internal Server Error ' + JSON.stringify(error));
		return;
	}
};

/**
 * Converts flat form data to nested MeetRoomPreferences object
 */
const processFormPreferences = (body: any): any => {
	const preferences = {
		chatPreferences: {
			enabled: body['preferences.chatPreferences.enabled'] === 'on',
		},
		recordingPreferences: {
			enabled: body['preferences.recordingPreferences.enabled'] === 'on',
			// Only include allowAccessTo if recording is enabled
			...(body['preferences.recordingPreferences.enabled'] === 'on' && {
				allowAccessTo:
					body['preferences.recordingPreferences.allowAccessTo'] ||
					'admin-moderator-publisher',
			}),
		},
		virtualBackgroundPreferences: {
			enabled:
				body['preferences.virtualBackgroundPreferences.enabled'] === 'on',
		},
	};

	return preferences;
};
