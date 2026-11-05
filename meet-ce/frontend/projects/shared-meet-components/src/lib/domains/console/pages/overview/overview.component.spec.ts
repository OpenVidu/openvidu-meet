import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MeetAnalytics } from '@openvidu-meet/typings';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { AnalyticsService } from '../../../../shared/services/analytics.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { OVERVIEW_REFRESH_INTERVAL_MS, OverviewComponent } from './overview.component';

const NOW = new Date(2026, 10, 5, 14, 32, 45);
const DAY_MS = 24 * 60 * 60 * 1000;

const busy = (overrides: Partial<MeetAnalytics> = {}): MeetAnalytics => ({
	totalRooms: 48,
	activeRooms: 5,
	openRooms: 31,
	closedRooms: 12,
	totalRecordings: 214,
	completeRecordings: 207,
	recordingsInProgress: 2,
	roomsExpiringSoon: 3,
	nextExpiringRoom: { roomId: 'room-1', roomName: 'Weekly sync', autoDeletionDate: NOW.getTime() + 2 * DAY_MS },
	...overrides
});

const quiet = (): MeetAnalytics => {
	const { nextExpiringRoom: _next, ...rest } = busy({
		activeRooms: 0,
		recordingsInProgress: 0,
		roomsExpiringSoon: 0
	});
	return rest;
};

