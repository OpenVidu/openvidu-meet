import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute } from '@angular/router';
import { OpenViduComponentsUiModule } from 'openvidu-components-angular';
import { ContextService, RecordingManagerService } from '../../services';
import { MeetRecordingFilters, MeetRecordingInfo } from '../../typings/ce';

@Component({
	selector: 'app-room-recordings',
	templateUrl: './room-recordings.component.html',
	styleUrls: ['./room-recordings.component.scss'],
	standalone: true,
	imports: [
		CommonModule,
		MatToolbarModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		DatePipe,
		DecimalPipe,
		OpenViduComponentsUiModule
	]
})
export class RoomRecordingsComponent implements OnInit {
	roomId = '';
	canDeleteRecordings = false;
	recordings: MeetRecordingInfo[] = [];
	moreRecordings = false;
	private nextPageToken: string | undefined;

	constructor(
		protected contextService: ContextService,
		protected recordingService: RecordingManagerService,
		protected route: ActivatedRoute
	) {}

	async ngOnInit() {
		this.route.params.subscribe((params) => {
			this.roomId = params['room-id'];
		});
		this.canDeleteRecordings = this.contextService.canDeleteRecordings();

		await this.loadRecordings();
	}

	async loadMoreRecordings() {
		if (!this.moreRecordings || !this.nextPageToken) {
			console.warn('No more recordings to load');
			return;
		}

		await this.loadRecordings();
	}

	async refreshRecordings() {
		this.resetRecordings();
		await this.loadRecordings();
	}

	playRecording(recording: MeetRecordingInfo) {
		this.recordingService.playRecording(recording.recordingId);
	}

	downloadRecording(recording: MeetRecordingInfo) {
		this.recordingService.downloadRecording(recording);
	}

	async deleteRecording(recording: MeetRecordingInfo) {
		try {
			await this.recordingService.deleteRecording(recording.recordingId!);
			this.recordings = this.recordings.filter((r) => r.recordingId !== recording.recordingId);
		} catch (error) {
			console.log(error);
		}
	}

	openShareDialog(recording: MeetRecordingInfo) {
		this.recordingService.openShareRecordingDialog(recording.recordingId);
	}

	private async loadRecordings() {
		try {
			const recordingFilters: MeetRecordingFilters = {
				roomId: this.roomId,
				nextPageToken: this.nextPageToken
			};
			const response = await this.recordingService.listRecordings(recordingFilters);
			this.recordings.push(...response.recordings);
			this.recordings = this.sortRecordingsByDate(this.recordings);
			this.nextPageToken = response.pagination.nextPageToken;
			this.moreRecordings = response.pagination.isTruncated;
		} catch (error) {
			console.log(error);
		}
	}

	private sortRecordingsByDate(recordings: MeetRecordingInfo[]) {
		return recordings.sort((a, b) => {
			const dateA = new Date(a.startDate || -1);
			const dateB = new Date(b.startDate || -1);
			return dateA.getTime() - dateB.getTime();
		});
	}

	private resetRecordings() {
		this.recordings = [];
		this.nextPageToken = undefined;
		this.moreRecordings = false;
	}
}
