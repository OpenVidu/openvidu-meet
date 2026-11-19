import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RoomMemberService } from '../../../room-members/services/room-member.service';
import { RoomService } from '../../services/room.service';
import { RoomWizardStateService } from '../../services/wizard-state.service';
import { RoomWizardComponent } from './room-wizard.component';

const UNREACHABLE_AUTO_START_MESSAGE =
	"Recording auto-start 'when_second_participant_joins' can never trigger in a room whose " +
	"'maxParticipants' is 1: it requires the room to admit at least 2 participants";

/**
 * B5 / F7 (MEET-BRANCH-AUDIT-FINDINGS.md): nothing client-side stops the wizard from building the
 * exact combination the backend's 422 rejects (`maxParticipants:1` + a second-participant recording
 * trigger), and on that rejection `createRoomAdvance()`'s `finally` resets the wizard unconditionally
 * while its `catch` shows a fixed generic message — the user loses all the wizard input with no
 * hint which fields conflicted.
 */
describe('RoomWizardComponent.createRoomAdvance — B5/F7: a rejected submit destroys all wizard input', () => {
	let component: RoomWizardComponent;
	let wizardService: RoomWizardStateService;
	let createRoomSpy: jasmine.Spy;
	let notificationServiceStub: { showMessage: jasmine.Spy };
	let navigationServiceStub: {
		redirectTo: jasmine.Spy;
	};

	beforeEach(() => {
		createRoomSpy = jasmine.createSpy('createRoom');
		notificationServiceStub = { showMessage: jasmine.createSpy('showMessage') };
		navigationServiceStub = {
			redirectTo: jasmine.createSpy('redirectTo').and.resolveTo(undefined)
		};

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomWizardStateService,
				{ provide: RoomService, useValue: { createRoom: createRoomSpy } },
				{ provide: RoomMemberService, useValue: {} },
				{ provide: NotificationService, useValue: notificationServiceStub },
				{ provide: NavigationService, useValue: navigationServiceStub },
				{ provide: TranslateService, useValue: { translate: (key: string) => key } },
				{
					provide: ActivatedRoute,
					useValue: {
						snapshot: { url: [], paramMap: { get: () => null }, queryParamMap: { get: () => null } }
					}
				}
			]
		});

		component = TestBed.createComponent(RoomWizardComponent).componentInstance;
		wizardService = TestBed.inject(RoomWizardStateService);

		// Seed real wizard input, as if the user had filled several steps in create mode.
		wizardService.initializeWizard(false);
		wizardService.updateStepData({ roomName: 'My room', config: { maxParticipants: 5 } });

		// A rejected HttpClient request resolves to an HttpErrorResponse whose .error is the
		// backend's parsed JSON body — not a plain Error, which createRoomAdvance() would have no
		// specific message to read from.
		createRoomSpy.and.rejectWith(
			new HttpErrorResponse({
				error: { error: 'Room Error', message: UNREACHABLE_AUTO_START_MESSAGE },
				status: 422
			})
		);
	});

	it('keeps the wizard state intact when the create request is rejected', async () => {
		await component.createRoomAdvance();

		expect(wizardService.roomOptions().roomName).toBe('My room');
		expect(wizardService.roomOptions().config?.maxParticipants).toBe(5);
	});

	it('surfaces the specific backend rejection reason instead of a generic message', async () => {
		await component.createRoomAdvance();

		expect(notificationServiceStub.showMessage).toHaveBeenCalledWith(
			jasmine.stringMatching(/maxParticipants|second_participant/)
		);
	});
});

/**
 * The locked room message travels differently in the two requests: creating a room has no `null` to
 * remove a message with, so a cleared one is left out, while updating one sends `null`, which is what
 * removes the stored message.
 */
