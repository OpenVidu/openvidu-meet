import { del, get, post } from '../utils/http';
import { configService } from './configService';
// @ts-ignore
import { MeetRoom, MeetRoomOptions } from '../../../typings/src/room';

export async function getAllRooms(): Promise<{
    pagination: any;
    rooms: MeetRoom[];
}> {
    const url = `${configService.meetApiUrl}/rooms`;
    return get<{ pagination: any; rooms: MeetRoom[] }>(url, {
        headers: { 'x-api-key': configService.meetApiKey }
    });
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

    console.log('Creating room with options:', roomData);
    return post<MeetRoom>(url, {
        headers: { 'x-api-key': configService.meetApiKey },
        body: roomData
    });
}

export async function deleteRoom(roomId: string): Promise<void> {
    const url = `${configService.meetApiUrl}/rooms/${roomId}`;
    await del<void>(url, {
        headers: { 'x-api-key': configService.meetApiKey }
    });
}

export async function deleteAllRooms(roomIds: string[]): Promise<void> {
    const url = `${configService.meetApiUrl}/rooms?roomIds=${roomIds.join(',')}`;
    await del<void>(url, {
        headers: { 'x-api-key': configService.meetApiKey }
    });
}
