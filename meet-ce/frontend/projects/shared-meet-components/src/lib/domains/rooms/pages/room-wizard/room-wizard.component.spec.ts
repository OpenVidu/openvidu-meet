import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
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
 * while its `catch` shows a fixed generic message — the user loses all six steps of input with no
 * hint which fields conflicted.
 */
describe('RoomWizardComponent.createRoomAdvance — B5/F7: a rejected submit destroys all wizard input', () => {
	let component: RoomWizardComponent;
	let wizardService: RoomWizardStateService;
	let createRoomSpy: jasmine.Spy;
	let notificationServiceStub: { showSnackbar: jasmine.Spy };
	let navigationServiceStub: {
		navigateToAndInvalidate: jasmine.Spy;
		invalidateCachedRoute: jasmine.Spy;
		redirectTo: jasmine.Spy;
	};

	beforeEach(() => {
		createRoomSpy = jasmine.createSpy('createRoom');
		notificationServiceStub = { showSnackbar: jasmine.createSpy('showSnackbar') };
		navigationServiceStub = {
			navigateToAndInvalidate: jasmine.createSpy('navigateToAndInvalidate').and.resolveTo(undefined),
			invalidateCachedRoute: jasmine.createSpy('invalidateCachedRoute'),
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

		expect(notificationServiceStub.showSnackbar).toHaveBeenCalledWith(
			jasmine.stringMatching(/maxParticipants|second_participant/)
		);
	});
});
