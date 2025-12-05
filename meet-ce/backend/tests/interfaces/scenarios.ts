import { MeetRoom } from '@openvidu-meet/typings';

export interface RoomData {
	room: MeetRoom;
	moderatorSecret: string;
	moderatorToken: string;
	speakerSecret: string;
	speakerToken: string;
	recordingId?: string;
}

export interface TestContext {
	rooms: RoomData[];
	getRoomByIndex(index: number): RoomData | undefined;
	getLastRoom(): RoomData | undefined;
}