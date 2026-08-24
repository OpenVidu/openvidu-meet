import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { LoggerService } from '../../../../shared/services/logger.service';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingModerationService } from '../../services/meeting-moderation.service';
import { MeetingParticipantsPanelActionsComponent } from './meeting-participants-panel-actions.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

describe('MeetingParticipantsPanelActionsComponent', () => {
	let fixture: ComponentFixture<MeetingParticipantsPanelActionsComponent>;
	let granted: boolean;
	let moderationService: jasmine.SpyObj<MeetingModerationService>;
	let roomId: string | undefined;

	beforeEach(async () => {
		granted = false;
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
					useValue: { hasPermission: (permission: keyof MeetRoomMemberPermissions) => permission === 'participantMute' && granted }
				},
				{ provide: MeetingContextService, useValue: { roomId: () => roomId } },
				{ provide: MeetingModerationService, useValue: moderationService }
			]
		}).compileComponents();

		fixture = TestBed.createComponent(MeetingParticipantsPanelActionsComponent);
	});

	it('offers no mute-all action without the participantMute permission', () => {
		expect(fixture.componentInstance.canMuteAll()).toBeFalse();
	});

	it('offers the mute-all action with the participantMute permission', () => {
		granted = true;

		expect(fixture.componentInstance.canMuteAll()).toBeTrue();
	});

	it('mutes every microphone in the room, leaving cameras and screen shares alone', async () => {
		granted = true;

		await fixture.componentInstance.onMuteAllClick();

		expect(moderationService.muteAllParticipants).toHaveBeenCalledOnceWith('room-1', { audioActive: false });
	});

	it('does nothing without the permission, even if called directly', async () => {
		await fixture.componentInstance.onMuteAllClick();

		expect(moderationService.muteAllParticipants).not.toHaveBeenCalled();
	});

	it('does nothing when the room id is undefined', async () => {
		granted = true;
		roomId = undefined;

		await fixture.componentInstance.onMuteAllClick();

		expect(moderationService.muteAllParticipants).not.toHaveBeenCalled();
	});
});
