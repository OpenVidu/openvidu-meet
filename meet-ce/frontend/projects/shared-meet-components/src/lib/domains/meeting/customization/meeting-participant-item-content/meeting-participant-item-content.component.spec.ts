import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { LoggerService } from '../../../../shared/services/logger.service';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { ParticipantDisplayProperties, ParticipantModel } from '../../openvidu-components';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingModerationService } from '../../services/meeting-moderation.service';
import { MeetingParticipantItemContentComponent } from './meeting-participant-item-content.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

interface ParticipantStub {
	isLocal: boolean;
	badged: boolean;
	promotedModerator: boolean;
	microphone: boolean;
	camera: boolean;
	screenShare: boolean;
}

function participantWith(state: Partial<ParticipantStub>): ParticipantModel {
	const stub: ParticipantStub = {
		isLocal: false,
		badged: false,
		promotedModerator: false,
		microphone: false,
		camera: false,
		screenShare: false,
		...state
	};

	return {
		sid: 'sid-1',
		identity: 'participant-1',
		isLocal: stub.isLocal,
		hasBadge: () => stub.badged,
		isPromotedModerator: () => stub.promotedModerator,
		isMicrophoneEnabled: stub.microphone,
		isCameraEnabled: stub.camera,
		isScreenShareEnabled: stub.screenShare
	} as unknown as ParticipantModel;
}

/**
 * Which moderation buttons a participant panel item offers. The rules are only expressible here —
 * the API answers a button that should not exist with a 409 the UI merely logs.
 */
describe('MeetingParticipantItemContentComponent', () => {
	let fixture: ComponentFixture<MeetingParticipantItemContentComponent>;
	let granted: Set<keyof MeetRoomMemberPermissions>;

	beforeEach(async () => {
		granted = new Set<keyof MeetRoomMemberPermissions>();

		await TestBed.configureTestingModule({
			imports: [MeetingParticipantItemContentComponent],
			providers: [
				provideZonelessChangeDetection(),
				// The gating is a computed, not a rendering: the template needs the whole meeting UI.
				{ provide: ComponentFixtureAutoDetect, useValue: false },
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{
					provide: RoomMemberContextService,
					useValue: {
						hasPermission: (permission: keyof MeetRoomMemberPermissions) => granted.has(permission)
					}
				},
				{ provide: MeetingContextService, useValue: { roomId: () => 'room-1' } },
				{ provide: MeetingModerationService, useValue: {} }
			]
		}).compileComponents();

		fixture = TestBed.createComponent(MeetingParticipantItemContentComponent);
	});

	function displayPropertiesOf(participant: ParticipantModel): ParticipantDisplayProperties {
		fixture.componentRef.setInput('participant', participant);
		return fixture.componentInstance.displayProperties();
	}

	function grant(...permissions: (keyof MeetRoomMemberPermissions)[]): void {
		permissions.forEach((permission) => granted.add(permission));
	}

	it('moderates nobody without a moderation permission', () => {
		const properties = displayPropertiesOf(participantWith({ microphone: true, camera: true }));

		expect(properties.showModerationControls).toBeFalse();
		expect(properties.showMuteAudioButton).toBeFalse();
		expect(properties.showMuteVideoButton).toBeFalse();
		expect(properties.showStopScreenShareButton).toBeFalse();
	});

	it('never moderates the local participant', () => {
		grant('participantMute', 'participantKick', 'participantPromote');

		const properties = displayPropertiesOf(participantWith({ isLocal: true, microphone: true }));

		expect(properties.showModerationControls).toBeFalse();
		expect(properties.showMuteAudioButton).toBeFalse();
	});

	it('offers a mute for each device that is on, and none for the devices that are off', () => {
		grant('participantMute');

		const properties = displayPropertiesOf(participantWith({ microphone: true, screenShare: true }));

		expect(properties.showMuteAudioButton).toBeTrue();
		expect(properties.showStopScreenShareButton).toBeTrue();
		expect(properties.showMuteVideoButton).toBeFalse();
	});

	// The server answers a mute aimed at a moderator with a 409, and the caller only logs it, so the
	// button must not be there in the first place.
	it('offers no mute for a badged participant', () => {
		grant('participantMute', 'participantKick', 'participantPromote');

		const properties = displayPropertiesOf(
			participantWith({ badged: true, microphone: true, camera: true, screenShare: true })
		);

		expect(properties.showMuteAudioButton).toBeFalse();
		expect(properties.showMuteVideoButton).toBeFalse();
		expect(properties.showStopScreenShareButton).toBeFalse();
		expect(properties.showModerationControls).toBeFalse();
	});

	it('opens the control strip for a participant whose only available action is a mute', () => {
		grant('participantMute');

		const properties = displayPropertiesOf(participantWith({ camera: true }));

		expect(properties.showModerationControls).toBeTrue();
		expect(properties.showKickButton).toBeFalse();
		expect(properties.showMakeModeratorButton).toBeFalse();
	});

	it('keeps kick and demote for a promoted moderator, who is still beyond muting', () => {
		grant('participantMute', 'participantKick', 'participantPromote');

		const properties = displayPropertiesOf(
			participantWith({ badged: true, promotedModerator: true, microphone: true })
		);

		expect(properties.showUnmakeModeratorButton).toBeTrue();
		expect(properties.showKickButton).toBeTrue();
		expect(properties.showMuteAudioButton).toBeFalse();
		expect(properties.showModerationControls).toBeTrue();
	});
});
