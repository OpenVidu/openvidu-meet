import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';
import { Router } from '@angular/router';
import { Observable, from, combineLatest, map, catchError, of } from 'rxjs';

import { RoomService } from '../../../services/room/room.service';
import { HttpService } from '../../../services/http/http.service';
import { MeetRoom } from '../../../typings/ce/room';
import { MeetRecordingInfo } from '../../../typings/ce/recording.model';

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
	private roomService = inject(RoomService);
	private httpService = inject(HttpService);
	private router = inject(Router);

	stats$: Observable<OverviewStats> = of({
		totalRooms: 0,
		activeRooms: 0,
		totalRecordings: 0,
		hasData: false
	});

	ngOnInit() {
		this.loadStats();
	}

	private loadStats() {
		const rooms$ = from(this.roomService.listRooms()).pipe(
			map((response) => response.rooms),
			catchError(() => of([]))
		);

		const recordings$ = from(this.httpService.getRecordings()).pipe(
			map((response) => response.recordings),
			catchError(() => of([]))
		);

		this.stats$ = combineLatest([rooms$, recordings$]).pipe(
			map(([rooms, recordings]: [MeetRoom[], MeetRecordingInfo[]]) => {
				const totalRooms = rooms.length;
				const activeRooms = rooms.filter((room: MeetRoom) => !room.markedForDeletion).length;
				const totalRecordings = recordings.length;
				const hasData = totalRooms > 0 || totalRecordings > 0;

				return {
					totalRooms,
					activeRooms,
					totalRecordings,
					hasData
				};
			})
		);
	}

	createRoom() {
		this.router.navigate(['/console/rooms/create']);
	}

	viewRooms() {
		this.router.navigate(['/console/rooms']);
	}

	viewRecordings() {
		this.router.navigate(['/console/recordings']);
	}

	refreshData() {
		this.loadStats();
	}
}
