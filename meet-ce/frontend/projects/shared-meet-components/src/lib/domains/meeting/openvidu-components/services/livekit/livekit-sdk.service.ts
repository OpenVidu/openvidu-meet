import { Injectable } from '@angular/core';
import {
	AudioCaptureOptions,
	ConnectionState,
	createKeyMaterialFromString,
	createLocalTracks,
	CreateLocalTracksOptions,
	DataPublishOptions,
	DataPacket_Kind,
	DisconnectReason,
	E2EEOptions,
	ExternalE2EEKeyProvider,
	LocalAudioTrack,
	LocalParticipant,
	LocalTrack,
	LocalTrackPublication,
	LocalVideoTrack,
	Participant,
	RemoteParticipant,
	RemoteTrack,
	RemoteTrackPublication,
	Room,
	RoomEvent,
	RoomOptions,
	ScreenShareCaptureOptions,
	TextStreamReader,
	deriveKeys,
	Track,
	TrackPublication,
	TrackPublishOptions,
	VideoCaptureOptions,
	VideoPresets
} from 'livekit-client';
import { SwitchBackgroundProcessorOptions } from '@livekit/track-processors';

@Injectable({
	providedIn: 'root'
})
export class LivekitSdkService {
	createRoom(roomOptions: RoomOptions): Room {
		return new Room(roomOptions);
	}

	async connectRoom(room: Room, livekitUrl: string, livekitToken: string): Promise<void> {
		await room.connect(livekitUrl, livekitToken);
	}

	async disconnectRoom(room: Room): Promise<void> {
		await room.disconnect();
	}

	async createLocalTracks(options: CreateLocalTracksOptions): Promise<LocalTrack[]> {
		return createLocalTracks(options);
	}

	async getLocalDevices(): Promise<MediaDeviceInfo[]> {
		return Room.getLocalDevices();
	}
}

export {
	ConnectionState,
	createLocalTracks,
	createKeyMaterialFromString,
	DataPacket_Kind,
	DisconnectReason,
	ExternalE2EEKeyProvider,
	LocalAudioTrack,
	LocalParticipant,
	LocalTrack,
	LocalTrackPublication,
	LocalVideoTrack,
	Participant,
	RemoteParticipant,
	RemoteTrack,
	RemoteTrackPublication,
	Room,
	RoomEvent,
	Track,
	TrackPublication,
	deriveKeys,
	VideoPresets
};

export type {
	AudioCaptureOptions,
	CreateLocalTracksOptions,
	DataPublishOptions,
	E2EEOptions,
	RoomOptions,
	ScreenShareCaptureOptions,
	TextStreamReader,
	SwitchBackgroundProcessorOptions,
	TrackPublishOptions,
	VideoCaptureOptions
};