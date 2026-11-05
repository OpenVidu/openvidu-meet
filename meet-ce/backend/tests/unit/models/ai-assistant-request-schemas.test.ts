import { beforeAll, describe, expect, it } from '@jest/globals';
import type { z } from 'zod';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import { AssistantIdSchema, CreateAssistantReqSchema } from '../../../src/models/zod-schemas/ai-assistant.schema.js';

const issues = (schema: z.ZodType, input: unknown): string[] => {
	const result = schema.safeParse(input);

	if (result.success) {
		return [];
	}

	return result.error.issues.map(({ path, message }) =>
		path.length > 0 ? `${path.join('.')}: ${message}` : message
	);
};

beforeAll(() => {
	configureZodErrorMessages();
});

describe('CreateAssistantReqSchema', () => {
	const capabilities = (...names: string[]) => ({ capabilities: names.map((name) => ({ name })) });

	it('accepts the live captions capability', () => {
		expect(CreateAssistantReqSchema.parse(capabilities('live_captions'))).toEqual(capabilities('live_captions'));
	});

	it('drops the capabilities that do not exist', () => {
		expect(CreateAssistantReqSchema.parse(capabilities('summaries', 'live_captions', 'translation'))).toEqual(
			capabilities('live_captions')
		);
	});

	it('keeps each capability once', () => {
		expect(CreateAssistantReqSchema.parse(capabilities('live_captions', 'live_captions'))).toEqual(
			capabilities('live_captions')
		);
	});

	it('rejects a request whose capabilities all do not exist', () => {
		expect(issues(CreateAssistantReqSchema, capabilities('summaries'))).toEqual([
			'capabilities: At least one valid capability is required'
		]);
	});

	it('rejects an empty list of capabilities', () => {
		expect(issues(CreateAssistantReqSchema, capabilities())).toEqual([expect.stringMatching(/^capabilities: /)]);
		expect(issues(CreateAssistantReqSchema, capabilities())).not.toContain(
			'capabilities: At least one valid capability is required'
		);
	});

	it('requires a list of capabilities that have a name', () => {
		expect(issues(CreateAssistantReqSchema, {})).toEqual(['capabilities: Required']);
		expect(issues(CreateAssistantReqSchema, { capabilities: 'live_captions' })).toEqual([
			'capabilities: Expected array, received string'
		]);
		expect(issues(CreateAssistantReqSchema, { capabilities: [{}] })).toEqual(['capabilities.0.name: Required']);
	});
});

describe('AssistantIdSchema', () => {
	it('trims the id', () => {
		expect(AssistantIdSchema.parse(' assistant-1 ')).toBe('assistant-1');
	});

	it('rejects an empty id and one that is only whitespace', () => {
		expect(issues(AssistantIdSchema, '')).toHaveLength(1);
		expect(issues(AssistantIdSchema, '   ')).toHaveLength(1);
	});
});
