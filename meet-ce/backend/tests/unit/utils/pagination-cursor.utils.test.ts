import { describe, expect, it } from '@jest/globals';
import { Types } from 'mongoose';
import { OpenViduMeetError } from '../../../src/models/error.model.js';
import { decodePaginationCursor, encodePaginationCursor } from '../../../src/utils/pagination-cursor.utils.js';

const encode = (cursor: unknown): string => Buffer.from(JSON.stringify(cursor)).toString('base64');

describe('pagination cursor', () => {
	it('round-trips the sort field value and the id of the last document of a page', () => {
		const lastDocument: { _id: Types.ObjectId; creationDate: number } = {
			_id: new Types.ObjectId(),
			creationDate: 1700000000000
		};
		const token = encodePaginationCursor(lastDocument, 'creationDate');

		expect(decodePaginationCursor(token)).toEqual({ fieldValue: 1700000000000, id: lastDocument._id.toString() });
	});

	it('stores a missing sort field value as null', () => {
		const token = encodePaginationCursor({ _id: new Types.ObjectId() }, 'autoDeletionDate');

		expect(decodePaginationCursor(token).fieldValue).toBeNull();
	});

	it.each([
		['a string', 'room-1'],
		['a boolean', false]
	])('round-trips %s as the sort field value', (_label, fieldValue) => {
		const id = new Types.ObjectId().toString();

		expect(decodePaginationCursor(encode({ fieldValue, id }))).toEqual({ fieldValue, id });
	});

	it.each([
		['garbage', 'x'],
		['an empty object', encode({})],
		['a truncated token', 'eyJ9'],
		['a null payload', encode(null)],
		['a payload that is not an object', encode('just a string')],
		['a payload with no sort field value', encode({ id: new Types.ObjectId() })],
		['a payload with no id', encode({ fieldValue: 1 })],
		['a well-shaped token whose id is not an ObjectId', encode({ fieldValue: 1, id: 'x' })],
		[
			'an id carrying something before its 24 hexadecimal characters',
			encode({ fieldValue: 1, id: `zz${new Types.ObjectId()}` })
		],
		[
			'an id carrying something after its 24 hexadecimal characters',
			encode({ fieldValue: 1, id: `${new Types.ObjectId()}zz` })
		],
		[
			'a query operator smuggled as the sort field value',
			encode({ fieldValue: { $gt: 1 }, id: new Types.ObjectId() })
		]
	])('rejects %s as a bad request, not as a server failure', (_label, token) => {
		let thrown: unknown;

		try {
			decodePaginationCursor(token);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(OpenViduMeetError);
		expect((thrown as OpenViduMeetError).statusCode).toBe(400);
		expect((thrown as OpenViduMeetError).message).toBe('Invalid pagination token');
	});
});
