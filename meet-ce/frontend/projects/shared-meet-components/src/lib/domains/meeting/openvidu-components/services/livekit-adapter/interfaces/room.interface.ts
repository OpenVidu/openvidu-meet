import type {
	ConnectionState,
	DataPublishOptions,
	E2EEOptions,
	Room,
	RoomOptions
} from '../../livekit/livekit-sdk.service';

export type IRoom = Room;
export type IRoomOptions = RoomOptions;
export type IDataPublishOptions = DataPublishOptions;
export type IE2EEOptions = E2EEOptions;
export type IConnectionState = typeof ConnectionState;
