import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetRoomOptions } from '@openvidu-meet/typings';
import { TranslateService } from '../../../../../../shared/services/i18n/translate.service';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';
import { MeetingConfigComponent } from './meeting-config.component';

/**
 * The Meeting step's "Save the room's chat" switch is bound to `config.chat.persist`. It follows the
 * chat switch and end-to-end encryption, which saves nothing, and gets its value back whenever
 * encryption goes off again, whichever step turned it off.
 */
describe('MeetingConfigComponent (saving the room chat)', () => {
	let wizardService: RoomWizardStateService;
	let fixture: ComponentFixture<MeetingConfigComponent>;

	const element = (): HTMLElement => fixture.nativeElement;

	const settle = async (): Promise<void> => {
		await fixture.whenStable();
		fixture.detectChanges();
		await fixture.whenStable();
	};

	const openMeetingStep = async (): Promise<void> => {
		fixture?.destroy();
		fixture = TestBed.createComponent(MeetingConfigComponent);
		await settle();
	};

	const render = async (editMode = false, existingData?: MeetRoomOptions): Promise<void> => {
		wizardService.initializeWizard(editMode, existingData);
		await openMeetingStep();
	};

	const toggle = (row: string): HTMLButtonElement => element().querySelector(`#${row} button[role="switch"]`)!;

	const persistSwitch = () => toggle('room-feature-chat-persist');

	const press = async (row: string): Promise<void> => {
		toggle(row).click();
		await settle();
	};

	const savedPersist = () => wizardService.roomOptions().config?.chat?.persist;

	const expectPersist = (checked: boolean, enabled: boolean) => {
		expect(persistSwitch().getAttribute('aria-checked')).withContext('on').toBe(String(checked));
		expect(persistSwitch().disabled).withContext('disabled').toBe(!enabled);
		expect(savedPersist()).withContext('saved').toBe(checked);
	};

	// The Recording step is another page: the Meeting step is opened again afterwards.
	const allowRecordingInRecordingStep = async (enabled: boolean): Promise<void> => {
		wizardService.getStepById(WizardStepId.RECORDING)!.formGroup.controls.recordingEnabled.setValue(enabled);
		wizardService.setFeatureEnabled('recording', enabled);
		await openMeetingStep();
	};

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomWizardStateService,
				{
					provide: TranslateService,
					useValue: { translationsLoaded: () => true, translate: (key: string) => key }
				}
			]
		});
		wizardService = TestBed.inject(RoomWizardStateService);
	});

	it('starts on in a new room', async () => {
		await render();

		expectPersist(true, true);
	});

	it('is disabled and keeps its value while chat is off, and enabled again when chat is on', async () => {
		await render();

		await press('room-feature-chat');
		expectPersist(true, false);

		await press('room-feature-chat');
		expectPersist(true, true);
	});

	it('is disabled and off while encryption is on, and the restrictions say chat is not saved', async () => {
		await render();

		await press('room-feature-e2ee');

		expectPersist(false, false);
		expect(element().querySelector('#e2ee-restriction-chat-not-saved')!.textContent).toContain(
			'ROOMS.WIZARD.MEETING.E2EE_RESTRICTION_CHAT_BOLD'
		);
	});

	it('shows no chat restriction while encryption is off', async () => {
		await render();

		expect(element().querySelector('#e2ee-restriction-chat-not-saved')).toBeNull();
	});

	it('is enabled and on again when encryption is turned off from this step', async () => {
		await render();

		await press('room-feature-e2ee');
		await press('room-feature-e2ee');

		expectPersist(true, true);
	});

	it('stays off when it was off before encryption was turned on and off', async () => {
		await render();
		await press('room-feature-chat-persist');

		await press('room-feature-e2ee');
		await press('room-feature-e2ee');

		expectPersist(false, true);
	});

	it('keeps the value it had with chat off while encryption goes on and off', async () => {
		await render();
		await press('room-feature-chat');

		await press('room-feature-e2ee');
		expectPersist(false, false);

		await press('room-feature-e2ee');
		expectPersist(true, false);
	});

	it('is enabled and on again when allowing recording turns encryption off', async () => {
		await render();
		await press('room-feature-e2ee');

		await allowRecordingInRecordingStep(true);

		expect(wizardService.isE2EEEnabled()).toBeFalse();
		expectPersist(true, true);
	});

	it('is disabled and off when disallowing recording turns encryption back on', async () => {
		await render();
		await press('room-feature-e2ee');
		await allowRecordingInRecordingStep(true);

		await allowRecordingInRecordingStep(false);

		expect(wizardService.isE2EEEnabled()).toBeTrue();
		expectPersist(false, false);
	});

	it('shows the saved setting of an edited room', async () => {
		await render(true, { roomName: 'Existing room', config: { chat: { enabled: true, persist: false } } });

		expectPersist(false, true);
	});
});
