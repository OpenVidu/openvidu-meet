import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetUserRole } from '@openvidu-meet/typings';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { AuthService } from '../../../auth/services/auth.service';
import { ConsoleComponent } from './console.component';

describe('ConsoleComponent navigation by user role', () => {
	const navigationOf = async (role: MeetUserRole | undefined) => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: AuthService, useValue: { getUserRole: async () => role } },
				{ provide: TranslateService, useValue: { register: () => {} } }
			]
		});

		const shell = TestBed.runInInjectionContext(() => new ConsoleComponent());
		await shell.ngOnInit();

		return shell.navLinks().map(({ route }) => route);
	};

	it('lists every page, in order, for an admin', async () => {
		expect(await navigationOf(MeetUserRole.ADMIN)).toEqual([
			'overview',
			'rooms',
			'recordings',
			'users',
			'embedded',
			'config'
		]);
	});

	[MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER].forEach((role) => {
		it(`lists rooms and recordings only for a ${role}`, async () => {
			expect(await navigationOf(role)).toEqual(['rooms', 'recordings']);
		});
	});

	it('lists nothing without a role', async () => {
		expect(await navigationOf(undefined)).toEqual([]);
	});
});
