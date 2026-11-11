import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetRoomOptions } from '@openvidu-meet/typings';
import { TranslateService } from '../../../../../../shared/services/i18n/translate.service';
import { AuthService } from '../../../../../auth/services/auth.service';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';
import { RoomAccessComponent } from './room-access.component';

/**
 * The Room Access step is where a room's waiting room is decided: a switch for `config.lobby.enabled`,
 * a message that only makes sense while it is on, and the two permissions that say who waits and who
 * admits, once per role.
 */
describe('RoomAccessComponent (waiting room)', () => {
	let wizardService: RoomWizardStateService;
	let fixture: ComponentFixture<RoomAccessComponent>;

	const element = (): HTMLElement => fixture.nativeElement;

	const render = async (editMode = false, existingData?: MeetRoomOptions): Promise<void> => {
		wizardService.initializeWizard(editMode, existingData);
		fixture = TestBed.createComponent(RoomAccessComponent);
		await settle();
	};

	const settle = async (): Promise<void> => {
		await fixture.whenStable();
		fixture.detectChanges();
		await fixture.whenStable();
	};

	const lobbySwitch = (): HTMLButtonElement => element().querySelector('#room-access-lobby button[role="switch"]')!;

	const messageField = (): HTMLTextAreaElement | null => element().querySelector('#room-lobby-message');

	const permissionSwitch = (role: 'moderator' | 'speaker', key: string): HTMLButtonElement | null =>
		element().querySelector(`#${role}-permission-${key} button[role="switch"]`);

	const type = async (value: string): Promise<void> => {
		const field = messageField()!;

		field.value = value;
		field.dispatchEvent(new Event('input'));
		await settle();
	};

	const savedLobby = () => wizardService.roomOptions().config?.lobby;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomWizardStateService,
				{ provide: AuthService, useValue: { getUserId: async () => 'admin' } },
				{
					provide: TranslateService,
					useValue: { translationsLoaded: () => true, translate: (key: string) => key }
				}
			]
		});
		wizardService = TestBed.inject(RoomWizardStateService);
	});

	it('starts with the waiting room off and no message field', async () => {
		await render();

		expect(lobbySwitch().getAttribute('aria-checked')).toBe('false');
		expect(messageField()).toBeNull();
		expect(savedLobby()).toEqual({ enabled: false });
	});

	it('names the section, the switch and the message field', async () => {
		await render();
		lobbySwitch().click();
		await settle();

		const text = element().querySelector('#waiting-room-section')!.textContent!;

		for (const key of [
			'ROOMS.WIZARD.ACCESS.WAITING_ROOM',
			'ROOMS.WIZARD.ACCESS.WAITING_ROOM_SUBTITLE',
			'ROOMS.WIZARD.ACCESS.WAITING_ROOM_ENABLED',
			'ROOMS.WIZARD.ACCESS.WAITING_ROOM_ENABLED_DESC',
			'ROOMS.WIZARD.ACCESS.WAITING_ROOM_MESSAGE',
			'ROOMS.WIZARD.ACCESS.WAITING_ROOM_MESSAGE_HINT'
		]) {
			expect(text).withContext(key).toContain(key);
		}
	});

	it('turns the waiting room on and shows the message field only while it is on', async () => {
		await render();

		lobbySwitch().click();
		await settle();

		expect(savedLobby()?.enabled).toBeTrue();
		expect(messageField()).not.toBeNull();

		lobbySwitch().click();
		await settle();

		expect(savedLobby()?.enabled).toBeFalse();
		expect(messageField()).toBeNull();
	});

	it('writes the message into the room options without the whitespace around it', async () => {
		await render();
		lobbySwitch().click();
		await settle();

		await type('  The host will let you in  ');

		expect(savedLobby()).toEqual({ enabled: true, message: 'The host will let you in' });
	});

	it('writes a cleared message as null, which is what removes a stored one on update', async () => {
		await render(true, { config: { lobby: { enabled: true, message: 'Welcome' } } });
		expect(messageField()!.value).toBe('Welcome');

		await type('');

		expect(savedLobby()).toEqual({ enabled: true, message: null });
	});

	it('prefills the switch and the message of the room being edited', async () => {
		await render(true, { config: { lobby: { enabled: true, message: 'Welcome' } } });

		expect(lobbySwitch().getAttribute('aria-checked')).toBe('true');
		expect(messageField()!.value).toBe('Welcome');
	});

	it('flags a message longer than 500 characters and holds the wizard from finishing', async () => {
		await render();
		lobbySwitch().click();
		await settle();

		await type('a'.repeat(500));
		expect(element().querySelector('mat-error')).toBeNull();
		expect(wizardService.getNavigationConfig().disableFinish).toBeFalse();

		await type('a'.repeat(501));
		messageField()!.dispatchEvent(new Event('blur'));
		await settle();
		expect(element().querySelector('mat-error')!.textContent).toContain(
			'ROOMS.WIZARD.ACCESS.WAITING_ROOM_MESSAGE_MAXLENGTH'
		);
		expect(wizardService.getNavigationConfig().disableFinish).toBeTrue();
	});

	it('offers each role the two waiting room permissions, as the room proposes them', async () => {
		await render();

		const granted = (role: 'moderator' | 'speaker') =>
			['lobbyBypass', 'lobbyAdmin'].map((key) => permissionSwitch(role, key)?.getAttribute('aria-checked'));

		expect(granted('moderator')).toEqual(['true', 'true']);
		expect(granted('speaker')).toEqual(['false', 'false']);
		expect(element().querySelector('#moderator-permission-lobbyBypass')!.textContent).toContain(
			'ROOM_MEMBERS.PERMISSIONS.ITEMS.lobbyBypass.LABEL'
		);
	});

	it('sends the waiting room permissions a role is switched to', async () => {
		await render();

		permissionSwitch('speaker', 'lobbyBypass')!.click();
		await settle();

		expect(wizardService.roomOptions().roles?.speaker?.permissions).toEqual(
			jasmine.objectContaining({ lobbyBypass: true, lobbyAdmin: false })
		);
	});

	it('keeps the waiting room permissions usable whether the waiting room is on or off', async () => {
		await render();

		expect(permissionSwitch('speaker', 'lobbyAdmin')!.disabled).toBeFalse();

		lobbySwitch().click();
		await settle();

		expect(permissionSwitch('speaker', 'lobbyAdmin')!.disabled).toBeFalse();
	});
});
