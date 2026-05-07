import { describe, expect, it } from '@jest/globals';
import {
	MEET_RECORDING_DOCUMENT_ONLY_FIELDS,
	MeetRecordingDocumentOnlyField
} from '../../../../src/models/mongoose-schemas/recording.schema.js';
import { AssertReadonlyArrayCoversUnion } from '../type-assertions.utils.js';

describe('MeetRecordingDocument-only fields list', () => {
	it('should include all document-only properties', () => {
		const assertRecordingDocumentOnlyFieldsCoverage: AssertReadonlyArrayCoversUnion<
			MeetRecordingDocumentOnlyField,
			typeof MEET_RECORDING_DOCUMENT_ONLY_FIELDS
		> = true;
		expect(assertRecordingDocumentOnlyFieldsCoverage).toBe(true);
	});
});
