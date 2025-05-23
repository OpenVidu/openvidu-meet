import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute } from '@angular/router';
import { ContextService, HttpService } from '@lib/services';
import { ActionService, MeetRecordingInfo, OpenViduComponentsUiModule } from 'shared-meet-components';

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
		protected httpService: HttpService,
		protected actionService: ActionService,
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
		const queryParamForAvoidCache = `?t=${new Date().getTime()}`;
		let recordingUrl = this.httpService.getRecordingMediaUrl(recording.recordingId);
		recordingUrl += queryParamForAvoidCache;
		this.actionService.openRecordingPlayerDialog(recordingUrl);
	}

	downloadRecording(recording: MeetRecordingInfo) {
		const queryParamForAvoidCache = `?t=${new Date().getTime()}`;
		let recordingUrl = this.httpService.getRecordingMediaUrl(recording.recordingId);
		recordingUrl += queryParamForAvoidCache;

		const link = document.createElement('a');
		link.href = recordingUrl;
		link.download = recording.filename || 'openvidu-recording.mp4';
		link.dispatchEvent(
			new MouseEvent('click', {
				bubbles: true,
				cancelable: true,
				view: window
			})
		);

		// For Firefox it is necessary to delay revoking the ObjectURL
		setTimeout(() => link.remove(), 100);
	}

	async deleteRecording(recording: MeetRecordingInfo) {
		try {
			await this.httpService.deleteRecording(recording.recordingId!);
			this.recordings = this.recordings.filter((r) => r.recordingId !== recording.recordingId);
		} catch (error) {
			console.log(error);
		}
	}

	private async loadRecordings() {
		try {
			const response = await this.httpService.getRecordings(this.nextPageToken);
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
