import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetRecordingAudioCodec,
	MeetRecordingEncodingOptions,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout,
	MeetRecordingVideoCodec,
	MeetRoom
} from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { setInternalConfig } from '../../../../src/config/internal-config.js';
import { errorRoomNotFound } from '../../../../src/models/error.model.js';
import { RecordingRepository } from '../../../../src/repositories/recording.repository.js';
import {
	expectValidationError,
	expectValidStartRecordingResponse,
	expectValidStopRecordingResponse
} from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	joinFakeParticipant,
	startRecording,
	startTestServer,
	stopAllRecordings,
	stopRecording
} from '../../../helpers/request-helpers.js';
import { setupMultiRoomTestContext } from '../../../helpers/test-scenarios.js';
import { TestContext } from '../../../interfaces/scenarios.js';

describe('Recording API Tests', () => {
	let context: TestContext | null = null;
	let room: MeetRoom;

	beforeAll(async () => {
		await startTestServer();
		await deleteAllRecordings();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Start Recording Tests', () => {
		beforeAll(async () => {
			// Create a room and join a participant
			context = await setupMultiRoomTestContext(1, true);
			({ room } = context.getRoomByIndex(0)!);
		});

		afterAll(async () => {
			await disconnectFakeParticipants();
			await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
			context = null;
		});

		it('should return 201 with proper response and location header when recording starts successfully', async () => {
			const response = await startRecording(room.roomId);
			const recordingId = response.body.recordingId;
			expectValidStartRecordingResponse(response, room.roomId, room.roomName);

			const stopResponse = await stopRecording(recordingId);
			expectValidStopRecordingResponse(stopResponse, recordingId, room.roomId, room.roomName);
		});

		it('should create secrets when recording starts', async () => {
			const response = await startRecording(room.roomId);
			const recordingId = response.body.recordingId;
			expectValidStartRecordingResponse(response, room.roomId, room.roomName);

			const recordingRepository = container.get(RecordingRepository);

			const recSecrets = await recordingRepository.findAccessSecretsByRecordingId(recordingId);
			expect(recSecrets).toBeDefined();
			expect(recSecrets?.publicAccessSecret).toBeDefined();
			expect(recSecrets?.privateAccessSecret).toBeDefined();

			const stopResponse = await stopRecording(recordingId);
			expectValidStopRecordingResponse(stopResponse, recordingId, room.roomId, room.roomName);
		});

		it('should successfully start recording, stop it, and start again (sequential operations)', async () => {
			const firstStartResponse = await startRecording(room.roomId);
			const firstRecordingId = firstStartResponse.body.recordingId;

			expectValidStartRecordingResponse(firstStartResponse, room.roomId, room.roomName);

			const firstStopResponse = await stopRecording(firstRecordingId);
			expectValidStopRecordingResponse(firstStopResponse, firstRecordingId, room.roomId, room.roomName);

			const secondStartResponse = await startRecording(room.roomId);
			expectValidStartRecordingResponse(secondStartResponse, room.roomId, room.roomName);
			const secondRecordingId = secondStartResponse.body.recordingId;

			const secondStopResponse = await stopRecording(secondRecordingId);
			expectValidStopRecordingResponse(secondStopResponse, secondRecordingId, room.roomId, room.roomName);
		});

		it('should handle simultaneous recordings in different rooms correctly', async () => {
			const context = await setupMultiRoomTestContext(2, true);

			const roomDataA = context.getRoomByIndex(0)!;
			const roomDataB = context.getRoomByIndex(1)!;

			const firstResponse = await startRecording(roomDataA.room.roomId);
			const secondResponse = await startRecording(roomDataB.room.roomId);

			expectValidStartRecordingResponse(firstResponse, roomDataA.room.roomId, roomDataA.room.roomName);
			expectValidStartRecordingResponse(secondResponse, roomDataB.room.roomId, roomDataB.room.roomName);

			const firstRecordingId = firstResponse.body.recordingId;
			const secondRecordingId = secondResponse.body.recordingId;

			const [firstStopResponse, secondStopResponse] = await Promise.all([
				stopRecording(firstRecordingId),
				stopRecording(secondRecordingId)
			]);
			expectValidStopRecordingResponse(
				firstStopResponse,
				firstRecordingId,
				roomDataA.room.roomId,
				roomDataA.room.roomName
			);
			expectValidStopRecordingResponse(
				secondStopResponse,
				secondRecordingId,
				roomDataB.room.roomId,
				roomDataB.room.roomName
			);
		});
	});

	describe('Start Recording Validation failures', () => {
		beforeAll(async () => {
			// Create a room without participants
			context = await setupMultiRoomTestContext(1, false);
			({ room } = context.getRoomByIndex(0)!);
		});

		afterEach(async () => {
			await disconnectFakeParticipants();
			await stopAllRecordings();
		});

		it('should accept valid roomId but reject with 409', async () => {
			const response = await startRecording(room.roomId);
			// Room exists but it has no participants
			expect(response.status).toBe(409);
			expect(response.body.message).toContain(`Room '${room.roomId}' has no participants`);
		});

		it('should sanitize roomId and reject the request with 409 due to no participants', async () => {
			const malformedRoomId = '  .<!?' + room.roomId + '  ';
			const response = await startRecording(malformedRoomId);

			console.log('Response:', response.body);
			expect(response.status).toBe(409);
			expect(response.body.message).toContain(`Room '${room.roomId}' has no participants`);
		});

		it('should reject request with roomId that becomes empty after sanitization', async () => {
			const response = await startRecording('!@#$%^&*()');

			expectValidationError(response, 'roomId', 'cannot be empty after sanitization');
		});

		it('should reject request with non-string roomId', async () => {
			const response = await startRecording(123 as unknown as string);
			expectValidationError(response, 'roomId', 'Expected string');
		});

		it('should reject request with very long roomId', async () => {
			const longRoomId = 'a'.repeat(101);
			const response = await startRecording(longRoomId);

			expectValidationError(response, 'roomId', 'cannot exceed 100 characters');
		});

		it('should handle room that does not exist', async () => {
			const response = await startRecording('non-existing-room-id');
			const error = errorRoomNotFound('non-existing-room-id');
			expect(response.status).toBe(404);
			expect(response.body).toEqual({
				error: error.name,
				message: error.message
			});
		});

		it('should return 409 when recording is already in progress', async () => {
			await joinFakeParticipant(room.roomId, 'fakeParticipantId');
			const firstResponse = await startRecording(room.roomId);
			const recordingId = firstResponse.body.recordingId;
			expectValidStartRecordingResponse(firstResponse, room.roomId, room.roomName);

			const secondResponse = await startRecording(room!.roomId);
			expect(secondResponse.status).toBe(409);
			expect(secondResponse.body.message).toContain('already');
			const stopResponse = await stopRecording(recordingId);
			expectValidStopRecordingResponse(stopResponse, recordingId, room.roomId, room.roomName);
		});

		it('should return 503 when recording start times out', async () => {
			setInternalConfig({
				RECORDING_STARTED_TIMEOUT: '1s'
			});
			await joinFakeParticipant(room.roomId, 'fakeParticipantId');
			const response = await startRecording(room.roomId);
			expect(response.status).toBe(503);
			expect(response.body.message).toContain('timed out while starting');
			setInternalConfig({
				RECORDING_STARTED_TIMEOUT: '30s'
			});
		});

		it('should reject invalid layout in config override', async () => {
			const response = await startRecording(room.roomId, { layout: 'invalid-layout' });

			expectValidationError(response, 'config.layout', 'Invalid enum value');
		});

		it('should reject partial audio encoding with missing fields', async () => {
			const partialEncoding = {
				video: {
					width: 1280,
					height: 720,
					framerate: 30,
					codec: MeetRecordingVideoCodec.H264_MAIN,
					bitrate: 3000,
					keyFrameInterval: 4,
					depth: 24
				},
				audio: {
					codec: MeetRecordingAudioCodec.OPUS
					// Missing bitrate and frequency
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: partialEncoding as MeetRecordingEncodingOptions
			});

			expectValidationError(
				response,
				'config.encoding.audio',
				'When audio encoding is provided, required fields are missing: bitrate, frequency'
			);
		});

		it('should reject encoding with neither video nor audio', async () => {
			const emptyEncoding = {};
			const response = await startRecording(room.roomId, {
				encoding: emptyEncoding as MeetRecordingEncodingOptions
			});

			expectValidationError(response, 'config.encoding', 'Both video and audio configuration must be provided');
		});

		it('should reject partial video encoding with missing fields', async () => {
			const partialEncoding = {
				video: {
					width: 1920,
					height: 1080
					// Missing framerate, codec, bitrate
				},
				audio: {
					codec: MeetRecordingAudioCodec.AAC,
					bitrate: 192,
					frequency: 48000
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: partialEncoding as MeetRecordingEncodingOptions
			});

			expectValidationError(
				response,
				'config.encoding.video',
				'When video encoding is provided, required fields are missing'
			);
		});

		it('should reject invalid encoding preset string', async () => {
			const response = await startRecording(room.roomId, {
				encoding: 'invalid-preset' as MeetRecordingEncodingPreset
			});

			expectValidationError(response, 'config.encoding', 'Invalid encoding preset');
		});

		it('should reject invalid encoding options with wrong video codec', async () => {
			const invalidEncoding = {
				video: {
					width: 1920,
					height: 1080,
					framerate: 30,
					codec: 'INVALID_CODEC',
					bitrate: 4500,
					keyFrameInterval: 4,
					depth: 24
				},
				audio: {
					codec: MeetRecordingAudioCodec.OPUS,
					bitrate: 128,
					frequency: 44100
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: invalidEncoding as MeetRecordingEncodingOptions
			});

			expectValidationError(response, 'config.encoding.video.codec', 'Invalid enum value');
		});

		it('should reject invalid encoding options with wrong audio codec', async () => {
			const invalidEncoding = {
				video: {
					width: 1920,
					height: 1080,
					framerate: 30,
					codec: MeetRecordingVideoCodec.H264_MAIN,
					bitrate: 4500,
					keyFrameInterval: 4,
					depth: 24
				},
				audio: {
					codec: 'INVALID_AUDIO_CODEC',
					bitrate: 128,
					frequency: 44100
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: invalidEncoding as MeetRecordingEncodingOptions
			});

			expectValidationError(response, 'config.encoding.audio.codec', 'Invalid enum value');
		});

		it('should reject encoding options with negative video bitrate', async () => {
			const invalidEncoding = {
				video: {
					width: 1920,
					height: 1080,
					framerate: 30,
					codec: MeetRecordingVideoCodec.H264_MAIN,
					bitrate: -1000,
					keyFrameInterval: 4,
					depth: 24
				},
				audio: {
					codec: MeetRecordingAudioCodec.OPUS,
					bitrate: 128,
					frequency: 44100
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: invalidEncoding as MeetRecordingEncodingOptions
			});

			expectValidationError(response, 'config.encoding.video.bitrate', 'positive');
		});

		it('should reject encoding options with negative audio bitrate', async () => {
			const invalidEncoding = {
				video: {
					width: 1920,
					height: 1080,
					framerate: 30,
					codec: MeetRecordingVideoCodec.H264_MAIN,
					bitrate: 4500,
					keyFrameInterval: 4,
					depth: 24
				},
				audio: {
					codec: MeetRecordingAudioCodec.OPUS,
					bitrate: -128,
					frequency: 44100
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: invalidEncoding as MeetRecordingEncodingOptions
			});

			expectValidationError(response, 'config.encoding.audio.bitrate', 'positive');
		});

		it('should reject encoding options with missing keyFrameInterval', async () => {
			const invalidEncoding = {
				video: {
					width: 1920,
					height: 1080,
					framerate: 30,
					codec: MeetRecordingVideoCodec.H264_MAIN,
					bitrate: 4500
					// Missing keyFrameInterval
				},
				audio: {
					codec: MeetRecordingAudioCodec.OPUS,
					bitrate: 128,
					frequency: 44100
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: invalidEncoding as MeetRecordingEncodingOptions
			});

			expectValidationError(
				response,
				'config.encoding.video',
				'When video encoding is provided, required fields are missing: keyFrameInterval'
			);
		});

		it('should reject encoding options with missing video width', async () => {
			const invalidEncoding = {
				video: {
					// Missing width
					height: 1080,
					framerate: 30,
					codec: MeetRecordingVideoCodec.H264_MAIN,
					bitrate: 4500,
					keyFrameInterval: 4,
					depth: 24
				},
				audio: {
					codec: MeetRecordingAudioCodec.OPUS,
					bitrate: 128,
					frequency: 44100
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: invalidEncoding as MeetRecordingEncodingOptions
			});

			expectValidationError(
				response,
				'config.encoding.video',
				'When video encoding is provided, required fields are missing: width'
			);
		});

		it('should reject encoding options with missing audio frequency', async () => {
			const invalidEncoding = {
				video: {
					width: 1920,
					height: 1080,
					framerate: 30,
					codec: MeetRecordingVideoCodec.H264_MAIN,
					bitrate: 4500,
					keyFrameInterval: 4,
					depth: 24
				},
				audio: {
					codec: MeetRecordingAudioCodec.OPUS,
					bitrate: 128
					// Missing frequency
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: invalidEncoding as MeetRecordingEncodingOptions
			});

			expectValidationError(
				response,
				'config.encoding.audio',
				'When audio encoding is provided, required fields are missing: frequency'
			);
		});

		it('should reject audio-only encoding without video', async () => {
			const audioOnlyEncoding = {
				audio: {
					codec: MeetRecordingAudioCodec.OPUS,
					bitrate: 256,
					frequency: 48000
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: audioOnlyEncoding as MeetRecordingEncodingOptions
			});
			expectValidationError(response, 'config.encoding', 'Both video and audio configuration must be provided');
		});

		it('should reject video-only encoding without audio', async () => {
			const videoOnlyEncoding = {
				video: {
					width: 1920,
					height: 1080,
					framerate: 30,
					codec: MeetRecordingVideoCodec.H264_HIGH,
					bitrate: 5000
				}
			};
			const response = await startRecording(room.roomId, {
				encoding: videoOnlyEncoding as MeetRecordingEncodingOptions
			});
			expectValidationError(response, 'config.encoding', 'Both video and audio configuration must be provided');
		});
	});

	describe('Start Recording with Config Override', () => {
		beforeAll(async () => {
			// Create a room (without participant initially)
			context = await setupMultiRoomTestContext(1, true);
			({ room } = context.getRoomByIndex(0)!);
		});

		afterEach(async () => {
			// await disconnectFakeParticipants();
			await stopAllRecordings();
		});

		afterAll(async () => {
			await disconnectFakeParticipants();
			await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
			context = null;
		});

		it('should override room layout when recording layout is provided', async () => {
			const response = await startRecording(room.roomId, { layout: MeetRecordingLayout.SPEAKER });
			const recordingId = response.body.recordingId;

			expectValidStartRecordingResponse(response, room.roomId, room.roomName, MeetRecordingLayout.SPEAKER);

			const stopResponse = await stopRecording(recordingId);
			expectValidStopRecordingResponse(
				stopResponse,
				recordingId,
				room.roomId,
				room.roomName,
				MeetRecordingLayout.SPEAKER
			);
		});

		it('should accept empty config object and use room defaults', async () => {
			const response = await startRecording(room.roomId, {});
			const recordingId = response.body.recordingId;

			console.log('Response for empty config override:', response);
			expectValidStartRecordingResponse(response, room.roomId, room.roomName);

			const stopResponse = await stopRecording(recordingId);
			expectValidStopRecordingResponse(stopResponse, recordingId, room.roomId, room.roomName);
		});

		it('should override room encoding with a preset when config with encoding is provided', async () => {
			const response = await startRecording(room.roomId, { encoding: MeetRecordingEncodingPreset.H264_1080P_60 });
			const recordingId = response.body.recordingId;

			expectValidStartRecordingResponse(
				response,
				room.roomId,
				room.roomName,
				undefined,
				MeetRecordingEncodingPreset.H264_1080P_60
			);

			const stopResponse = await stopRecording(recordingId);
			expectValidStopRecordingResponse(
				stopResponse,
				recordingId,
				room.roomId,
				room.roomName,
				undefined,
				MeetRecordingEncodingPreset.H264_1080P_60
			);
		});

		it('should override room encoding with portrait preset', async () => {
			const response = await startRecording(room.roomId, {
				encoding: MeetRecordingEncodingPreset.PORTRAIT_H264_1080P_30
			});
			const recordingId = response.body.recordingId;

			expectValidStartRecordingResponse(
				response,
				room.roomId,
				room.roomName,
				undefined,
				MeetRecordingEncodingPreset.PORTRAIT_H264_1080P_30
			);

			const stopResponse = await stopRecording(recordingId);
			expectValidStopRecordingResponse(
				stopResponse,
				recordingId,
				room.roomId,
				room.roomName,
				undefined,
				MeetRecordingEncodingPreset.PORTRAIT_H264_1080P_30
			);
		});

		it('should override room encoding with custom encoding options', async () => {
			const customEncoding: MeetRecordingEncodingOptions = {
				video: {
					width: 1920,
					height: 1080,
					framerate: 60,
					codec: MeetRecordingVideoCodec.H264_HIGH,
					bitrate: 6000,
					keyFrameInterval: 2,
					depth: 24
				},
				audio: {
					codec: MeetRecordingAudioCodec.AAC,
					bitrate: 192,
					frequency: 48000
				}
			};
			const response = await startRecording(room.roomId, { encoding: customEncoding });
			const recordingId = response.body.recordingId;

			expectValidStartRecordingResponse(response, room.roomId, room.roomName, undefined, customEncoding);

			const stopResponse = await stopRecording(recordingId);
			expectValidStopRecordingResponse(
				stopResponse,
				recordingId,
				room.roomId,
				room.roomName,
				undefined,
				customEncoding
			);
		});

		it('should override both layout and encoding simultaneously', async () => {
			const customEncoding: MeetRecordingEncodingOptions = {
				video: {
					width: 1920,
					height: 1080,
					framerate: 30,
					codec: MeetRecordingVideoCodec.H264_MAIN,
					bitrate: 4500,
					keyFrameInterval: 4,
					depth: 24
				},
				audio: {
					codec: MeetRecordingAudioCodec.OPUS,
					bitrate: 128,
					frequency: 44100
				}
			};
			const response = await startRecording(room.roomId, {
				layout: MeetRecordingLayout.SPEAKER,
				encoding: customEncoding
			});
			const recordingId = response.body.recordingId;

			expectValidStartRecordingResponse(
				response,
				room.roomId,
				room.roomName,
				MeetRecordingLayout.SPEAKER,
				customEncoding
			);

			const stopResponse = await stopRecording(recordingId);
			expectValidStopRecordingResponse(
				stopResponse,
				recordingId,
				room.roomId,
				room.roomName,
				MeetRecordingLayout.SPEAKER,
				customEncoding
			);
		});
	});
});
