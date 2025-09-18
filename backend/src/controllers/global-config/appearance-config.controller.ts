import { Request, Response } from 'express';
import { errorProFeature, rejectRequestFromMeetError } from '../../models/error.model.js';

export const updateAppearanceConfig = async (_req: Request, res: Response) => {
	const error = errorProFeature('update appearance config');
	rejectRequestFromMeetError(res, error);
};

export const getAppearanceConfig = async (_req: Request, res: Response) => {
	const error = errorProFeature('get appearance config');
	rejectRequestFromMeetError(res, error);
};
