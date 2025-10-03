import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { NavigationService, RecordingService, RoomService } from '@lib/services';
import { MeetRecordingStatus, MeetRoom, MeetRoomStatus } from '@lib/typings/ce';

interface OverviewStats {
	totalRooms: number;
	activeRooms: number;
	totalRecordings: number;
	playableRecordings: number;
	hasData: boolean;
	isLoading: boolean;
}

@Component({
    selector: 'ov-overview',
    imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatGridListModule],
    templateUrl: './overview.component.html',
    styleUrl: './overview.component.scss'
})
export class OverviewComponent implements OnInit {
	stats: OverviewStats = {
		totalRooms: 0,
		activeRooms: 0,
		totalRecordings: 0,
		playableRecordings: 0,
		hasData: false,
		isLoading: true
	};

	constructor(
		private roomService: RoomService,
		private recordingService: RecordingService,
		private navigationService: NavigationService
	) {}

	async ngOnInit() {
		await this.loadStats();
	}

	private async loadStats() {
		try {
			this.stats.isLoading = true;

			const [roomsResp, recordingsResp] = await Promise.all([
				this.roomService.listRooms({ maxItems: 100 }),
				this.recordingService.listRecordings({ maxItems: 100 })
			]);
			const rooms = roomsResp.rooms;
			const recordings = recordingsResp.recordings;

			this.stats = {
				totalRooms: rooms.length,
				activeRooms: rooms.filter((room: MeetRoom) => room.status === MeetRoomStatus.ACTIVE_MEETING).length,
				totalRecordings: recordings.length,
				playableRecordings: recordings.filter((recording) => recording.status === MeetRecordingStatus.COMPLETE)
					.length,
				hasData: rooms.length > 0 || recordings.length > 0,
				isLoading: false
			};
		} catch {
			this.stats = {
				totalRooms: 0,
				activeRooms: 0,
				totalRecordings: 0,
				playableRecordings: 0,
				hasData: false,
				isLoading: false
			};
		}
	}

	async navigateTo(section: 'rooms' | 'rooms/new' | 'recordings' | 'config' | 'embedded') {
		try {
			await this.navigationService.navigateTo(section);
		} catch (error) {
			console.error(`Error navigating to ${section}:`, error);
		}
	}

	async refreshData() {
		await this.loadStats();
	}
}
