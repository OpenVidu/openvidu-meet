import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MeetAnalytics } from '@openvidu-meet/typings';
import { AnalyticsService } from '../../../../shared/services/analytics.service';
import { NavigationService } from '../../../../shared/services/navigation.service';

@Component({
	selector: 'ov-overview',
	imports: [MatCardModule, MatButtonModule, MatIconModule, MatGridListModule],
	templateUrl: './overview.component.html',
	styleUrl: './overview.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverviewComponent implements OnInit {
	stats = signal<MeetAnalytics>({
		totalRooms: 0,
		activeRooms: 0,
		totalRecordings: 0,
		completeRecordings: 0
	});

	isLoading = signal(true);
	hasData = signal(false);

	private analyticsService: AnalyticsService = inject(AnalyticsService);
	private navigationService: NavigationService = inject(NavigationService);

	constructor() {}

	async ngOnInit() {
		await this.loadStats();
	}

	private async loadStats() {
		this.isLoading.set(true);

		try {
			const stats = await this.analyticsService.getAnalytics();
			this.stats.set(stats);
			this.hasData.set(stats.totalRooms > 0 || stats.totalRecordings > 0);
		} catch {
			console.error('Error loading analytics data');
		} finally {
			this.isLoading.set(false);
		}
	}

	async navigateTo(section: 'rooms' | 'rooms/new' | 'recordings' | 'config' | 'embedded') {
		try {
			await this.navigationService.navigateTo(`/${section}`);
		} catch (error) {
			console.error(`Error navigating to ${section}:`, error);
		}
	}
}
