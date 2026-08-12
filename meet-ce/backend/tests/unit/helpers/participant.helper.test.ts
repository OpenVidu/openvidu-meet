import { describe, expect, it } from '@jest/globals';
import { TrackSource } from '@livekit/protocol';
import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MEET_PERMISSION_KEYS, MeetRoomMemberRole, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import type { ParticipantInfo } from 'livekit-server-sdk';
import { MeetParticipantHelper } from '../../../src/helpers/participant.helper.js';

const allPermissions = Object.fromEntries(
	MEET_PERMISSION_KEYS.map((key) => [key, true])
) as unknown as MeetRoomMemberPermissions;

/** Serialized Meet token metadata as carried by a LiveKit participant that joined through Meet. */
const meetingMetadata = (overrides: Record<string, unknown> = {}): string =>
	JSON.stringify({
		iat: 1_620_000_000_000,
		roomId: 'room-abc',
		permissions: allPermissions,
		badge: MeetRoomMemberUIBadge.MODERATOR,
		...overrides
	});

const participantWith = (fields: Record<string, unknown>): ParticipantInfo =>
	({
		identity: 'participant-1',
		name: 'Participant One',
		tracks: [],
		attributes: {},
		...fields
	}) as unknown as ParticipantInfo;

const track = (source: TrackSource, muted = false) => ({ source, muted });

describe('MeetParticipantHelper.toParticipantPayload', () => {
	it('builds the lifecycle payload without live media state, even when tracks are published', () => {
		const participant = participantWith({
			metadata: meetingMetadata({ externalId: 'crm-user_42', metadata: '{"plan":"premium"}' }),
			joinedAtMs: 1_620_000_000_000n,
			tracks: [track(TrackSource.MICROPHONE), track(TrackSource.SCREEN_SHARE)]
		});

		// Exact equality pins the absence of audioEnabled/videoEnabled/screenSharing: at the time
		// lifecycle events fire, tracks are not published yet (or already gone), so a media flag
		// here would systematically read as "joined muted".
		expect(MeetParticipantHelper.toParticipantPayload(participant)).toEqual({
			participantIdentity: 'participant-1',
			participantName: 'Participant One',
			externalId: 'crm-user_42',
			metadata: '{"plan":"premium"}',
			role: MeetRoomMemberRole.MODERATOR,
			joinDate: 1_620_000_000_000
		});
	});
});

describe('MeetParticipantHelper.toParticipantInfo', () => {
	it('builds the full API-facing shape from a participant that joined through Meet', () => {
		const participant = participantWith({
			metadata: meetingMetadata({ externalId: 'crm-user_42', metadata: '{"plan":"premium"}' }),
			joinedAtMs: 1_620_000_000_000n,
			tracks: [track(TrackSource.MICROPHONE), track(TrackSource.CAMERA, true), track(TrackSource.SCREEN_SHARE)]
		});

		expect(MeetParticipantHelper.toParticipantInfo(participant)).toEqual({
			participantIdentity: 'participant-1',
			participantName: 'Participant One',
			externalId: 'crm-user_42',
			metadata: '{"plan":"premium"}',
			role: MeetRoomMemberRole.MODERATOR,
			joinDate: 1_620_000_000_000,
			audioEnabled: true,
			videoEnabled: false,
			screenSharing: true
		});
	});

	it('omits the correlation fields and downgrades to speaker for a participant without Meet metadata', () => {
		const info = MeetParticipantHelper.toParticipantInfo(participantWith({ joinedAtMs: 0n, joinedAt: 0n }));

		expect(info.externalId).toBeUndefined();
		expect(info.metadata).toBeUndefined();
		expect(info.role).toBe(MeetRoomMemberRole.SPEAKER);
		expect(info.joinDate).toBe(0);
		expect(info.audioEnabled).toBe(false);
		expect(info.videoEnabled).toBe(false);
		expect(info.screenSharing).toBe(false);
	});

	it('treats unparseable or foreign metadata as absent', () => {
		const unparseable = MeetParticipantHelper.toParticipantInfo(participantWith({ metadata: 'not-json' }));
		expect(unparseable.externalId).toBeUndefined();
		expect(unparseable.role).toBe(MeetRoomMemberRole.SPEAKER);

		const foreign = MeetParticipantHelper.toParticipantInfo(
			participantWith({ metadata: JSON.stringify({ some: 'other-app' }) })
		);
		expect(foreign.metadata).toBeUndefined();
		expect(foreign.role).toBe(MeetRoomMemberRole.SPEAKER);
	});
});

