import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '../../services/i18n/translate.service';
import { NotificationService } from '../../services/notification.service';
import { NotificationsComponent } from './notifications.component';

describe('NotificationsComponent', () => {
	let fixture: ComponentFixture<NotificationsComponent>;
	let notificationService: NotificationService;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [NotificationsComponent],
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: TranslateService,
					useValue: { translate: (key: string) => `t:${key}`, translationsLoaded: signal(0) }
				}
			]
		}).compileComponents();

		notificationService = TestBed.inject(NotificationService);
		fixture = TestBed.createComponent(NotificationsComponent);
	});

	async function render(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
	}

	const buttons = (): HTMLButtonElement[] =>
		Array.from(fixture.nativeElement.querySelectorAll('.notification-action'));

	it('shows the avatars of whom it is about in place of the glyph, stacked from two', async () => {
		notificationService.showNotification({
			kind: 'waiting-room-knock',
			icon: 'hourglass_top',
			avatars: [
				{ name: 'zoe', color: 'rgb(255, 221, 153)' },
				{ name: 'James', color: 'rgb(153, 214, 255)' }
			],
			message: 'Zoe and James',
			placement: 'pinned'
		});
		await render();

		const avatars: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.notification-avatar'));
		expect(avatars.map((avatar) => avatar.textContent!.trim())).toEqual(['Z', 'J']);
		expect(avatars[0].style.backgroundColor).toBe('rgb(255, 221, 153)');
		expect(fixture.nativeElement.querySelector('.notification-avatars.stacked')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.notification-icon')).toBeNull();
	});

	it('offers a second answer before the first, each running its own action and taking the notification away', async () => {
		const deny = jasmine.createSpy('deny');
		const admit = jasmine.createSpy('admit');
		notificationService.showNotification({
			kind: 'waiting-room-knock',
			icon: 'hourglass_top',
			message: 'Wants to join',
			placement: 'pinned',
			secondaryAction: { label: { key: 'DENY' }, run: deny },
			action: { label: 'Admit', run: admit }
		});
		await render();

		expect(buttons().map((button) => button.textContent!.trim())).toEqual(['t:DENY', 'Admit']);
		expect(buttons()[0].classList).toContain('secondary');

		buttons()[0].click();
		await render();

		expect(deny).toHaveBeenCalledTimes(1);
		expect(admit).not.toHaveBeenCalled();
		expect(notificationService.notifications()).toEqual([]);
	});
});
