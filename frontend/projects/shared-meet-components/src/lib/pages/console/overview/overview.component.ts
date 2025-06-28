import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { NavigationService, RecordingManagerService, RoomService, ThemeService } from '../../../services';
import { MeetRoom } from '../../../typings/ce';

interface OverviewStats {
	totalRooms: number;
	activeRooms: number;
	totalRecordings: number;
	hasData: boolean;
}

@Component({
	selector: 'ov-overview',
	standalone: true,
	imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatGridListModule],
	templateUrl: './overview.component.html',
	styleUrl: './overview.component.scss'
})
export class OverviewComponent implements OnInit {
	stats: OverviewStats = {
		totalRooms: 0,
		activeRooms: 0,
		totalRecordings: 0,
		hasData: false
	};

	constructor(
		private roomService: RoomService,
		private recordingService: RecordingManagerService,
		private navigationService: NavigationService,
		private themeService: ThemeService
	) {}

	async ngOnInit() {
		await this.loadStats();
	}

	private async loadStats() {
		try {
			const [roomsResp, recordingsResp] = await Promise.all([
				this.roomService.listRooms(),
				this.recordingService.listRecordings()
			]);
			const rooms = roomsResp.rooms;
			const recordings = recordingsResp.recordings;
			this.stats = {
				totalRooms: rooms.length,
				activeRooms: rooms.filter((room: MeetRoom) => !room.markedForDeletion).length,
				totalRecordings: recordings.length,
				hasData: rooms.length > 0 || recordings.length > 0
			};
		} catch {
			this.stats = {
				totalRooms: 0,
				activeRooms: 0,
				totalRecordings: 0,
				hasData: false
			};
		}
	}

	async navigateTo(section: 'rooms' | 'rooms/new' | 'recordings' | 'settings' | 'developers') {
		try {
			await this.navigationService.navigateTo(`console/${section}`);
		} catch (error) {
			console.error(`Error navigating to ${section}:`, error);
		}
	}

	async refreshData() {
		await this.loadStats();
	}
}
