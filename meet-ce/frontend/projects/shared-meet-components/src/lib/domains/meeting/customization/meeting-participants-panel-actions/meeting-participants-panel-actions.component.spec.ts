import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { LoggerService } from '../../../../shared/services/logger.service';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { ParticipantModel, ParticipantService } from '../../openvidu-components';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingModerationService } from '../../services/meeting-moderation.service';
import { MeetingParticipantsPanelActionsComponent } from './meeting-participants-panel-actions.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

interface ParticipantStub {
	badged: boolean;
	microphone: boolean;
	camera: boolean;
	screenShare: boolean;
}

function participantWith(state: Partial<ParticipantStub>): ParticipantModel {
	const stub: ParticipantStub = { badged: false, microphone: false, camera: false, screenShare: false, ...state };

	return {
		sid: 'sid-1',
		hasBadge: () => stub.badged,
		isMicrophoneEnabled: stub.microphone,
		isCameraEnabled: stub.camera,
		isScreenShareEnabled: stub.screenShare
	} as unknown as ParticipantModel;
}

/**
 * Panel-wide moderation. Each button turns one device off across the remote list, and goes inert
 * when nobody it can reach still has that device on — the same rule the rows follow.
 */
describe('MeetingParticipantsPanelActionsComponent', () => {
	let fixture: ComponentFixture<MeetingParticipantsPanelActionsComponent>;
	let granted: ReturnType<typeof signal<boolean>>;
	let remoteParticipants: ReturnType<typeof signal<ParticipantModel[]>>;
	let moderationService: jasmine.SpyObj<MeetingModerationService>;
	let roomId: string | undefined;

	beforeEach(async () => {
		granted = signal(false);
		remoteParticipants = signal<ParticipantModel[]>([]);
		roomId = 'room-1';
		moderationService = jasmine.createSpyObj<MeetingModerationService>('MeetingModerationService', [
			'muteAllParticipants'
		]);
		moderationService.muteAllParticipants.and.resolveTo();

		await TestBed.configureTestingModule({
			imports: [MeetingParticipantsPanelActionsComponent],
			providers: [
				provideZonelessChangeDetection(),
				{ provide: ComponentFixtureAutoDetect, useValue: false },
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{
					provide: RoomMemberContextService,
					useValue: {
						hasPermission: (permission: keyof MeetRoomMemberPermissions) =>
							permission === 'participantMute' && granted()
					}
				},
				{ provide: ParticipantService, useValue: { remoteParticipants } },
				{ provide: MeetingContextService, useValue: { roomId: () => roomId } },
				{ provide: MeetingModerationService, useValue: moderationService }
			]
		}).compileComponents();

		fixture = TestBed.createComponent(MeetingParticipantsPanelActionsComponent);
	});

	function actionById(id: string) {
		const action = fixture.componentInstance.bulkActions().find((candidate) => candidate.id === id);

		if (!action) throw new Error(`No bulk action with id '${id}'`);

		return action;
	}

	it('offers no panel-wide actions without the participantMute permission', () => {
		expect(fixture.componentInstance.canMuteAll()).toBeFalse();
	});

	it('offers panel-wide actions with the participantMute permission', () => {
		granted.set(true);

		expect(fixture.componentInstance.canMuteAll()).toBeTrue();
	});

	it('turns off one device across the room, leaving the other two alone', async () => {
		granted.set(true);
		remoteParticipants.set([participantWith({ camera: true })]);

		await fixture.componentInstance.onBulkActionClick(actionById('mute-all-cameras-btn'));

		expect(moderationService.muteAllParticipants).toHaveBeenCalledOnceWith('room-1', { videoActive: false });
	});

	it('goes inert for a device nobody has on', () => {
		granted.set(true);
		remoteParticipants.set([participantWith({ microphone: true })]);

		expect(actionById('mute-all-participants-btn').enabled).toBeTrue();
		expect(actionById('mute-all-cameras-btn').enabled).toBeFalse();
		expect(actionById('stop-all-screen-shares-btn').enabled).toBeFalse();
	});

	// The API skips moderators, so a room where only they still have a device on has nothing to act on.
	it('ignores badged participants when deciding what is still on', () => {
		granted.set(true);
		remoteParticipants.set([participantWith({ badged: true, microphone: true, camera: true })]);

		expect(actionById('mute-all-participants-btn').enabled).toBeFalse();
		expect(actionById('mute-all-cameras-btn').enabled).toBeFalse();
	});

	it('does nothing without the permission, even if called directly', async () => {
		remoteParticipants.set([participantWith({ microphone: true })]);

		await fixture.componentInstance.onBulkActionClick(actionById('mute-all-participants-btn'));

		expect(moderationService.muteAllParticipants).not.toHaveBeenCalled();
	});

	it('does nothing when the room id is undefined', async () => {
		granted.set(true);
		roomId = undefined;
		remoteParticipants.set([participantWith({ microphone: true })]);

		await fixture.componentInstance.onBulkActionClick(actionById('mute-all-participants-btn'));

		expect(moderationService.muteAllParticipants).not.toHaveBeenCalled();
	});
});
