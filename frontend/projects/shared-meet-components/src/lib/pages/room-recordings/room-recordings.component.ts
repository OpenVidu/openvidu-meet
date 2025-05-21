import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { HttpService } from '@lib/services';
import {
	OpenViduComponentsModule,
	ApiDirectiveModule,
	RecordingDeleteRequestedEvent
} from 'openvidu-components-angular';
import { MeetRecordingInfo } from 'shared-meet-components';

@Component({
	selector: 'app-room-recordings',
	templateUrl: './room-recordings.component.html',
	styleUrls: ['./room-recordings.component.scss'],
	standalone: true,
	imports: [OpenViduComponentsModule, ApiDirectiveModule]
})
export class RoomRecordingsComponent implements OnInit {
	recordings: MeetRecordingInfo[] = [];
	loading = true;
	error = '';
	private continuationToken: string | undefined;

	constructor(private httpService: HttpService) {}

	async ngOnInit() {
		await this.loadRecordings();
		console.log('Recordings loaded:', this.recordings);
	}

	async onLoadMoreRecordingsRequested() {
		if (!this.continuationToken) {
			console.warn('No more recordings to load');
			return;
		}

		await this.loadRecordings();
	}

	async onRefreshRecordingsClicked() {
		await this.loadRecordings();
	}

	async onDeleteRecordingClicked(deleteRequest: RecordingDeleteRequestedEvent) {
		try {
			await this.httpService.deleteRecording(deleteRequest.recordingId!);
		} catch (error) {
			console.log(error);
		}

		await this.loadRecordings();
	}

	private async loadRecordings() {
		try {
			const { recordings, continuationToken } = await this.httpService.getRecordings(this.continuationToken);
			this.recordings = recordings;
			this.continuationToken = continuationToken;
		} catch (error) {
			console.log(error);
		}
	}
}
