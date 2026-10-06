import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { LoggerService } from '../../../../shared/services/logger.service';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { ParticipantModel, ParticipantService } from '../../openvidu-components';
import { MeetingHandService } from '../../services/meeting-hand.service';
import { MeetingRaisedHandsStripComponent } from './meeting-raised-hands-strip.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const hand = (isLocal: boolean) => ({ isLocal }) as unknown as ParticipantModel;

/**
 * Lowering every hand reaches the whole queue, the viewer's own hand included, so the strip heads
 * the panel and counts every hand. A queue holding nothing but the viewer's own hand leaves it out.
 */
describe('MeetingRaisedHandsStripComponent', () => {
	let fixture: ComponentFixture<MeetingRaisedHandsStripComponent>;
	let granted: ReturnType<typeof signal<boolean>>;
	let raisedHands: ReturnType<typeof signal<ParticipantModel[]>>;
	let handService: jasmine.SpyObj<MeetingHandService>;

	beforeEach(async () => {
		granted = signal(true);
		raisedHands = signal<ParticipantModel[]>([]);
		handService = jasmine.createSpyObj<MeetingHandService>('MeetingHandService', ['lowerAll']);
		handService.lowerAll.and.resolveTo();

		await TestBed.configureTestingModule({
			imports: [MeetingRaisedHandsStripComponent],
			providers: [
				provideZonelessChangeDetection(),
				{ provide: ComponentFixtureAutoDetect, useValue: false },
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{
					provide: RoomMemberContextService,
					useValue: {
						hasPermission: (permission: keyof MeetRoomMemberPermissions) =>
							permission === 'participantHandLower' && granted()
					}
				},
				{ provide: ParticipantService, useValue: { raisedHands } },
				{ provide: MeetingHandService, useValue: handService }
			]
		}).compileComponents();

		fixture = TestBed.createComponent(MeetingRaisedHandsStripComponent);
	});

	it('stays out of the panel while no hand is raised', () => {
		expect(fixture.componentInstance.visible()).toBeFalse();
	});

	it('stays out of the panel while the only raised hand is the viewer own', () => {
		raisedHands.set([hand(true)]);

		expect(fixture.componentInstance.visible()).toBeFalse();
	});

	it('counts every raised hand, the viewer own included, once another one is up', () => {
		raisedHands.set([hand(true), hand(false)]);

		expect(fixture.componentInstance.visible()).toBeTrue();
		expect(fixture.componentInstance.raisedHandCount()).toBe(2);
	});

	it('stays out of the panel without participantHandLower', () => {
		granted.set(false);
		raisedHands.set([hand(false)]);

		expect(fixture.componentInstance.visible()).toBeFalse();
	});

	it('lowers every hand', async () => {
		raisedHands.set([hand(false)]);

		await fixture.componentInstance.onLowerAllHandsClick();

		expect(handService.lowerAll).toHaveBeenCalledTimes(1);
	});
});
