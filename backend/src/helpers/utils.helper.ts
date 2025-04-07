export class UtilsHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	static filterObjectFields = (obj: Record<string, unknown>, fields: string[]): Record<string, any> => {
		return fields.reduce(
			(acc, field) => {
				if (Object.prototype.hasOwnProperty.call(obj, field)) {
					acc[field] = obj[field];
				}

				return acc;
			},
			{} as Record<string, unknown>
		);
	};
}
