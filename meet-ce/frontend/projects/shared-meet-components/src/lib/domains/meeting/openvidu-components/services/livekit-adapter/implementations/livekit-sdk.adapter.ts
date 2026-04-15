import { Injectable, inject } from '@angular/core';
import { LivekitSdkService } from '../../livekit/livekit-sdk.service';
import { LivekitAdapterInterface } from '../interfaces/livekit.adapter.interface';
import { IRoom, IRoomOptions } from '../interfaces/room.interface';
import { ICreateLocalTracksOptions, ILocalTrack } from '../interfaces/track.interface';

@Injectable({
	providedIn: 'root'
})
export class LiveKitSdkAdapter implements LivekitAdapterInterface {
	private readonly livekitSdkService = inject(LivekitSdkService);

	createRoom(roomOptions: IRoomOptions): IRoom {
		return this.livekitSdkService.createRoom(roomOptions);
	}

	connectRoom(room: IRoom, livekitUrl: string, livekitToken: string): Promise<void> {
		return this.livekitSdkService.connectRoom(room, livekitUrl, livekitToken);
	}

	disconnectRoom(room: IRoom): Promise<void> {
		return this.livekitSdkService.disconnectRoom(room);
	}

	createLocalTracks(options: ICreateLocalTracksOptions): Promise<ILocalTrack[]> {
		return this.livekitSdkService.createLocalTracks(options);
	}

	getLocalDevices(): Promise<MediaDeviceInfo[]> {
		return this.livekitSdkService.getLocalDevices();
	}
}
