import { describe, expect, it } from '@jest/globals';
import {
	MEET_API_KEY_DOCUMENT_ONLY_FIELDS,
	MeetApiKeyDocumentOnlyField
} from '../../../../src/models/mongoose-schemas/api-key.schema.js';
import { AssertReadonlyArrayCoversUnion } from '../type-assertions.utils.js';

describe('MeetApiKeyDocument-only fields list', () => {
	it('should include all document-only properties', () => {
		const assertApiKeyDocumentOnlyFieldsCoverage: AssertReadonlyArrayCoversUnion<
			MeetApiKeyDocumentOnlyField,
			typeof MEET_API_KEY_DOCUMENT_ONLY_FIELDS
		> = true;
		expect(assertApiKeyDocumentOnlyFieldsCoverage).toBe(true);
	});
});
