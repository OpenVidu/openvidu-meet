import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	MEET_ROOM_MEMBER_PERMISSIONS_FIELDS,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomRoles,
	MeetUserDTO,
	MeetUserRole
} from '@openvidu-meet/typings';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { UserService } from '../../../users/services/user.service';
import { MemberFormComponent } from './member-form.component';

const LOCKED_ROOM_PERMISSIONS = ['accessBypassLock', 'waitingParticipantAdmin'];

const permissions = (granted: (key: string) => boolean): MeetRoomMemberPermissions =>
	Object.fromEntries(
		MEET_ROOM_MEMBER_PERMISSIONS_FIELDS.map((key) => [key, granted(key)])
	) as unknown as MeetRoomMemberPermissions;

const roomRoles: MeetRoomRoles = {
	moderator: { permissions: permissions(() => true) },
	speaker: { permissions: permissions((key) => !LOCKED_ROOM_PERMISSIONS.includes(key)) }
};

describe('MemberFormComponent (locked room permissions)', () => {
	let fixture: ComponentFixture<MemberFormComponent>;

	const element = (): HTMLElement => fixture.nativeElement;

	const toggle = (key: string): HTMLButtonElement =>
		element().querySelector(`#member-permission-${key} button[role="switch"]`)!;

	const switchRoleTo = async (role: MeetRoomMemberRole): Promise<void> => {
		fixture.componentInstance.form.controls.role.setValue(role);
		await fixture.whenStable();
		fixture.detectChanges();
	};

	beforeEach(async () => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: UserService, useValue: {} },
				{
					provide: TranslateService,
					useValue: { translationsLoaded: () => true, translate: (key: string) => key }
				}
			]
		});

		fixture = TestBed.createComponent(MemberFormComponent);
		fixture.componentRef.setInput('roomRoles', roomRoles);
		fixture.componentRef.setInput('roomOwner', 'admin');
		fixture.detectChanges();
		await fixture.whenStable();
	});

	it('groups the locked room permissions under their own Locked room group', () => {
		const group = Array.from(element().querySelectorAll('.permission-group')).find((candidate) =>
			candidate.querySelector('.permission-group-label')?.textContent?.includes('GROUPS.LOCKED_ROOM')
		);

		expect(group).toBeDefined();
		expect(Array.from(group!.querySelectorAll('.permission-row')).map((row) => row.id)).toEqual([
			'member-permission-accessBypassLock',
			'member-permission-waitingParticipantAdmin'
		]);
	});

	it('starts the locked room permissions at the base role values: off for a speaker, on for a moderator', async () => {
		const state = () => LOCKED_ROOM_PERMISSIONS.map((key) => toggle(key).getAttribute('aria-checked'));

		expect(state()).toEqual(['false', 'false']);

		await switchRoleTo(MeetRoomMemberRole.MODERATOR);

		expect(state()).toEqual(['true', 'true']);
	});
});

describe('MemberFormComponent (who can be picked and what an edit keeps)', () => {
	let fixture: ComponentFixture<MemberFormComponent>;

	const create = async (inputs: { initialData?: MeetRoomMemberOptions; lockIdentity?: boolean } = {}) => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: UserService, useValue: {} },
				{
					provide: TranslateService,
					useValue: { translationsLoaded: () => true, translate: (key: string) => key }
				}
			]
		});

		fixture = TestBed.createComponent(MemberFormComponent);
		fixture.componentRef.setInput('roomRoles', roomRoles);
		fixture.componentRef.setInput('roomOwner', 'owner');

		for (const [name, value] of Object.entries(inputs)) {
			fixture.componentRef.setInput(name, value);
		}

		fixture.detectChanges();
		await fixture.whenStable();

		return fixture.componentInstance;
	};

	const user = (userId: string, role: MeetUserRole): MeetUserDTO => ({ userId, name: userId, role }) as MeetUserDTO;

	it('shows an admin and the room owner disabled, each with the reason they cannot be added', async () => {
		const form = await create();
		const admin = user('root', MeetUserRole.ADMIN);
		const owner = user('owner', MeetUserRole.ROOM_MANAGER);
		const other = user('ana', MeetUserRole.ROOM_MEMBER);

		expect(form.isUserDisabled(admin)).toBeTrue();
		expect(form.getDisabledReason(admin)).toBe('ROOM_MEMBERS.FORM.DISABLED_REASON_ADMIN');
		expect(form.isUserDisabled(owner)).toBeTrue();
		expect(form.getDisabledReason(owner)).toBe('ROOM_MEMBERS.FORM.DISABLED_REASON_OWNER');
		expect(form.isUserDisabled(other)).toBeFalse();
		expect(form.getDisabledReason(other)).toBeNull();
	});

	it('keeps the type and the name of an edited guest fixed while the role stays editable', async () => {
		const form = await create({
			initialData: { name: 'Ana', baseRole: MeetRoomMemberRole.SPEAKER },
			lockIdentity: true
		});
		const submitted: MeetRoomMemberOptions[] = [];
		form.memberSubmitted.subscribe((options) => submitted.push(options));

		expect(form.form.controls.memberType.disabled).toBeTrue();
		expect(form.form.controls.memberName.disabled).toBeTrue();
		expect(form.form.controls.role.enabled).toBeTrue();

		form.form.controls.role.setValue(MeetRoomMemberRole.MODERATOR);
		form.onSubmit();

		expect(submitted).toEqual([
			{ name: 'Ana', baseRole: MeetRoomMemberRole.MODERATOR, customPermissions: undefined }
		]);
	});

	it('keeps the user of an edited member fixed', async () => {
		const form = await create({
			initialData: { userId: 'ana', baseRole: MeetRoomMemberRole.SPEAKER },
			lockIdentity: true
		});

		expect(form.form.controls.memberType.disabled).toBeTrue();
		expect(form.form.controls.userId.disabled).toBeTrue();
		expect(form.form.controls.role.enabled).toBeTrue();
	});
});