describe('RoomWizardComponent.createRoomAdvance (locked room message)', () => {
	let component: RoomWizardComponent;
	let wizardService: RoomWizardStateService;
	let roomService: Record<'createRoom' | 'updateRoomConfig' | 'updateRoomAccess' | 'updateRoomRoles', jasmine.Spy>;

	beforeEach(() => {
		roomService = {
			createRoom: jasmine
				.createSpy('createRoom')
				.and.resolveTo({ roomId: 'room-1', access: { user: { url: 'https://meet.example.com/room/room-1' } } }),
			updateRoomConfig: jasmine.createSpy('updateRoomConfig').and.resolveTo({}),
			updateRoomAccess: jasmine.createSpy('updateRoomAccess').and.resolveTo({}),
			updateRoomRoles: jasmine.createSpy('updateRoomRoles').and.resolveTo({})
		};

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomWizardStateService,
				{ provide: RoomService, useValue: roomService },
				{ provide: RoomMemberService, useValue: {} },
				{ provide: NotificationService, useValue: { showMessage: () => {} } },
				{
					provide: NavigationService,
					useValue: { redirectTo: () => Promise.resolve(), navigateTo: () => Promise.resolve() }
				},
				{ provide: TranslateService, useValue: { translate: (key: string) => key } },
				{
					provide: ActivatedRoute,
					useValue: {
						snapshot: { url: [], paramMap: { get: () => null }, queryParamMap: { get: () => null } }
					}
				}
			]
		});

		component = TestBed.createComponent(RoomWizardComponent).componentInstance;
		wizardService = TestBed.inject(RoomWizardStateService);
	});

	it('creates a locked room with its message', async () => {
		wizardService.initializeWizard(false);
		wizardService.updateStepData({
			access: { lock: { enabled: true, message: 'The host will let you in' } }
		});

		await component.createRoomAdvance();

		expect(roomService.createRoom.calls.mostRecent().args[0].access.lock).toEqual({
			enabled: true,
			message: 'The host will let you in'
		});
	});

	it('updates the access of a room with message null when the message was cleared', async () => {
		wizardService.initializeWizard(true, { access: { lock: { enabled: true, message: 'Welcome' } } });
		component.roomId = 'room-1';
		wizardService.updateStepData({ access: { lock: { enabled: true, message: null } } });

		await component.createRoomAdvance();

		expect(roomService.updateRoomAccess.calls.mostRecent().args[1].lock).toEqual({
			enabled: true,
			message: null
		});
	});
});

/** A created room takes the user to its join screen; a member that cannot be added never undoes the room. */
describe('RoomWizardComponent (landing in the created room)', () => {
	let component: RoomWizardComponent;
	let wizardService: RoomWizardStateService;
	let createRoom: jasmine.Spy;
	let createRoomMember: jasmine.Spy;
	let showMessage: jasmine.Spy;
	let redirectTo: jasmine.Spy;

	beforeEach(() => {
		createRoom = jasmine
			.createSpy('createRoom')
			.and.resolveTo({ roomId: 'room-1', access: { user: { url: 'https://meet.example.com/room/room-1' } } });
		createRoomMember = jasmine.createSpy('createRoomMember').and.resolveTo({});
		showMessage = jasmine.createSpy('showMessage');
		redirectTo = jasmine.createSpy('redirectTo').and.resolveTo(undefined);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomWizardStateService,
				{ provide: RoomService, useValue: { createRoom } },
				{ provide: RoomMemberService, useValue: { createRoomMember } },
				{ provide: NotificationService, useValue: { showMessage } },
				{ provide: NavigationService, useValue: { redirectTo, navigateTo: () => Promise.resolve() } },
				{ provide: TranslateService, useValue: { translate: (key: string) => key } },
				{
					provide: ActivatedRoute,
					useValue: {
						snapshot: { url: [], paramMap: { get: () => null }, queryParamMap: { get: () => null } }
					}
				}
			]
		});

		component = TestBed.createComponent(RoomWizardComponent).componentInstance;
		wizardService = TestBed.inject(RoomWizardStateService);
		wizardService.initializeWizard(false);
	});

	it('creates a room from its name alone and opens its join screen', async () => {
		await component.createRoomBasic('Team sync');

		expect(createRoom.calls.mostRecent().args[0]).toEqual({ roomName: 'Team sync' });
		expect(redirectTo).toHaveBeenCalledOnceWith('/room/room-1');
	});

	it('creates the room and warns of the members that could not be added', async () => {
		wizardService.addPendingMember({ userId: 'ana', baseRole: MeetRoomMemberRole.SPEAKER });
		wizardService.addPendingMember({ userId: 'bad_user', baseRole: MeetRoomMemberRole.SPEAKER });
		createRoomMember.and.callFake(async (_roomId: string, member: { userId: string }) => {
			if (member.userId === 'bad_user') throw new Error('Conflict');

			return {};
		});
		spyOn(console, 'warn');

		await component.createRoomAdvance();

		expect(createRoomMember).toHaveBeenCalledTimes(2);
		expect(showMessage).toHaveBeenCalledOnceWith(jasmine.stringMatching(/bad_user/));
		expect(showMessage).not.toHaveBeenCalledWith(jasmine.stringMatching(/ana/));
		expect(redirectTo).toHaveBeenCalledOnceWith('/room/room-1');
	});
});
