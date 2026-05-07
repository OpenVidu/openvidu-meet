import type { MeetRoom, MeetRoomOptions } from '@openvidu-meet/typings';
import { del, get, post } from '../utils/http';
import { configService } from './configService';

export async function getAllRooms(): Promise<MeetRoom[]> {
	const url = `${configService.meetApiUrl}/rooms`;

	try {
		const rooms: MeetRoom[] = [];
		let pageUrl = url;
		let pagination: { isTruncated: boolean; nextPageToken?: string };

		do {
			const result = await get<{
				pagination: { isTruncated: boolean; nextPageToken?: string };
				rooms: MeetRoom[];
			}>(pageUrl, {
				headers: { 'x-api-key': configService.meetApiKey }
			});
			rooms.push(...result.rooms);
			pagination = result.pagination;
			console.log(
				`Fetched ${result.rooms.length} rooms, total: ${rooms.length}, isTruncated: ${pagination.isTruncated}`
			);
			pageUrl = `${url}?nextPageToken=${pagination.nextPageToken}`;
		} while (pagination.isTruncated);

		console.log(`Successfully fetched total of ${rooms.length} rooms`);
		return rooms;
	} catch (error) {
		console.error('Error fetching all rooms:', error);
		throw error;
	}
}

export async function createRoom(roomData: MeetRoomOptions): Promise<MeetRoom> {
	const url = `${configService.meetApiUrl}/rooms`;
	return post<MeetRoom>(url, {
		headers: { 'x-api-key': configService.meetApiKey },
		body: roomData
	});
}

export async function deleteRoom(roomId: string): Promise<void> {
	const url = `${configService.meetApiUrl}/rooms/${roomId}`;
	return del<void>(url, {
		headers: { 'x-api-key': configService.meetApiKey }
	});
}

export async function deleteAllRooms(roomIds: string[]): Promise<void> {
	const url = `${configService.meetApiUrl}/rooms?roomIds=${roomIds.join(',')}&withMeeting=force&withRecordings=force`;
	return del<void>(url, {
		headers: { 'x-api-key': configService.meetApiKey }
	});
}
