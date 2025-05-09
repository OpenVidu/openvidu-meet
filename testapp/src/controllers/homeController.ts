import { Request, Response } from 'express';
import { getAllRooms, createRoom, deleteRoom } from '../services/roomService';

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
		await createRoom({ roomIdPrefix, autoDeletionDate });
		res.redirect('/');
	} catch (error) {
		console.error('Error creating room:', error);
		res.status(500).send('Internal Server Error');
		return;
	}
};

export const postDeleteRoom = async (req: Request, res: Response) => {
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
