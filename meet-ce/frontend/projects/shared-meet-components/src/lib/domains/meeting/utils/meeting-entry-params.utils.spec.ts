import { convertToParamMap } from '@angular/router';
import { EmbeddedAttribute } from '@openvidu-meet/typings';
import { MeetingEntryParams } from '../services/meeting-entry.service';
import { readMeetingEntryParams } from './meeting-entry-params.utils';

describe('readMeetingEntryParams', () => {
	const room = { roomId: 'r1', secret: 'sec' };

	const fromQuery = (query: Record<string, string>) => {
		const params = convertToParamMap(query);
		return readMeetingEntryParams(room, (attribute) => params.get(attribute));
	};

	const fromElement = (values: Partial<Record<EmbeddedAttribute, string | boolean>>) =>
		readMeetingEntryParams(room, (attribute) => values[attribute]);

	const expected: MeetingEntryParams = {
		roomId: 'r1',
		secret: 'sec',
		e2eeKey: 'k',
		participantName: 'Alice',
		participantExternalId: 'crm-user_42',
		participantMetadata: '{"plan":"premium"}',
		initialAudioActive: true,
		initialVideoActive: false,
		leaveRedirectUrl: 'https://back',
		showRecording: 'rec-1',
		showOnlyRecordings: true
	};

	it('reads the same params from a query string and from an element', () => {
		const strings = {
			[EmbeddedAttribute.E2EE_KEY]: 'k',
			[EmbeddedAttribute.PARTICIPANT_NAME]: 'Alice',
			[EmbeddedAttribute.PARTICIPANT_EXTERNAL_ID]: 'crm-user_42',
			[EmbeddedAttribute.PARTICIPANT_METADATA]: '{"plan":"premium"}',
			[EmbeddedAttribute.LEAVE_REDIRECT_URL]: 'https://back',
			[EmbeddedAttribute.SHOW_RECORDING]: 'rec-1'
		};

		expect(
			fromQuery({
				...strings,
				[EmbeddedAttribute.INITIAL_AUDIO_ACTIVE]: 'true',
				[EmbeddedAttribute.INITIAL_VIDEO_ACTIVE]: 'false',
				[EmbeddedAttribute.SHOW_ONLY_RECORDINGS]: ''
			})
		).toEqual(expected);
		expect(
			fromElement({
				...strings,
				[EmbeddedAttribute.INITIAL_AUDIO_ACTIVE]: true,
				[EmbeddedAttribute.INITIAL_VIDEO_ACTIVE]: false,
				[EmbeddedAttribute.SHOW_ONLY_RECORDINGS]: true
			})
		).toEqual(expected);
	});

	it('leaves an absent attribute without an opinion, from either source', () => {
		for (const params of [fromQuery({}), fromElement({})]) {
			expect(params.initialAudioActive).toBeUndefined();
			expect(params.initialVideoActive).toBeUndefined();
			expect(params.showOnlyRecordings).toBeUndefined();
			expect(params.participantName).toBeUndefined();
		}
	});

	it('reads a boolean as false only when it is false', () => {
		const audio = (value: string) =>
			fromQuery({ [EmbeddedAttribute.INITIAL_AUDIO_ACTIVE]: value }).initialAudioActive;

		expect(audio('false')).toBeFalse();
		expect(audio('')).toBeTrue();
		expect(audio('0')).toBeTrue();
		expect(audio('FALSE')).toBeTrue();
	});

	it('takes the room and its secret from the caller', () => {
		const params = readMeetingEntryParams({ roomId: 'r2' }, () => 'from-an-attribute');

		expect(params.roomId).toBe('r2');
		expect(params.secret).toBeUndefined();
	});
});
