import {
	LeftEventReason,
	MeetRoomMemberRole,
	MeetRoomMemberUIBadge,
	raisedHandAttributes
} from '@openvidu-meet/typings';
import type { RemoteParticipant } from '../openvidu-components';
import { DisconnectReason } from '../openvidu-components';
import {
	toEmbeddedDepartedParticipant,
	toEmbeddedParticipantInfo,
	toEmbeddedParticipantPayload
} from './embedded-participant.utils';

const participantWith = (fields: Record<string, unknown>): RemoteParticipant =>
	({ identity: 'participant-1', name: 'Participant One', ...fields }) as unknown as RemoteParticipant;

const meetingMetadata = (overrides: Record<string, unknown> = {}): string =>
	JSON.stringify({ badge: MeetRoomMemberUIBadge.MODERATOR, ...overrides });

describe('toEmbeddedParticipantPayload', () => {
	it('builds the lifecycle payload from the Meet metadata the participant carries', () => {
		const participant = participantWith({
			metadata: meetingMetadata({ externalId: 'crm-user_42', metadata: '{"plan":"premium"}' }),
			joinedAt: new Date(1_620_000_000_000)
		});

		expect(toEmbeddedParticipantPayload(participant)).toEqual({
			participantIdentity: 'participant-1',
			participantName: 'Participant One',
			externalId: 'crm-user_42',
			metadata: '{"plan":"premium"}',
			role: MeetRoomMemberRole.MODERATOR,
			joinDate: 1_620_000_000_000
		});
	});

	it('downgrades to speaker and omits the correlation fields without Meet metadata', () => {
		const payload = toEmbeddedParticipantPayload(participantWith({}));

		expect(payload.role).toBe(MeetRoomMemberRole.SPEAKER);
		expect(payload.externalId).toBeUndefined();
		expect(payload.metadata).toBeUndefined();
		expect(payload.joinDate).toBe(0);
	});

	it('maps the OTHER badge to speaker and falls back to the identity when the name is absent', () => {
		const participant = participantWith({
			name: undefined,
			metadata: meetingMetadata({ badge: MeetRoomMemberUIBadge.OTHER })
		});
		const payload = toEmbeddedParticipantPayload(participant);

		expect(payload.role).toBe(MeetRoomMemberRole.SPEAKER);
		expect(payload.participantName).toBe('participant-1');
	});
});

describe('toEmbeddedParticipantInfo', () => {
	it('adds the media state of the published tracks and the hand of the attributes', () => {
		const participant = participantWith({
			isMicrophoneEnabled: true,
			isCameraEnabled: false,
			isScreenShareEnabled: true,
			attributes: raisedHandAttributes(1_620_000_000_500)
		});

		expect(toEmbeddedParticipantInfo(participant)).toEqual({
			...toEmbeddedParticipantPayload(participant),
			audioActive: true,
			videoActive: false,
			screenShareActive: true,
			handRaised: true,
			handRaiseDate: 1_620_000_000_500
		});
	});

	it('omits the raise date while the hand is down', () => {
		const info = toEmbeddedParticipantInfo(participantWith({ attributes: {} }));

		expect(info.handRaised).toBe(false);
		expect('handRaiseDate' in info).toBe(false);
	});
});

describe('toEmbeddedDepartedParticipant', () => {
	it('adds the leave reason LiveKit gave, mapped like the participantLeft webhook maps it', () => {
		const participant = participantWith({});

		expect(toEmbeddedDepartedParticipant(participant, DisconnectReason.CLIENT_INITIATED)).toEqual({
			...toEmbeddedParticipantPayload(participant),
			leaveReason: LeftEventReason.VOLUNTARY_LEAVE
		});
		expect(toEmbeddedDepartedParticipant(participant, DisconnectReason.PARTICIPANT_REMOVED).leaveReason).toBe(
			LeftEventReason.PARTICIPANT_KICKED
		);
	});

	it('reports an unknown reason when LiveKit gave none', () => {
		expect(toEmbeddedDepartedParticipant(participantWith({}), undefined).leaveReason).toBe(LeftEventReason.UNKNOWN);
	});
});