describe('OverviewComponent', () => {
	let fixture: ComponentFixture<OverviewComponent>;
	let getAnalytics: jasmine.Spy<() => Promise<MeetAnalytics>>;
	let navigateTo: jasmine.Spy;
	let visibility: 'visible' | 'hidden';

	const settle = async () => {
		for (let i = 0; i < 6; i++) await Promise.resolve();

		fixture.detectChanges();
	};

	const tick = async (ms: number) => {
		jasmine.clock().tick(ms);
		await settle();
	};

	const setVisibility = async (state: 'visible' | 'hidden') => {
		visibility = state;
		document.dispatchEvent(new Event('visibilitychange'));
		await tick(0);
	};

	const el = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;
	const text = (selector: string) => el(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
	const refreshButton = () => el('#refresh-overview-button') as HTMLButtonElement;

	const open = async (first: MeetAnalytics | Error = busy()) => {
		getAnalytics.and.callFake(() => (first instanceof Error ? Promise.reject(first) : Promise.resolve(first)));
		fixture = TestBed.createComponent(OverviewComponent);
		fixture.detectChanges();
		await tick(0);
	};

	beforeEach(() => {
		jasmine.clock().install();
		jasmine.clock().mockDate(NOW);
		visibility = 'visible';
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
		getAnalytics = jasmine.createSpy('getAnalytics');
		navigateTo = jasmine.createSpy('navigateTo').and.resolveTo();
		spyOn(console, 'error');

		TestBed.configureTestingModule({
			imports: [OverviewComponent],
			providers: [
				provideZonelessChangeDetection(),
				provideRouter([]),
				{ provide: AnalyticsService, useValue: { getAnalytics } },
				{ provide: NavigationService, useValue: { navigateTo } },
				{
					provide: TranslateService,
					useValue: {
						translate: (key: string, params?: Record<string, unknown>) =>
							params && Object.keys(params).length ? `${key} ${JSON.stringify(params)}` : key,
						translationsLoaded: () => 0
					}
				}
			]
		});
	});

	afterEach(() => {
		jasmine.clock().uninstall();
		delete (document as unknown as Record<string, unknown>)['visibilityState'];
	});

	describe('cards', () => {
		it('shows the loading view until the first reading arrives', async () => {
			getAnalytics.and.returnValue(new Promise(() => {}));
			fixture = TestBed.createComponent(OverviewComponent);
			fixture.detectChanges();
			await tick(0);

			expect(el('.loading-state')).not.toBeNull();
			expect(el('.stats-grid')).toBeNull();
		});

		it('shows the rooms by status, the recordings in progress and the expiring rooms', async () => {
			await open();

			expect(text('.rooms-card .stat-number')).toBe('48');
			expect(text('#rooms-status-open')).toContain('31');
			expect(text('#rooms-status-meeting')).toContain('5');
			expect(text('#rooms-status-closed')).toContain('12');
			expect(text('.recordings-card .stat-number')).toBe('214');
			expect(text('#recordings-in-progress')).toContain('2');
			expect(text('#recordings-in-progress')).toContain('OVERVIEW.LIVE');
			expect(text('.expiring-card .stat-number')).toBe('3');
			expect(text('#next-expiring-room')).toContain('Weekly sync');
		});

		it('leaves out the segment of a status with no room', async () => {
			await open(busy({ activeRooms: 0 }));

			expect(fixture.nativeElement.querySelectorAll('.status-segment').length).toBe(2);
			expect(text('#rooms-status-meeting')).toContain('0');
		});

		it('says no recording is in progress and no room is expiring when there is none', async () => {
			await open(quiet());

			expect(text('#recordings-in-progress')).toContain('OVERVIEW.NO_RECORDING_IN_PROGRESS');
			expect(el('#recordings-in-progress .live-badge')).toBeNull();
			expect(text('#next-expiring-room')).toContain('OVERVIEW.EXPIRING_NONE');
		});

		it('links the soonest room to its detail page', async () => {
			await open();

			expect(el('.expiring-next-name')?.getAttribute('href')).toBe('/rooms/room-1');
		});

		it('opens the rooms list from the expiring card', async () => {
			await open();

			el('#view-expiring-rooms-button')!.click();

			expect(navigateTo).toHaveBeenCalledWith('/rooms');
		});

		const when = (days: number, hour: number) => ({
			roomId: 'room-1',
			roomName: 'Weekly sync',
			autoDeletionDate: new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days, hour).getTime()
		});

		it('says today for a room that expires later today', async () => {
			await open(busy({ nextExpiringRoom: when(0, 23) }));

			expect(text('.expiring-next-when')).toBe('OVERVIEW.EXPIRING_TODAY {"days":0}');
		});

		it('says tomorrow for a room that expires the next calendar day', async () => {
			await open(busy({ nextExpiringRoom: when(1, 1) }));

			expect(text('.expiring-next-when')).toBe('OVERVIEW.EXPIRING_TOMORROW {"days":1}');
		});

		it('counts the calendar days for a room that expires later', async () => {
			await open(busy({ nextExpiringRoom: when(5, 9) }));

			expect(text('.expiring-next-when')).toBe('OVERVIEW.EXPIRING_IN_DAYS {"days":5}');
		});

		it('shows the getting-started view when the deployment has no room and no recording', async () => {
			await open(busy({ totalRooms: 0, totalRecordings: 0 }));

			expect(el('#create-first-room-button')).not.toBeNull();
			expect(el('.stats-grid')).toBeNull();
		});
	});

	describe('refresh', () => {
		it('shows the time of the last reading', async () => {
			await open();

			expect(text('#overview-updated-at')).toBe('OVERVIEW.UPDATED_AT {"time":"14:32"}');
		});

		it('requests the figures again every 30 seconds', async () => {
			await open();
			expect(getAnalytics).toHaveBeenCalledTimes(1);

			await tick(OVERVIEW_REFRESH_INTERVAL_MS - 1);
			expect(getAnalytics).toHaveBeenCalledTimes(1);

			getAnalytics.and.resolveTo(busy({ recordingsInProgress: 3 }));
			await tick(1);

			expect(getAnalytics).toHaveBeenCalledTimes(2);
			expect(text('#recordings-in-progress')).toContain('3');
			expect(text('#overview-updated-at')).toBe('OVERVIEW.UPDATED_AT {"time":"14:33"}');
		});

		it('makes no request while the tab is hidden and one as soon as it is visible again', async () => {
			await open();

			await setVisibility('hidden');
			await tick(5 * 60 * 1000);
			expect(getAnalytics).toHaveBeenCalledTimes(1);

			await setVisibility('visible');
			expect(getAnalytics).toHaveBeenCalledTimes(2);
		});

		it('requests the figures at once when Refresh is chosen', async () => {
			await open();

			refreshButton().click();
			await settle();

			expect(getAnalytics).toHaveBeenCalledTimes(2);
		});

		it('keeps the figures on screen and disables Refresh while a request runs', async () => {
			await open();
			getAnalytics.and.returnValue(new Promise(() => {}));

			refreshButton().click();
			await settle();

			expect(el('.stats-grid')).not.toBeNull();
			expect(el('.loading-state')).toBeNull();
			expect(refreshButton().disabled).toBeTrue();

			refreshButton().click();
			await tick(OVERVIEW_REFRESH_INTERVAL_MS);
			expect(getAnalytics).toHaveBeenCalledTimes(2);
		});

		it('keeps the last figures and time and shows a notice when a later request fails', async () => {
			await open();
			getAnalytics.and.rejectWith(new Error('offline'));

			await tick(OVERVIEW_REFRESH_INTERVAL_MS);

			expect(text('#overview-refresh-error')).toContain('OVERVIEW.REFRESH_ERROR');
			expect(text('#overview-refresh-error')).toContain('{"time":"14:32"}');
			expect(text('.rooms-card .stat-number')).toBe('48');
			expect(text('#overview-updated-at')).toBe('OVERVIEW.UPDATED_AT {"time":"14:32"}');

			getAnalytics.and.resolveTo(busy());
			await tick(OVERVIEW_REFRESH_INTERVAL_MS);

			expect(getAnalytics).toHaveBeenCalledTimes(3);
			expect(el('#overview-refresh-error')).toBeNull();
		});

		it('shows the notice and not the getting-started view when the first request fails', async () => {
			await open(new Error('offline'));

			expect(text('#overview-refresh-error')).toContain('OVERVIEW.REFRESH_ERROR');
			expect(el('#create-first-room-button')).toBeNull();
			expect(el('.stats-grid')).toBeNull();
			expect(refreshButton()).not.toBeNull();

			getAnalytics.and.resolveTo(busy());
			refreshButton().click();
			await settle();

			expect(el('#overview-refresh-error')).toBeNull();
			expect(el('.stats-grid')).not.toBeNull();
		});

		it('stops requesting when the page is destroyed', async () => {
			await open();

			fixture.destroy();
			await tick(OVERVIEW_REFRESH_INTERVAL_MS * 2);

			expect(getAnalytics).toHaveBeenCalledTimes(1);
		});
	});
});
