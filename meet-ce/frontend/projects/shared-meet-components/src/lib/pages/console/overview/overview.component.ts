import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MeetAnalytics } from '@openvidu-meet/typings';
import { AnalyticsService, NavigationService } from '../../../services';

@Component({
	selector: 'ov-overview',
	imports: [MatCardModule, MatButtonModule, MatIconModule, MatGridListModule],
	templateUrl: './overview.component.html',
	styleUrl: './overview.component.scss'
})
export class OverviewComponent implements OnInit {
	stats: MeetAnalytics = {
		totalRooms: 0,
		activeRooms: 0,
		totalRecordings: 0,
		completeRecordings: 0
	};

	isLoading = true;
	hasData = false;

	constructor(
		private analyticsService: AnalyticsService,
		private navigationService: NavigationService
	) {}

	async ngOnInit() {
		await this.loadStats();
	}

	private async loadStats() {
		this.isLoading = true;

		try {
			this.stats = await this.analyticsService.getAnalytics();
			this.hasData = this.stats.totalRooms > 0 || this.stats.totalRecordings > 0;
		} catch {
			console.error('Error loading analytics data');
		} finally {
			this.isLoading = false;
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
