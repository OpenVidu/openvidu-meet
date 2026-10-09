import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../shared/services/logger.service';
import { MeetingContextService } from './meeting-context.service';
import { MeetingHandService } from './meeting-hand.service';
import { MeetingModerationService } from './meeting-moderation.service';
import { MeetingStateService } from './meeting-state.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const ROOM_ID = 'room1';

describe('MeetingHandService', () => {
	let service: MeetingHandService;
	let moderationService: jasmine.SpyObj<MeetingModerationService>;
	let handRaised: ReturnType<typeof signal<boolean>>;
	let roomId: ReturnType<typeof signal<string | undefined>>;

	beforeEach(() => {
		moderationService = jasmine.createSpyObj<MeetingModerationService>('MeetingModerationService', [
			'updateParticipantHand',
			'lowerAllHands'
		]);
		moderationService.updateParticipantHand.and.resolveTo();
		moderationService.lowerAllHands.and.resolveTo();
		handRaised = signal(false);
		roomId = signal<string | undefined>(ROOM_ID);
		const localParticipant = {
			identity: 'alice',
			get isHandRaised() {
				return handRaised();
			}
		};

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingHandService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: MeetingModerationService, useValue: moderationService },
				{ provide: MeetingContextService, useValue: { roomId } },
				{ provide: MeetingStateService, useValue: { localParticipant: () => localParticipant } }
			]
		});

		service = TestBed.inject(MeetingHandService);
	});

	it('raises and lowers the own hand through the local identity', async () => {
		await service.raise();
		await service.lower();

		expect(moderationService.updateParticipantHand.calls.allArgs()).toEqual([
			[ROOM_ID, 'alice', true],
			[ROOM_ID, 'alice', false]
		]);
	});

	it('toggles according to the hand state the server wrote', async () => {
		handRaised.set(true);

		await service.toggle();

		expect(service.localHandRaised()).toBeTrue();
		expect(moderationService.updateParticipantHand).toHaveBeenCalledOnceWith(ROOM_ID, 'alice', false);
	});

	it('lowers another participant hand by identity, and every hand at once', async () => {
		await service.lower('bob');
		await service.lowerAll();

		expect(moderationService.updateParticipantHand).toHaveBeenCalledOnceWith(ROOM_ID, 'bob', false);
		expect(moderationService.lowerAllHands).toHaveBeenCalledOnceWith(ROOM_ID);
	});

	it('knows which identity is its own', () => {
		expect(service.isOwn()).toBeTrue();
		expect(service.isOwn('alice')).toBeTrue();
		expect(service.isOwn('bob')).toBeFalse();
	});

	it('does nothing outside a meeting', async () => {
		roomId.set(undefined);

		await service.raise();
		await service.lowerAll();

		expect(moderationService.updateParticipantHand).not.toHaveBeenCalled();
		expect(moderationService.lowerAllHands).not.toHaveBeenCalled();
	});
});
