import { del, get, post } from '../utils/http';
import { configService } from './configService';
// @ts-ignore
import { MeetRoom, MeetRoomOptions } from '../../../typings/src/room';

export async function getAllRooms(): Promise<{
    pagination: any;
    rooms: MeetRoom[];
}> {
    const url = `${configService.meetApiUrl}/rooms`;
    console.log(`Fetching all rooms from: ${url}`);
    try {
        const result = await get<{ pagination: any; rooms: MeetRoom[] }>(url, {
            headers: { 'x-api-key': configService.meetApiKey }
        });
        console.log(`Successfully fetched ${result.rooms.length} rooms`);
        return result;
    } catch (error) {
        console.error('Error fetching all rooms:', error);
        throw error;
    }
}

export async function createRoom(roomData: MeetRoomOptions): Promise<MeetRoom> {
    const url = `${configService.meetApiUrl}/rooms`;
    // Default to 1 hour if autoDeletionDate is not provided
    if (!roomData.autoDeletionDate) {
        roomData.autoDeletionDate = new Date(Date.now() + 60 * 61 * 1000).getTime();
    } else {
        // Ensure autoDeletionDate is a timestamp
        roomData.autoDeletionDate = new Date(roomData.autoDeletionDate).getTime();
    }

    console.log('Creating room with options:', JSON.stringify(roomData, null, 2));
    console.log(`Making POST request to: ${url}`);
    try {
        const result = await post<MeetRoom>(url, {
            headers: { 'x-api-key': configService.meetApiKey },
            body: roomData
        });
        console.log('Room created successfully:', JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error('Error creating room:', error);
        console.error('Room data that failed:', JSON.stringify(roomData, null, 2));
        throw error;
    }
}

export async function deleteRoom(roomId: string): Promise<void> {
    const url = `${configService.meetApiUrl}/rooms/${roomId}`;
    console.log(`Deleting room ${roomId} from: ${url}`);
    try {
        await del<void>(url, {
            headers: { 'x-api-key': configService.meetApiKey }
        });
        console.log(`Room ${roomId} deleted successfully`);
    } catch (error) {
        console.error(`Error deleting room ${roomId}:`, error);
        throw error;
    }
}

export async function deleteAllRooms(roomIds: string[]): Promise<void> {
    const url = `${configService.meetApiUrl}/rooms?roomIds=${roomIds.join(',')}`;
    console.log(`Deleting ${roomIds.length} rooms from: ${url}`);
    console.log('Room IDs to delete:', roomIds);
    try {
        await del<void>(url, {
            headers: { 'x-api-key': configService.meetApiKey }
        });
        console.log(`Successfully deleted ${roomIds.length} rooms`);
    } catch (error) {
        console.error(`Error deleting ${roomIds.length} rooms:`, error);
        console.error('Room IDs that failed:', roomIds);
        throw error;
    }
}
