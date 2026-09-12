import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { MeetParticipantMuteOptions, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
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
 * What a participant panel item lets a moderator reach. The rules are only expressible here — the
 * API answers an action that should not have been offered with a 409 the UI merely logs.
 *
 * Which of the three devices are actually live is deliberately not decided here: the row owns that,
 * because a device that is off can never be turned back on by anyone.
 */
describe('MeetingParticipantItemContentComponent', () => {
	let fixture: ComponentFixture<MeetingParticipantItemContentComponent>;
	let granted: Set<keyof MeetRoomMemberPermissions>;
	let muteParticipant: MeetingModerationService['muteParticipant'];

	beforeEach(async () => {
		granted = new Set<keyof MeetRoomMemberPermissions>();
		muteParticipant = () => Promise.resolve();

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
				{
					provide: MeetingModerationService,
					useValue: {
						muteParticipant: (roomId: string, identity: string, media: MeetParticipantMuteOptions) =>
							muteParticipant(roomId, identity, media)
					}
				}
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
		expect(properties.canMuteMedia).toBeFalse();
	});

	it('never moderates the local participant', () => {
		grant('participantMute', 'participantKick', 'participantPromote');

		const properties = displayPropertiesOf(participantWith({ isLocal: true, microphone: true }));

		expect(properties.showModerationControls).toBeFalse();
		expect(properties.canMuteMedia).toBeFalse();
	});

	// The permission is about the person, not about what they happen to be doing right now: a row
	// whose devices are all off still grants it, and simply has nothing to act on.
	it('grants muting whatever the participant currently has switched on', () => {
		grant('participantMute');

		expect(displayPropertiesOf(participantWith({ microphone: true, screenShare: true })).canMuteMedia).toBeTrue();
		expect(displayPropertiesOf(participantWith({})).canMuteMedia).toBeTrue();
	});

	// The server answers a mute aimed at a moderator with a 409, and the caller only logs it, so the
	// buttons must never come alive in the first place.
	it('grants no muting over a badged participant', () => {
		grant('participantMute', 'participantKick', 'participantPromote');

		const properties = displayPropertiesOf(
			participantWith({ badged: true, microphone: true, camera: true, screenShare: true })
		);

		expect(properties.canMuteMedia).toBeFalse();
		expect(properties.showModerationControls).toBeFalse();
	});

	// Muting lives in the row itself, so it alone opens no menu section.
	it('opens no menu section for a participant who can only be muted', () => {
		grant('participantMute');

		const properties = displayPropertiesOf(participantWith({ camera: true }));

		expect(properties.canMuteMedia).toBeTrue();
		expect(properties.showModerationControls).toBeFalse();
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
		expect(properties.canMuteMedia).toBeFalse();
		expect(properties.showModerationControls).toBeTrue();
	});

	describe('device buttons', () => {
		let muted: MeetParticipantMuteOptions[];

		beforeEach(() => {
			muted = [];

			muteParticipant = (_roomId, _identity, media) => {
				muted.push(media);
				return Promise.resolve();
			};

			grant('participantMute');
		});

		it('asks the API to turn off exactly the device that was activated', async () => {
			displayPropertiesOf(participantWith({ microphone: true, camera: true, screenShare: true }));

			await fixture.componentInstance.onMediaMuteRequested('audio');
			await fixture.componentInstance.onMediaMuteRequested('video');
			await fixture.componentInstance.onMediaMuteRequested('screenShare');

			expect(muted).toEqual([{ audioActive: false }, { videoActive: false }, { screenShareActive: false }]);
		});
	});
});
