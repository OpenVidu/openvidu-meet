import type { IRoom, IRoomOptions } from './room.interface';
import type { ICreateLocalTracksOptions, ILocalTrack } from './track.interface';

export interface LivekitAdapterInterface {
	createRoom(roomOptions: IRoomOptions): IRoom;
	connectRoom(room: IRoom, livekitUrl: string, livekitToken: string): Promise<void>;
	disconnectRoom(room: IRoom): Promise<void>;
	createLocalTracks(options: ICreateLocalTracksOptions): Promise<ILocalTrack[]>;
	getLocalDevices(): Promise<MediaDeviceInfo[]>;
}
