import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { PERMISSION_NAMING_HEADER } from '../helpers/permission-naming.helper.js';
import { rejectUnprocessableRequest } from '../models/error.model.js';

const PermissionNamingHeaderSchema = z
	.enum(['legacy', 'canonical'], {
		error: `${PERMISSION_NAMING_HEADER} must be 'legacy' or 'canonical'`
	})
	.optional();

/**
 * Parses the `X-Meet-Permission-Names` request header into `res.locals.permissionNaming`, which the
 * controllers hand to {@link PermissionNamingHelper} when serializing permission objects. Absent
 * header → `legacy` (the 3.8/3.9 default); an unknown value is a 422 rather than a silent fallback,
 * so a typo never quietly serves the naming the caller did not ask for. Removed in 3.12.0 together
 * with the legacy naming.
 */
export const parsePermissionNamingHeader = (req: Request, res: Response, next: NextFunction) => {
	const rawHeader = req.get(PERMISSION_NAMING_HEADER)?.trim().toLowerCase();
	const result = PermissionNamingHeaderSchema.safeParse(rawHeader);

	if (!result.success) {
		return rejectUnprocessableRequest(res, result.error);
	}

	res.locals.permissionNaming = result.data ?? 'legacy';
	return next();
};
