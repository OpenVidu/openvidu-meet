import { MeetRecordingInfo, MeetRoom } from '@typings-ce';

export class UtilsHelper {
	// Prevent instantiation of this utility class.
	private constructor() {}

	/**
	 * Filters the fields of an object based on a list of keys.
	 *
	 * @param obj - The object to filter (it can be a MeetRoom or MeetRecordingInfo).
	 * @param fields - A comma-separated string or an array of field names to keep.
	 * @returns A new object containing only the specified keys.
	 */
	static filterObjectFields<T extends MeetRecordingInfo | MeetRoom>(obj: T, fields?: string | string[]): Partial<T> {
		// If no fields are provided, return the full object.
		if (!fields || (typeof fields === 'string' && fields.trim().length === 0)) {
			return obj;
		}

		// Convert the string to an array if necessary.
		const fieldsArray = Array.isArray(fields) ? fields : fields.split(',').map((f) => f.trim());

		// Reduce the object by only including the specified keys.
		return fieldsArray.reduce((acc, field) => {
			if (Object.prototype.hasOwnProperty.call(obj, field)) {
				// Use keyof T to properly type the field access
				acc[field as keyof T] = obj[field as keyof T];
			}

			return acc;
		}, {} as Partial<T>);
	}
}
