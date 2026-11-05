import { DOCUMENT, formatDate, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, LOCALE_ID, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { MeetAnalytics } from '@openvidu-meet/typings';
import { distinctUntilChanged, EMPTY, fromEvent, map, startWith, switchMap, timer } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { AnalyticsService } from '../../../../shared/services/analytics.service';
import { TranslateParams } from '../../../../shared/services/i18n/translate.service';
import { NavigationService } from '../../../../shared/services/navigation.service';

export const OVERVIEW_REFRESH_INTERVAL_MS = 30_000;

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

@Component({
	selector: 'ov-overview',
	imports: [
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatGridListModule,
		NgTemplateOutlet,
		RouterLink,
		TranslatePipe
	],
	templateUrl: './overview.component.html',
	styleUrl: './overview.component.scss'
})
export class OverviewComponent {
	private analyticsService: AnalyticsService = inject(AnalyticsService);
	private navigationService: NavigationService = inject(NavigationService);
	private document = inject(DOCUMENT);
	private locale = inject(LOCALE_ID);

	stats = signal<MeetAnalytics | null>(null);
	lastUpdated = signal<Date | null>(null);
	isRefreshing = signal(false);
	refreshFailed = signal(false);

	lastUpdatedTime = computed(() => {
		const readAt = this.lastUpdated();
		return readAt ? formatDate(readAt, 'HH:mm', this.locale) : '';
	});

	isLoading = computed(() => this.stats() === null && !this.refreshFailed());
	hasData = computed(() => {
		const stats = this.stats();
		return stats !== null && (stats.totalRooms > 0 || stats.totalRecordings > 0);
	});

	roomSegments = computed(() => {
		const stats = this.stats();

		return [
			{ key: 'open', count: stats?.openRooms ?? 0, label: 'OVERVIEW.ROOMS_STATUS_OPEN' },
			{ key: 'meeting', count: stats?.activeRooms ?? 0, label: 'OVERVIEW.ROOMS_STATUS_MEETING' },
			{ key: 'closed', count: stats?.closedRooms ?? 0, label: 'OVERVIEW.ROOMS_STATUS_CLOSED' }
		];
	});

	nextExpiringWhen = computed<{ key: string; params: TranslateParams } | null>(() => {
		const next = this.stats()?.nextExpiringRoom;
		const readAt = this.lastUpdated();

		if (!next || !readAt) return null;

		const days = Math.round((startOfDay(new Date(next.autoDeletionDate)) - startOfDay(readAt)) / DAY_MS);

		if (days <= 0) return { key: 'OVERVIEW.EXPIRING_TODAY', params: { days } };

		if (days === 1) return { key: 'OVERVIEW.EXPIRING_TOMORROW', params: { days } };

		return { key: 'OVERVIEW.EXPIRING_IN_DAYS', params: { days } };
	});

	constructor() {
		fromEvent(this.document, 'visibilitychange')
			.pipe(
				startWith(null),
				map(() => this.document.visibilityState === 'visible'),
				distinctUntilChanged(),
				switchMap((visible) => (visible ? timer(0, OVERVIEW_REFRESH_INTERVAL_MS) : EMPTY)),
				takeUntilDestroyed()
			)
			.subscribe(() => void this.refresh());
	}

	async refresh(): Promise<void> {
		if (this.isRefreshing()) return;

		this.isRefreshing.set(true);

		try {
			this.stats.set(await this.analyticsService.getAnalytics());
			this.lastUpdated.set(new Date());
			this.refreshFailed.set(false);
		} catch {
			this.refreshFailed.set(true);
			console.error('Error loading analytics data');
		} finally {
			this.isRefreshing.set(false);
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
