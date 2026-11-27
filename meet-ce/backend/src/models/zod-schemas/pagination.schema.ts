import { z } from 'zod';

/** A page size: any positive number, rounded down to a whole number of items between 1 and 100. */
export const pageSizeSchema = z.coerce
	.number()
	.positive('maxItems must be a positive number')
	.transform((val) => Math.min(Math.max(Math.floor(val), 1), 100));

/** The page size of the lists that return 10 items by default. */
export const maxItemsSchema = pageSizeSchema.default(10);
