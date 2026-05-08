import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MeetAssistantCapabilityName } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { RedisKeyName } from '../../../../src/models/redis.model.js';
import { AiAssistantService } from '../../../../src/services/ai-assistant.service.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { MutexService } from '../../../../src/services/mutex.service.js';
import { RedisService } from '../../../../src/services/redis.service.js';
import { RequestSessionService } from '../../../../src/services/request-session.service.js';
import { expectValidAssistantResponse } from '../../../helpers/assertion-helpers.js';
import {
	cancelAssistant,
	createAssistant,
	deleteAllRooms,
	getFullPath,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';

const ASSISTANTS_PATH = getFullPath(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/ai/assistants`);

/** Stable mock dispatch returned by all LiveKit stubs (unless overridden per test) */
const MOCK_DISPATCH_ID = 'dispatch-test-001';
const MOCK_DISPATCH = { id: MOCK_DISPATCH_ID, agentName: INTERNAL_CONFIG.CAPTIONS_AGENT_NAME };

let app: Express;
let aiAssistantService: AiAssistantService;
let livekitService: LiveKitService;
let mutexService: MutexService;
let redisService: RedisService;
let requestSessionService: RequestSessionService;

describe('AI Assistant API Tests', () => {
	const captionsDefaultValue = MEET_ENV.CAPTIONS_ENABLED;
	let createAgentSpy: jest.SpyInstance;
	// Bypass participantIdentity resolution from token
	beforeAll(async () => {
		app = await startTestServer();
		aiAssistantService = container.get(AiAssistantService);
		livekitService = container.get(LiveKitService);
		mutexService = container.get(MutexService);
		redisService = container.get(RedisService);
		requestSessionService = container.get(RequestSessionService);
		jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue('moderatorTest');
	});

	afterAll(async () => {
		jest.restoreAllMocks();
		await deleteAllRooms();
	});

	describe('Create Live Captions Assistant Tests', () => {
		let roomData: RoomData;

		beforeEach(async () => {
			roomData = await setupSingleRoom(true);

			// Default LiveKit stubs: no dispatch running → creation succeeds
			createAgentSpy = jest.spyOn(livekitService, 'createAgent');
			createAgentSpy.mockResolvedValue(MOCK_DISPATCH as any);
			jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue('moderatorTest2');
		});

		afterEach(async () => {
			jest.restoreAllMocks();
			await deleteAllRooms();
		});

		describe('Happy Path Tests', () => {
			beforeAll(async () => {
				MEET_ENV.CAPTIONS_ENABLED = 'true';
			});

			afterAll(async () => {
				MEET_ENV.CAPTIONS_ENABLED = captionsDefaultValue;
			});

			it('should create a live captions assistant and return id and status active', async () => {
				const response = await createAssistant(roomData.moderatorToken);

				expectValidAssistantResponse(response);
				expect(livekitService.createAgent).toHaveBeenCalledTimes(1);
			});

			it('should reuse existing dispatch and not create a new one when agent is already running', async () => {
				await createAssistant(roomData.speakerToken);
				jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue('moderatorTest3');

				const response = await createAssistant(roomData.moderatorToken);

				expectValidAssistantResponse(response);
				expect(livekitService.createAgent).toHaveBeenCalledTimes(1);
			});

			it('should allow a second participant to enable captions when agent is already running for another participant', async () => {
				// First participant enables — dispatch is created
				await createAssistant(roomData.speakerToken);

				// Now the agent is running; second participant enables
				jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue('moderatorTest4');
				const response = await createAssistant(roomData.moderatorToken);

				expectValidAssistantResponse(response);
				// createAgent should only have been called once (for the first enabler)
				expect(createAgentSpy).toHaveBeenCalledTimes(1);
			});

			it('should allow a participant to re-enable captions after previously disabling them', async () => {
				jest.spyOn(livekitService, 'stopAgent').mockResolvedValue(undefined as any);

				// Enable → disable → re-enable
				await createAssistant(roomData.speakerToken);
				await cancelAssistant(MOCK_DISPATCH_ID, roomData.speakerToken);

				createAgentSpy.mockClear(); // Clear call count from previous enable
				const response = await createAssistant(roomData.speakerToken);

				expectValidAssistantResponse(response);
				expect(createAgentSpy).toHaveBeenCalledTimes(1);
			});
		});

		describe('Captions Configuration Tests', () => {
			afterEach(async () => {
				MEET_ENV.CAPTIONS_ENABLED = captionsDefaultValue;
			});

			it('should return 500 when MEET_CAPTIONS_ENABLED env var is false', async () => {
				MEET_ENV.CAPTIONS_ENABLED = 'false';

				const response = await createAssistant(roomData.speakerToken);
				expect(response.status).toBe(500);
			});

			it('should return 500 when captions are disabled in the room config', async () => {
				const roomWithCaptionsOff = await setupSingleRoom(false, 'CAPTIONS_OFF_ROOM', {
					captions: { enabled: false }
				});

				const response = await createAssistant(roomWithCaptionsOff.speakerToken);

				expect(response.status).toBe(500);
				await deleteAllRooms();
			});
		});

		describe('Request Validation Tests', () => {
			it('should return 422 when the capabilities field is missing from the request body', async () => {
				const response = await createAssistant(roomData.speakerToken, {} as any);

				expect(response.status).toBe(422);
			});

			it('should return 422 when the capabilities array is empty', async () => {
				const response = await createAssistant(roomData.speakerToken, { capabilities: [] });

				expect(response.status).toBe(422);
			});

			it('should return 422 when capabilities contains only unknown/invalid names', async () => {
				const response = await createAssistant(roomData.speakerToken, {
					capabilities: [{ name: 'non_existent_capability' }]
				});

				expect(response.status).toBe(422);
			});

			it('should strip unknown capability names and succeed when at least one valid capability remains', async () => {
				MEET_ENV.CAPTIONS_ENABLED = 'true';

				const response = await createAssistant(roomData.speakerToken, {
					capabilities: [{ name: MeetAssistantCapabilityName.LIVE_CAPTIONS }, { name: 'unknown_capability' }]
				});

				expectValidAssistantResponse(response);
				expect(livekitService.createAgent).toHaveBeenCalledTimes(1);
			});

			it('should deduplicate repeated capability names and treat them as a single capability', async () => {
				MEET_ENV.CAPTIONS_ENABLED = 'true';

				const response = await createAssistant(roomData.speakerToken, {
					capabilities: [
						{ name: MeetAssistantCapabilityName.LIVE_CAPTIONS },
						{ name: MeetAssistantCapabilityName.LIVE_CAPTIONS }
					]
				});

				expectValidAssistantResponse(response);
				// Deduplication → single capability → createAgent called once
				expect(livekitService.createAgent).toHaveBeenCalledTimes(1);
			});

			it('should return 422 when capabilities is not an array', async () => {
				const response = await createAssistant(roomData.speakerToken, {
					capabilities: { name: MeetAssistantCapabilityName.LIVE_CAPTIONS }
				} as any);

				expect(response.status).toBe(422);
			});
		});

		describe('Race Condition Tests', () => {
			beforeAll(async () => {
				MEET_ENV.CAPTIONS_ENABLED = 'true';
			});

			afterAll(async () => {
				MEET_ENV.CAPTIONS_ENABLED = captionsDefaultValue;
			});

			it('should create exactly one agent dispatch when two participants enable captions simultaneously', async () => {
				(livekitService.createAgent as jest.Mock).mockImplementation(async () => MOCK_DISPATCH);

				const [assistant1, assistant2] = await Promise.all([
					aiAssistantService.createLiveCaptionsAssistant(roomData.room.roomId, 'participantA'),
					aiAssistantService.createLiveCaptionsAssistant(roomData.room.roomId, 'participantB')
				]);

				expect(assistant1.status).toBe('active');
				expect(assistant2.status).toBe('active');
				expect(assistant1.id).toBe(MOCK_DISPATCH_ID);
				expect(assistant2.id).toBe(MOCK_DISPATCH_ID);
				// The distributed lock guarantees at most one dispatch is created
				expect(livekitService.createAgent).toHaveBeenCalledTimes(1);
			});

			it('should register the participant using Redis fallback when create lock retries are exhausted', async () => {
				const participantIdentity = 'fallbackParticipant';
				const assistantIdKey = `${RedisKeyName.AI_ASSISTANT_ID}${roomData.room.roomId}:${MeetAssistantCapabilityName.LIVE_CAPTIONS}`;
				const participantStateKey = `${RedisKeyName.AI_ASSISTANT_PARTICIPANT_STATE}${roomData.room.roomId}:${MeetAssistantCapabilityName.LIVE_CAPTIONS}:${participantIdentity}`;

				jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue(participantIdentity);
				await redisService.setIfNotExists(assistantIdKey, MOCK_DISPATCH_ID);
				jest.spyOn(mutexService, 'withRetryLock').mockResolvedValue(null);

				const response = await createAssistant(roomData.speakerToken);

				expectValidAssistantResponse(response);
				expect(response.body.id).toBe(MOCK_DISPATCH_ID);
				expect(livekitService.createAgent).not.toHaveBeenCalled();
				expect(await redisService.exists(participantStateKey)).toBe(true);

				await redisService.delete([assistantIdKey, participantStateKey]);
			});

			it('should not create more than one dispatch when the same participant clicks enable rapidly', async () => {
				(livekitService.createAgent as jest.Mock).mockImplementation(async () => MOCK_DISPATCH);

				const [assistant1, assistant2] = await Promise.all([
					aiAssistantService.createLiveCaptionsAssistant(roomData.room.roomId, 'participantA'),
					aiAssistantService.createLiveCaptionsAssistant(roomData.room.roomId, 'participantA')
				]);

				expect(assistant1.status).toBe('active');
				expect(assistant2.status).toBe('active');
				expect(assistant1.id).toBe(MOCK_DISPATCH_ID);
				expect(assistant2.id).toBe(MOCK_DISPATCH_ID);
				expect(livekitService.createAgent).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe('Cancel Assistant Tests', () => {
		let roomData: RoomData;

		beforeEach(async () => {
			roomData = await setupSingleRoom(true);

			// Default stubs: dispatch exists and can be stopped
			jest.spyOn(livekitService, 'createAgent').mockResolvedValue(MOCK_DISPATCH as any);
			jest.spyOn(livekitService, 'stopAgent').mockResolvedValue(undefined as any);
			jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue('moderatorTest');
		});

		afterEach(async () => {
			jest.restoreAllMocks();
			await deleteAllRooms();
		});

		describe('Happy Path Tests', () => {
			beforeAll(async () => {
				MEET_ENV.CAPTIONS_ENABLED = 'true';
			});

			afterAll(async () => {
				MEET_ENV.CAPTIONS_ENABLED = captionsDefaultValue;
			});

			it('should return 204 and stop the dispatch when the last participant disables captions', async () => {
				await createAssistant(roomData.speakerToken);

				const response = await cancelAssistant(MOCK_DISPATCH_ID, roomData.speakerToken);

				expect(response.status).toBe(204);
				expect(livekitService.stopAgent).toHaveBeenCalledTimes(1);
			});

			it('should return 204 but not stop the dispatch when another participant still has captions enabled', async () => {
				// Two participants enable captions
				await createAssistant(roomData.speakerToken);
				jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue('moderatorTest2');

				await createAssistant(roomData.moderatorToken);

				// Only the first participant disables
				jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue('moderatorTest');

				const response = await cancelAssistant(MOCK_DISPATCH_ID, roomData.speakerToken);

				expect(response.status).toBe(204);
				expect(livekitService.stopAgent).not.toHaveBeenCalled();
			});

			it('should stop the dispatch only after all participants have disabled captions', async () => {
				await createAssistant(roomData.speakerToken);
				jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue('moderatorTest2');

				await createAssistant(roomData.moderatorToken);

				// First participant disables → dispatch still running
				jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue('moderatorTest');
				await cancelAssistant(MOCK_DISPATCH_ID, roomData.speakerToken);
				expect(livekitService.stopAgent).not.toHaveBeenCalled();

				// Second participant disables → dispatch must be stopped
				jest.spyOn(requestSessionService, 'getParticipantIdentity').mockReturnValue('moderatorTest2');

				const response = await cancelAssistant(MOCK_DISPATCH_ID, roomData.moderatorToken);
				expect(response.status).toBe(204);
				expect(livekitService.stopAgent).toHaveBeenCalledTimes(1);
			});

			it('should be idempotent — calling cancel twice for the same participant returns 204 both times', async () => {
				await createAssistant(roomData.speakerToken);

				const res1 = await cancelAssistant(MOCK_DISPATCH_ID, roomData.speakerToken);

				const res2 = await cancelAssistant(MOCK_DISPATCH_ID, roomData.speakerToken);

				expect(res1.status).toBe(204);
				expect(res2.status).toBe(204);
				expect(livekitService.stopAgent).toHaveBeenCalledTimes(1);
			});

			it('should return 204 even when LiveKit stopAgent resolves after the dispatch is already gone', async () => {
				// The service uses Redis as the source of truth, so it will still attempt stopAgent.
				// As long as stopAgent resolves gracefully, cancel remains successful.
				(livekitService.stopAgent as jest.Mock).mockResolvedValue(undefined as any);

				await createAssistant(roomData.speakerToken);
				const response = await cancelAssistant(MOCK_DISPATCH_ID, roomData.speakerToken);

				expect(response.status).toBe(204);
				expect(livekitService.stopAgent).toHaveBeenCalledTimes(1);
			});

			it('should return 204 even when cancel is called without a prior enable by that participant', async () => {
				// Participant never enabled captions — cancel is a no-op
				const response = await cancelAssistant(MOCK_DISPATCH_ID, roomData.speakerToken);

				expect(response.status).toBe(204);
				expect(livekitService.stopAgent).not.toHaveBeenCalled();
			});
		});

		describe('Request Validation Tests', () => {
			it('should return 422 when the assistantId path parameter is only whitespace', async () => {
				// %20 decodes to a space — Zod trims and rejects empty string
				const response = await request(app)
					.delete(`${ASSISTANTS_PATH}/%20`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.speakerToken);

				expect(response.status).toBe(422);
			});
		});

		describe('Race Condition Tests', () => {
			beforeAll(async () => {
				MEET_ENV.CAPTIONS_ENABLED = 'true';
			});

			afterAll(async () => {
				MEET_ENV.CAPTIONS_ENABLED = captionsDefaultValue;
			});

			it('should call stopAgent exactly once when two participants cancel simultaneously', async () => {
				// Both enable captions first
				await aiAssistantService.createLiveCaptionsAssistant(roomData.room.roomId, 'participantA');
				await aiAssistantService.createLiveCaptionsAssistant(roomData.room.roomId, 'participantB');

				// Both cancel at the same time
				await Promise.all([
					aiAssistantService.cancelAssistant(MOCK_DISPATCH_ID, roomData.room.roomId, 'participantA'),
					aiAssistantService.cancelAssistant(MOCK_DISPATCH_ID, roomData.room.roomId, 'participantB')
				]);

				// The distributed lock ensures only one of them executes stopAgent
				expect(livekitService.stopAgent).toHaveBeenCalledTimes(1);
			});
		});
	});
});
