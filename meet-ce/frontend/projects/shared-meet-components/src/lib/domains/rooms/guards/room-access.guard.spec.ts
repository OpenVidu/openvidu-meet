import { EnvironmentInjector, provideZonelessChangeDetection, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { MeetUserRole } from '@openvidu-meet/typings';
import { NavigationService } from '../../../shared/services/navigation.service';
import { AuthService } from '../../auth/services/auth.service';
import { RoomService } from '../services/room.service';
import { checkRoomAccessGuard, checkRoomManageGuard } from './room-access.guard';

describe('room access guards', () => {
	let getRoom: jasmine.Spy;
	let role: MeetUserRole | undefined;
	let rooms: UrlTree;

	const run = (guard: typeof checkRoomAccessGuard, roomId: string | null = 'room-1') =>
		runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
			guard({ paramMap: { get: () => roomId } } as unknown as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
		) as Promise<boolean | UrlTree>;

	beforeEach(() => {
		getRoom = jasmine.createSpy('getRoom').and.resolveTo({ roomId: 'room-1', owner: 'manager' });
		role = MeetUserRole.ROOM_MANAGER;
		rooms = new UrlTree();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: RoomService, useValue: { getRoom } },
				{
					provide: AuthService,
					useValue: { getUserRole: async () => role, getUserId: async () => 'manager' }
				},
				{
					provide: NavigationService,
					useValue: { createRedirectionTo: (route: string) => (route === '/rooms' ? rooms : new UrlTree()) }
				}
			]
		});
	});

	describe('checkRoomAccessGuard', () => {
		it('lets in whoever can read the room', async () => {
			expect(await run(checkRoomAccessGuard)).toBeTrue();
		});

		it('redirects to the rooms page when the room is unreadable', async () => {
			getRoom.and.rejectWith(new Error('Forbidden'));

			expect(await run(checkRoomAccessGuard)).toBe(rooms);
		});

		it('redirects to the rooms page when the address names no room', async () => {
			expect(await run(checkRoomAccessGuard, null)).toBe(rooms);
			expect(getRoom).not.toHaveBeenCalled();
		});
	});

	describe('checkRoomManageGuard', () => {
		it('lets an admin in without looking at the room', async () => {
			role = MeetUserRole.ADMIN;

			expect(await run(checkRoomManageGuard)).toBeTrue();
			expect(getRoom).not.toHaveBeenCalled();
		});

		it('lets in the room manager who owns the room', async () => {
			expect(await run(checkRoomManageGuard)).toBeTrue();
			expect(getRoom).toHaveBeenCalledOnceWith('room-1', { fields: ['owner'] });
		});

		it('redirects a room manager who does not own the room to the rooms page', async () => {
			getRoom.and.resolveTo({ owner: 'someone-else' });

			expect(await run(checkRoomManageGuard)).toBe(rooms);
		});

		it('redirects a room member to the rooms page without reading the room', async () => {
			role = MeetUserRole.ROOM_MEMBER;

			expect(await run(checkRoomManageGuard)).toBe(rooms);
			expect(getRoom).not.toHaveBeenCalled();
		});

		it('redirects to the rooms page when the room cannot be read', async () => {
			getRoom.and.rejectWith(new Error('Not found'));

			expect(await run(checkRoomManageGuard)).toBe(rooms);
		});
	});
});
