import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { MEET_ENV } from '../../../src/environment.js';
import {
	errorAiAssistantAlreadyStarting,
	errorAiAssistantCannotBeStopped,
	errorCaptionsDisabled,
	errorCaptionsDisabledInDeployment
} from '../../../src/models/error.model.js';
import { AiAssistantService } from '../../../src/services/ai-assistant.service.js';

const ROOM_ID = 'room-1';
const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

class FakeRedisSets {
	readonly sets = new Map<string, Set<string>>();

	async addToSet(key: string, member: string): Promise<void> {
		this.sets.set(key, (this.sets.get(key) ?? new Set()).add(member));
	}

	async removeFromSet(key: string, member: string): Promise<number> {
		return this.sets.get(key)?.delete(member) ? 1 : 0;
	}

	async getCardinality(key: string): Promise<number> {
		return this.sets.get(key)?.size ?? 0;
	}

	async delete(key: string): Promise<number> {
		return this.sets.delete(key) ? 1 : 0;
	}

	members(): string[] {
		return [...this.sets.values()].flatMap((set) => [...set]);
	}
}

class FakeAgents {
	dispatch: { id: string } | null = null;
	created = 0;
	stopped: string[] = [];
	failCreate = false;

	async getAgentDispatch() {
		return this.dispatch;
	}

	async createAgent() {
		if (this.failCreate) throw new Error('LiveKit refused the dispatch');

		this.created++;
		this.dispatch = { id: `AD_${this.created}` };
		return this.dispatch;
	}

	async stopAgent(id: string) {
		this.stopped.push(id);
		this.dispatch = null;
	}
}

describe('AiAssistantService (live captions)', () => {
	const originalCaptions = MEET_ENV.CAPTIONS_ENABLED;
	let redis: FakeRedisSets;
	let agents: FakeAgents;
	let lockFree: boolean;
	let roomCaptions: boolean;
	let service: AiAssistantService;

	beforeEach(() => {
		MEET_ENV.CAPTIONS_ENABLED = 'true';
		redis = new FakeRedisSets();
		agents = new FakeAgents();
		lockFree = true;
		roomCaptions = true;
		const mutex = {
			withRetryLock: async <T>(_key: string, _ttl: number, callback: () => Promise<T>) =>
				lockFree ? callback() : null
		};
		const roomService = { getMeetRoom: async () => ({ config: { captions: { enabled: roomCaptions } } }) };
		service = new AiAssistantService(
			...([noopLogger, roomService, agents, mutex, redis] as unknown as ConstructorParameters<
				typeof AiAssistantService
			>)
		);
	});

	afterEach(() => {
		MEET_ENV.CAPTIONS_ENABLED = originalCaptions;
	});

	it('starts one assistant for the room and shares it with every participant who asks', async () => {
		const first = await service.createLiveCaptionsAssistant(ROOM_ID, 'ana');
		const second = await service.createLiveCaptionsAssistant(ROOM_ID, 'ben');

		expect(first).toEqual({ id: 'AD_1', status: 'active' });
		expect(second).toEqual({ id: 'AD_1', status: 'active' });
		expect(agents.created).toBe(1);
		expect(redis.members().sort()).toEqual(['ana', 'ben']);
	});

	it('stops the assistant only when the last participant using it turns it off', async () => {
		await service.createLiveCaptionsAssistant(ROOM_ID, 'ana');
		await service.createLiveCaptionsAssistant(ROOM_ID, 'ben');

		await service.cancelAssistant('ignored', ROOM_ID, 'ana');
		expect(agents.stopped).toEqual([]);

		await service.cancelAssistant('ignored', ROOM_ID, 'ben');
		expect(agents.stopped).toEqual(['AD_1']);
	});

	it('leaves the assistant running when someone who never turned it on turns it off', async () => {
		await service.createLiveCaptionsAssistant(ROOM_ID, 'ana');

		await service.cancelAssistant('ignored', ROOM_ID, 'stranger');

		expect(agents.stopped).toEqual([]);
		expect(redis.members()).toEqual(['ana']);
	});

	it('leaves an assistant nobody is tracked for alone when someone who never turned it on turns it off', async () => {
		agents.dispatch = { id: 'AD_orphan' };

		await service.cancelAssistant('ignored', ROOM_ID, 'stranger');

		expect(agents.stopped).toEqual([]);
	});

	it('turns captions off for the last participant even when the assistant is already gone', async () => {
		await service.createLiveCaptionsAssistant(ROOM_ID, 'ana');
		agents.dispatch = null;

		await expect(service.cancelAssistant('ignored', ROOM_ID, 'ana')).resolves.toBeUndefined();
		expect(redis.members()).toEqual([]);
		expect(agents.stopped).toEqual([]);
	});

	it('does not count a participant whose assistant could not be started', async () => {
		agents.failCreate = true;

		await expect(service.createLiveCaptionsAssistant(ROOM_ID, 'ana')).rejects.toThrow(
			'LiveKit refused the dispatch'
		);
		expect(redis.members()).toEqual([]);
	});

	it('answers 409 to a start or a stop while another change of the assistant holds the room', async () => {
		lockFree = false;

		await expect(service.createLiveCaptionsAssistant(ROOM_ID, 'ana')).rejects.toEqual(
			errorAiAssistantAlreadyStarting(ROOM_ID)
		);
		await expect(service.cancelAssistant('ignored', ROOM_ID, 'ana')).rejects.toEqual(
			errorAiAssistantCannotBeStopped(ROOM_ID)
		);
		expect(agents.created).toBe(0);
	});

	it('refuses to start captions disabled for the deployment or for the room', async () => {
		MEET_ENV.CAPTIONS_ENABLED = 'false';
		await expect(service.createLiveCaptionsAssistant(ROOM_ID, 'ana')).rejects.toEqual(
			errorCaptionsDisabledInDeployment()
		);

		MEET_ENV.CAPTIONS_ENABLED = 'true';
		roomCaptions = false;
		await expect(service.createLiveCaptionsAssistant(ROOM_ID, 'ana')).rejects.toEqual(
			errorCaptionsDisabled(ROOM_ID)
		);
		expect(agents.created).toBe(0);
	});

	it('forgets a participant who leaves, and everyone when the meeting ends', async () => {
		await service.createLiveCaptionsAssistant(ROOM_ID, 'ana');
		await service.createLiveCaptionsAssistant(ROOM_ID, 'ben');

		await service.cleanupState(ROOM_ID, 'ana');
		expect(redis.members()).toEqual(['ben']);
		expect(agents.stopped).toEqual([]);

		await service.cleanupState(ROOM_ID);
		expect(redis.members()).toEqual([]);
		expect(agents.stopped).toEqual(['AD_1']);
	});

	it('never fails the webhook that triggers a cleanup', async () => {
		await service.createLiveCaptionsAssistant(ROOM_ID, 'ana');
		lockFree = false;

		await expect(service.cleanupState(ROOM_ID, 'ana')).resolves.toBeUndefined();
		await expect(service.cleanupState(ROOM_ID)).resolves.toBeUndefined();
		expect(redis.members()).toEqual(['ana']);
	});
});
