import { z } from 'zod';

/**
 * A comma-separated list of the fields of an entity to include in a response, as the `fields` query
 * parameter and the `X-Fields` header carry it. Names that are not fields of the entity are ignored
 * and repeated ones dropped; a list left with no usable name reads as no list, meaning every field.
 */
export const fieldListSchema = <TField extends string>(allowedFields: readonly TField[]) =>
	z
		.string()
		.optional()
		.transform((value): TField[] | undefined => {
			const requested = (value ?? '').split(',').map((field) => field.trim());
			const fields = new Set(
				requested.filter((field): field is TField => allowedFields.includes(field as TField))
			);
			return fields.size > 0 ? Array.from(fields) : undefined;
		});

/**
 * Merges the fields the `X-Fields` header names into the `fields` query parameter, as a union, so a
 * request validator reads one list whichever way the client sent it.
 */
export const mergeFieldsHeaderIntoQuery = <TField extends string>(
	headers: Record<string, unknown>,
	query: Record<string, unknown>,
	allowedFields: readonly TField[]
): void => {
	const headerFields = fieldListSchema(allowedFields).safeParse(headers['x-fields']).data;

	if (!headerFields) return;

	const queryFields =
		typeof query.fields === 'string'
			? query.fields
					.split(',')
					.map((field) => field.trim())
					.filter((field) => field !== '')
			: [];
	query.fields = Array.from(new Set([...queryFields, ...headerFields])).join(',');
};
