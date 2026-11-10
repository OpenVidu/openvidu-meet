import { EmbeddedAttribute } from '@openvidu-meet/typings';
import { parseOptionalBoolean } from '../../../shared/utils/url.utils';
import type { MeetingEntryParams } from '../services/meeting-entry.service';

/** The raw value of an attribute: a query parameter of the direct link or the iframe, or an input of the element. */
export type EntryAttributeReader = (attribute: EmbeddedAttribute) => string | boolean | null | undefined;

/** The entry parameters of a meeting, read the same way whichever way the participant arrives. */
export function readMeetingEntryParams(
	room: Pick<MeetingEntryParams, 'roomId' | 'secret'>,
	read: EntryAttributeReader
): MeetingEntryParams {
	const text = (attribute: EmbeddedAttribute) => {
		const value = read(attribute);
		return typeof value === 'string' ? value : undefined;
	};

	const flag = (attribute: EmbeddedAttribute) => parseOptionalBoolean(read(attribute));

	return {
		...room,
		e2eeKey: text(EmbeddedAttribute.E2EE_KEY),
		participantName: text(EmbeddedAttribute.PARTICIPANT_NAME),
		participantExternalId: text(EmbeddedAttribute.PARTICIPANT_EXTERNAL_ID),
		participantMetadata: text(EmbeddedAttribute.PARTICIPANT_METADATA),
		initialAudioActive: flag(EmbeddedAttribute.INITIAL_AUDIO_ACTIVE),
		initialVideoActive: flag(EmbeddedAttribute.INITIAL_VIDEO_ACTIVE),
		leaveRedirectUrl: text(EmbeddedAttribute.LEAVE_REDIRECT_URL),
		showRecording: text(EmbeddedAttribute.SHOW_RECORDING),
		showOnlyRecordings: flag(EmbeddedAttribute.SHOW_ONLY_RECORDINGS)
	};
}
