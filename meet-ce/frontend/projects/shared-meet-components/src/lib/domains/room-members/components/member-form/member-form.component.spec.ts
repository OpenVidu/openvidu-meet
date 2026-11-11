import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	MEET_ROOM_MEMBER_PERMISSIONS_FIELDS,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomRoles
} from '@openvidu-meet/typings';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { UserService } from '../../../users/services/user.service';
import { MemberFormComponent } from './member-form.component';

const WAITING_ROOM_PERMISSIONS = ['waitingRoomBypass', 'waitingRoomAdmin'];

const permissions = (granted: (key: string) => boolean): MeetRoomMemberPermissions =>
	Object.fromEntries(
		MEET_ROOM_MEMBER_PERMISSIONS_FIELDS.map((key) => [key, granted(key)])
	) as unknown as MeetRoomMemberPermissions;

const roomRoles: MeetRoomRoles = {
	moderator: { permissions: permissions(() => true) },
	speaker: { permissions: permissions((key) => !WAITING_ROOM_PERMISSIONS.includes(key)) }
};

describe('MemberFormComponent (waiting room permissions)', () => {
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

	it('groups the waiting room permissions under their own Waiting room group', () => {
		const group = Array.from(element().querySelectorAll('.permission-group')).find((candidate) =>
			candidate.querySelector('.permission-group-label')?.textContent?.includes('GROUPS.WAITING_ROOM')
		);

		expect(group).toBeDefined();
		expect(Array.from(group!.querySelectorAll('.permission-row')).map((row) => row.id)).toEqual([
			'member-permission-waitingRoomBypass',
			'member-permission-waitingRoomAdmin'
		]);
	});

	it('starts the waiting room permissions at the base role values: off for a speaker, on for a moderator', async () => {
		const state = () => WAITING_ROOM_PERMISSIONS.map((key) => toggle(key).getAttribute('aria-checked'));

		expect(state()).toEqual(['false', 'false']);

		await switchRoleTo(MeetRoomMemberRole.MODERATOR);

		expect(state()).toEqual(['true', 'true']);
	});
});