describe('MeetParticipantHelper.extractRole', () => {
	it('maps the OTHER badge to speaker and every privileged badge to moderator', () => {
		const withBadge = (badge: MeetRoomMemberUIBadge) => participantWith({ metadata: meetingMetadata({ badge }) });

		expect(MeetParticipantHelper.extractRole(withBadge(MeetRoomMemberUIBadge.OTHER))).toBe(
			MeetRoomMemberRole.SPEAKER
		);
		expect(MeetParticipantHelper.extractRole(withBadge(MeetRoomMemberUIBadge.MODERATOR))).toBe(
			MeetRoomMemberRole.MODERATOR
		);
		expect(MeetParticipantHelper.extractRole(withBadge(MeetRoomMemberUIBadge.ADMIN))).toBe(
			MeetRoomMemberRole.MODERATOR
		);
		expect(MeetParticipantHelper.extractRole(withBadge(MeetRoomMemberUIBadge.OWNER))).toBe(
			MeetRoomMemberRole.MODERATOR
		);
	});

	it('falls back to speaker when the metadata is absent', () => {
		expect(MeetParticipantHelper.extractRole(participantWith({}))).toBe(MeetRoomMemberRole.SPEAKER);
	});
});

describe('MeetParticipantHelper.extractJoinDate', () => {
	it('prefers the millisecond timestamp', () => {
		const participant = participantWith({ joinedAtMs: 1_620_000_000_000n, joinedAt: 1_620_000_000n });

		expect(MeetParticipantHelper.extractJoinDate(participant)).toBe(1_620_000_000_000);
	});

	it('falls back to the second-resolution timestamp, converted to milliseconds', () => {
		const participant = participantWith({ joinedAtMs: 0n, joinedAt: 1_620_000_000n });

		expect(MeetParticipantHelper.extractJoinDate(participant)).toBe(1_620_000_000_000);
	});

	it('returns 0 when LiveKit reports neither', () => {
		expect(MeetParticipantHelper.extractJoinDate(participantWith({ joinedAtMs: 0n, joinedAt: 0n }))).toBe(0);
	});
});

describe('MeetParticipantHelper.extractMediaState', () => {
	it('reports everything disabled for a participant without tracks', () => {
		expect(MeetParticipantHelper.extractMediaState(participantWith({}))).toEqual({
			audioEnabled: false,
			videoEnabled: false,
			screenSharing: false
		});
	});

	it('counts a device as enabled only when its track is published and not muted', () => {
		const participant = participantWith({
			tracks: [track(TrackSource.MICROPHONE, true), track(TrackSource.CAMERA, false)]
		});

		expect(MeetParticipantHelper.extractMediaState(participant)).toEqual({
			audioEnabled: false,
			videoEnabled: true,
			screenSharing: false
		});
	});

	it('counts a device as enabled when any of its tracks is unmuted', () => {
		const participant = participantWith({
			tracks: [track(TrackSource.MICROPHONE, true), track(TrackSource.MICROPHONE, false)]
		});

		expect(MeetParticipantHelper.extractMediaState(participant).audioEnabled).toBe(true);
	});

	it('counts a screen share as active as soon as its track is published, muted or not', () => {
		expect(
			MeetParticipantHelper.extractMediaState(
				participantWith({ tracks: [track(TrackSource.SCREEN_SHARE, true)] })
			).screenSharing
		).toBe(true);

		expect(
			MeetParticipantHelper.extractMediaState(
				participantWith({ tracks: [track(TrackSource.SCREEN_SHARE_AUDIO)] })
			).screenSharing
		).toBe(true);
	});
});
