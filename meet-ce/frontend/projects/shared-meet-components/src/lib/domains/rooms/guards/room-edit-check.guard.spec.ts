import { EnvironmentInjector, provideZonelessChangeDetection, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RoomService } from '../services/room.service';
import { checkEditableRoomGuard } from './room-edit-check.guard';

describe('checkEditableRoomGuard', () => {
	let getRoom: jasmine.Spy;
	let navigateTo: jasmine.Spy;

	const runGuard = (roomId: string | null = 'room-1') =>
		runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
			checkEditableRoomGuard(
				{ paramMap: { get: () => roomId } } as unknown as ActivatedRouteSnapshot,
				{} as RouterStateSnapshot
			)
		) as Promise<boolean>;

	beforeEach(() => {
		getRoom = jasmine.createSpy('getRoom').and.resolveTo({ status: MeetRoomStatus.OPEN });
		navigateTo = jasmine.createSpy('navigateTo').and.resolveTo(undefined);
		spyOn(console, 'warn');
		spyOn(console, 'error');

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: RoomService, useValue: { getRoom } },
				{ provide: NavigationService, useValue: { navigateTo } }
			]
		});
	});

	it('lets the room be edited while it has no active meeting', async () => {
		expect(await runGuard()).toBeTrue();

		expect(getRoom).toHaveBeenCalledOnceWith('room-1', { fields: ['status'] });
		expect(navigateTo).not.toHaveBeenCalled();
	});

	it('redirects to the rooms page while the room has an active meeting', async () => {
		getRoom.and.resolveTo({ status: MeetRoomStatus.ACTIVE_MEETING });

		expect(await runGuard()).toBeFalse();

		expect(navigateTo).toHaveBeenCalledOnceWith('/rooms');
	});

	it('redirects to the rooms page when the room cannot be read', async () => {
		getRoom.and.rejectWith(new Error('Forbidden'));

		expect(await runGuard()).toBeFalse();

		expect(navigateTo).toHaveBeenCalledOnceWith('/rooms');
	});

	it('redirects to the rooms page when the address names no room', async () => {
		expect(await runGuard(null)).toBeFalse();

		expect(getRoom).not.toHaveBeenCalled();
		expect(navigateTo).toHaveBeenCalledOnceWith('/rooms');
	});
});
