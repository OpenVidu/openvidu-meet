import { z } from 'zod';

/** A page size: any positive number, rounded down to a whole number of items between 1 and 100. */
export const maxItemsSchema = z.coerce
	.number()
	.positive('maxItems must be a positive number')
	.transform((val) => Math.min(Math.max(Math.floor(val), 1), 100))
	.default(10);
