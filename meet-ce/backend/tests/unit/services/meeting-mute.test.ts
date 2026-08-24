import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TrackSource } from '@livekit/protocol';
import type { MeetParticipantMuteOptions, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MEET_PERMISSION_KEYS, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import type { ParticipantInfo, Room } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph: importing MeetingService first leaves it uninitialized when RoomMemberService
// declares its `@inject(MeetingService)` constructor.
import '../../../src/config/dependency-injector.config.js';
import type { FrontendEventService } from '../../../src/services/frontend-event.service.js';
import type { LiveKitService } from '../../../src/services/livekit.service.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import { MeetingService } from '../../../src/services/meeting.service.js';
import type { RequestSessionService } from '../../../src/services/request-session.service.js';
import type { RoomService } from '../../../src/services/room.service.js';

/**
 * Which tracks a mute request reaches, who is exempt from it and who is told about it. The
 * exemptions and the one-way "only what was asked for" selection are the rules the REST body cannot
 * express on its own, so they are pinned here against a fake LiveKit rather than in the integration
 * suite, which needs a real participant and cannot control which sources it publishes.
 */

const ROOM_ID = 'room-abc';
const IDENTITY = 'participant-1';

const allPermissions = Object.fromEntries(
	MEET_PERMISSION_KEYS.map((key) => [key, true])
) as unknown as MeetRoomMemberPermissions;

const participantWith = (
	badge: MeetRoomMemberUIBadge,
	tracks: { sid: string; source: TrackSource; muted: boolean }[]
) =>
	({
		identity: IDENTITY,
		name: 'Participant One',
		tracks,
		metadata: JSON.stringify({ iat: Date.now(), roomId: ROOM_ID, permissions: allPermissions, badge })
	}) as unknown as ParticipantInfo;

const speakerWith = (tracks: { sid: string; source: TrackSource; muted: boolean }[]) =>
	participantWith(MeetRoomMemberUIBadge.OTHER, tracks);

const microphone = { sid: 'mic-sid', source: TrackSource.MICROPHONE, muted: false };
const camera = { sid: 'cam-sid', source: TrackSource.CAMERA, muted: false };
const screenShare = { sid: 'screen-sid', source: TrackSource.SCREEN_SHARE, muted: false };
const screenShareAudio = { sid: 'screen-audio-sid', source: TrackSource.SCREEN_SHARE_AUDIO, muted: false };

describe('MeetingService mute', () => {
	let livekitService: {
		getParticipant: jest.Mock<(roomId: string, identity: string) => Promise<ParticipantInfo>>;
		isStandardParticipant: jest.Mock<(participant: ParticipantInfo) => boolean>;
		mutePublishedTrack: jest.Mock<(roomId: string, identity: string, trackSid: string) => Promise<void>>;
		listStandardParticipants: jest.Mock<(roomId: string) => Promise<ParticipantInfo[]>>;
		getRoom: jest.Mock<(roomId: string) => Promise<Room>>;
	};
	let frontendEventService: {
		sendParticipantMediaMutedSignal: jest.Mock<
			(roomId: string, identities: string[], media: MeetParticipantMuteOptions) => Promise<void>
		>;
	};
	let requestSessionService: { getParticipantIdentity: jest.Mock<() => string | undefined> };
	let meetingService: MeetingService;

	const mutedTrackSids = () => livekitService.mutePublishedTrack.mock.calls.map(([, , trackSid]) => trackSid);

	beforeEach(() => {
		livekitService = {
			getParticipant: jest.fn(),
			isStandardParticipant: jest.fn(() => true),
			mutePublishedTrack: jest.fn(async () => {}),
			listStandardParticipants: jest.fn(async () => []),
			getRoom: jest.fn(async () => ({ name: ROOM_ID }) as Room)
		};
		frontendEventService = { sendParticipantMediaMutedSignal: jest.fn(async () => {}) };
		requestSessionService = { getParticipantIdentity: jest.fn(() => undefined as string | undefined) };

		meetingService = new MeetingService(
			{ warn: () => {} } as unknown as LoggerService,
			livekitService as unknown as LiveKitService,
			{} as unknown as RoomService,
			frontendEventService as unknown as FrontendEventService,
			requestSessionService as unknown as RequestSessionService
		);
	});

	it('mutes only the requested sources and tells the participant which ones', async () => {
		livekitService.getParticipant.mockResolvedValue(speakerWith([microphone, camera, screenShare]));

		await meetingService.muteParticipant(ROOM_ID, IDENTITY, { audioActive: false });

		expect(mutedTrackSids()).toEqual([microphone.sid]);
		expect(frontendEventService.sendParticipantMediaMutedSignal).toHaveBeenCalledTimes(1);
		expect(frontendEventService.sendParticipantMediaMutedSignal).toHaveBeenCalledWith(ROOM_ID, [IDENTITY], {
			audioActive: false
		});
	});

	it('stops the screen share audio together with the screen share', async () => {
		livekitService.getParticipant.mockResolvedValue(speakerWith([microphone, screenShare, screenShareAudio]));

		await meetingService.muteParticipant(ROOM_ID, IDENTITY, { screenShareActive: false });

		expect(mutedTrackSids()).toEqual([screenShare.sid, screenShareAudio.sid]);
	});

	it('signals a device that is already off, so it stays off when its track is re-created', async () => {
		livekitService.getParticipant.mockResolvedValue(speakerWith([{ ...microphone, muted: true }]));

		await meetingService.muteParticipant(ROOM_ID, IDENTITY, { audioActive: false });

		expect(livekitService.mutePublishedTrack).not.toHaveBeenCalled();
		expect(frontendEventService.sendParticipantMediaMutedSignal).toHaveBeenCalledTimes(1);
	});

	it('rejects muting a moderator without touching their tracks', async () => {
		livekitService.getParticipant.mockResolvedValue(participantWith(MeetRoomMemberUIBadge.MODERATOR, [microphone]));

		await expect(meetingService.muteParticipant(ROOM_ID, IDENTITY, { audioActive: false })).rejects.toMatchObject({
			statusCode: 409
		});
		expect(livekitService.mutePublishedTrack).not.toHaveBeenCalled();
		expect(frontendEventService.sendParticipantMediaMutedSignal).not.toHaveBeenCalled();
	});

	it('hides LiveKit internal participants behind a 404', async () => {
		livekitService.getParticipant.mockResolvedValue(speakerWith([microphone]));
		livekitService.isStandardParticipant.mockReturnValue(false);

		await expect(meetingService.muteParticipant(ROOM_ID, IDENTITY, { audioActive: false })).rejects.toMatchObject({
			statusCode: 404
		});
		expect(livekitService.mutePublishedTrack).not.toHaveBeenCalled();
	});

	it('mutes everyone but the moderators', async () => {
		const moderator = {
			...participantWith(MeetRoomMemberUIBadge.MODERATOR, [microphone]),
			identity: 'moderator-1'
		} as ParticipantInfo;
		livekitService.listStandardParticipants.mockResolvedValue([speakerWith([microphone]), moderator]);

		await meetingService.muteAllParticipants(ROOM_ID, { audioActive: false });

		expect(livekitService.mutePublishedTrack).toHaveBeenCalledTimes(1);
		expect(livekitService.mutePublishedTrack).toHaveBeenCalledWith(ROOM_ID, IDENTITY, microphone.sid);
		expect(frontendEventService.sendParticipantMediaMutedSignal).toHaveBeenCalledTimes(1);
		expect(frontendEventService.sendParticipantMediaMutedSignal).toHaveBeenCalledWith(ROOM_ID, [IDENTITY], {
			audioActive: false
		});
	});

	// Muting everyone is an action on the rest of the meeting: whoever asked for it keeps their own
	// devices, whatever role they hold.
	it('leaves the caller out of a mute-everyone', async () => {
		const other = { ...speakerWith([microphone]), identity: 'participant-2' } as ParticipantInfo;
		livekitService.listStandardParticipants.mockResolvedValue([speakerWith([microphone]), other]);
		requestSessionService.getParticipantIdentity.mockReturnValue(IDENTITY);

		await meetingService.muteAllParticipants(ROOM_ID, { audioActive: false });

		expect(livekitService.mutePublishedTrack).toHaveBeenCalledTimes(1);
		expect(livekitService.mutePublishedTrack).toHaveBeenCalledWith(ROOM_ID, 'participant-2', microphone.sid);
		expect(frontendEventService.sendParticipantMediaMutedSignal).toHaveBeenCalledWith(ROOM_ID, ['participant-2'], {
			audioActive: false
		});
	});

	it('mutes the rest of the meeting when one participant fails', async () => {
		const other = {
			...speakerWith([{ ...camera, sid: 'cam-sid-2' }]),
			identity: 'participant-2'
		} as ParticipantInfo;
		livekitService.listStandardParticipants.mockResolvedValue([speakerWith([camera]), other]);
		livekitService.mutePublishedTrack.mockImplementation(async (_roomId, identity) => {
			if (identity === IDENTITY) throw new Error('participant left');
		});

		await meetingService.muteAllParticipants(ROOM_ID, { videoActive: false });

		expect(mutedTrackSids()).toEqual([camera.sid, 'cam-sid-2']);
		expect(frontendEventService.sendParticipantMediaMutedSignal).toHaveBeenCalledTimes(1);
		expect(frontendEventService.sendParticipantMediaMutedSignal).toHaveBeenCalledWith(ROOM_ID, ['participant-2'], {
			videoActive: false
		});
	});

	// The signal latches the participant's intent off and ends their screen share, so it must not
	// claim a device is off while its track is still publishing.
	it('leaves the participant unnotified when a track mute fails, without skipping the other tracks', async () => {
		livekitService.getParticipant.mockResolvedValue(speakerWith([microphone, camera]));
		livekitService.mutePublishedTrack.mockImplementation(async (_roomId, _identity, trackSid) => {
			if (trackSid === camera.sid) throw new Error('LiveKit is unreachable');
		});

		await expect(
			meetingService.muteParticipant(ROOM_ID, IDENTITY, { audioActive: false, videoActive: false })
		).rejects.toThrow('LiveKit is unreachable');

		expect(mutedTrackSids()).toEqual([microphone.sid, camera.sid]);
		expect(frontendEventService.sendParticipantMediaMutedSignal).not.toHaveBeenCalled();
	});
});
