import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetReaction } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';
import { REACTION_COOLDOWN_MS, REACTION_LIFETIME_MS } from '../openvidu-components/models/reaction.model';
import { MeetingContextService } from './meeting-context.service';
import { MeetingReactionsService } from './meeting-reactions.service';
import { MeetingStateService } from './meeting-state.service';

const ROOM_ID = 'room1';

describe('MeetingReactionsService', () => {
	let service: MeetingReactionsService;
	let httpService: jasmine.SpyObj<HttpService>;

	beforeEach(() => {
		jasmine.clock().install();
		jasmine.clock().mockDate(new Date(2026, 9, 9, 12, 0, 0));
		httpService = jasmine.createSpyObj<HttpService>('HttpService', ['postRequest']);
		httpService.postRequest.and.resolveTo();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingReactionsService,
				{ provide: HttpService, useValue: httpService },
				{ provide: MeetingContextService, useValue: { roomId: signal(ROOM_ID) } },
				{ provide: MeetingStateService, useValue: { localParticipant: () => ({ identity: 'alice' }) } }
			]
		});

		service = TestBed.inject(MeetingReactionsService);
	});

	afterEach(() => {
		service.clear();
		jasmine.clock().uninstall();
	});

	/** Lets the sending loop run what the resolved promises and the elapsed time allow. */
	async function settle(): Promise<void> {
		for (let i = 0; i < 10; i++) await Promise.resolve();
	}

	it('sends the reaction to the server, which relays it to everyone', () => {
		void service.send(MeetReaction.CLAPPING_HANDS);

		expect(httpService.postRequest).toHaveBeenCalledOnceWith(`internal-api/v1/meetings/${ROOM_ID}/reactions`, {
			reaction: MeetReaction.CLAPPING_HANDS
		});
	});

	it('shows the local reaction the moment it is picked, before the server answers', () => {
		httpService.postRequest.and.returnValue(new Promise<void>(() => {}) as never);

		void service.send(MeetReaction.CLAPPING_HANDS);

		expect(service.localReaction()?.reaction).toBe(MeetReaction.CLAPPING_HANDS);
	});

	it('sends only the last of the picks made within a second, once that second ends', async () => {
		void service.send(MeetReaction.THUMBS_UP);
		void service.send(MeetReaction.GRINNING_FACE);
		void service.send(MeetReaction.RED_HEART);

		expect(service.localReaction()?.reaction).toBe(MeetReaction.RED_HEART);
		expect(httpService.postRequest).toHaveBeenCalledTimes(1);

		jasmine.clock().tick(REACTION_COOLDOWN_MS - 1);
		await settle();
		expect(httpService.postRequest).toHaveBeenCalledTimes(1);

		jasmine.clock().tick(1);
		await settle();
		expect(httpService.postRequest).toHaveBeenCalledTimes(2);
		expect(httpService.postRequest.calls.mostRecent().args[1]).toEqual({ reaction: MeetReaction.RED_HEART });
	});

	it('waits for the server before sending the next pick, however long it takes', async () => {
		let deliver!: () => void;
		httpService.postRequest.and.returnValue(new Promise<void>((resolve) => (deliver = resolve)) as never);

		void service.send(MeetReaction.THUMBS_UP);
		void service.send(MeetReaction.RED_HEART);
		jasmine.clock().tick(REACTION_COOLDOWN_MS * 3);
		await settle();
		expect(httpService.postRequest).toHaveBeenCalledTimes(1);

		httpService.postRequest.and.resolveTo();
		deliver();
		await settle();
		expect(httpService.postRequest).toHaveBeenCalledTimes(2);
	});

	it('takes a reaction the server rejects off screen', async () => {
		httpService.postRequest.and.rejectWith(new Error('403'));

		void service.send(MeetReaction.CLAPPING_HANDS);
		await settle();

		expect(service.localReaction()).toBeUndefined();
	});

	it('keeps the clock of the local reaction when the server relays it back', () => {
		void service.send(MeetReaction.CLAPPING_HANDS);
		const shownAt = service.localReaction()?.shownAt;

		jasmine.clock().tick(500);
		service.receive('alice', MeetReaction.CLAPPING_HANDS);

		expect(service.localReaction()?.shownAt).toBe(shownAt);
	});

	it('sends no pick left waiting once the local participant leaves', async () => {
		void service.send(MeetReaction.THUMBS_UP);
		void service.send(MeetReaction.RED_HEART);
		service.clear();

		jasmine.clock().tick(REACTION_COOLDOWN_MS);
		await settle();

		expect(httpService.postRequest).toHaveBeenCalledTimes(1);
	});

	it('shows a reaction for its lifetime only', () => {
		service.receive('bob', MeetReaction.GRINNING_FACE);

		jasmine.clock().tick(REACTION_LIFETIME_MS - 1);
		expect(service.live().get('bob')?.reaction).toBe(MeetReaction.GRINNING_FACE);

		jasmine.clock().tick(1);
		expect(service.live().has('bob')).toBeFalse();
	});

	it('replaces the reaction of the same participant and starts its clock over', () => {
		service.receive('bob', MeetReaction.GRINNING_FACE);
		jasmine.clock().tick(REACTION_LIFETIME_MS / 2);
		service.receive('bob', MeetReaction.SLIGHTLY_FROWNING_FACE);

		jasmine.clock().tick(REACTION_LIFETIME_MS - 1);
		expect(service.live().get('bob')?.reaction).toBe(MeetReaction.SLIGHTLY_FROWNING_FACE);
		expect(service.live().size).toBe(1);

		jasmine.clock().tick(1);
		expect(service.live().size).toBe(0);
	});

	it('wears the local participant reaction separately', () => {
		service.receive('bob', MeetReaction.GRINNING_FACE);
		expect(service.localReaction()).toBeUndefined();

		void service.send(MeetReaction.RED_HEART);
		expect(service.localReaction()?.reaction).toBe(MeetReaction.RED_HEART);
	});

	it('counts the reactions on screen, most shown first and in the picker order on a tie', () => {
		service.receive('bob', MeetReaction.CONFUSED_FACE);
		service.receive('carol', MeetReaction.THUMBS_UP);
		service.receive('dave', MeetReaction.CONFUSED_FACE);
		service.receive('erin', MeetReaction.CLAPPING_HANDS);

		expect(service.counts()).toEqual([
			{ reaction: MeetReaction.CONFUSED_FACE, count: 2 },
			{ reaction: MeetReaction.THUMBS_UP, count: 1 },
			{ reaction: MeetReaction.CLAPPING_HANDS, count: 1 }
		]);
	});

	it('takes the reaction of a participant who leaves off screen at once', () => {
		service.receive('bob', MeetReaction.GRINNING_FACE);
		service.forget('bob');

		expect(service.live().has('bob')).toBeFalse();
		expect(service.counts()).toEqual([]);
	});

	it('clears every reaction once the local participant leaves', () => {
		service.receive('bob', MeetReaction.GRINNING_FACE);
		service.receive('carol', MeetReaction.SLIGHTLY_FROWNING_FACE);
		service.clear();

		expect(service.live().size).toBe(0);
	});
});
