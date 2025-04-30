import { Request, Response } from 'express';
import { errorProFeature, rejectRequestFromMeetError } from '../../models/error.model.js';

export const updateAppearancePreferences = async (_req: Request, res: Response) => {
	const error = errorProFeature('update appearance preferences');
	rejectRequestFromMeetError(res, error);
};

export const getAppearancePreferences = async (_req: Request, res: Response) => {
	const error = errorProFeature('get appearance preferences');
	rejectRequestFromMeetError(res, error);
};
