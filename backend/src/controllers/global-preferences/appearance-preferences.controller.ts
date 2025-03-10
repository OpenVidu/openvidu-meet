import { Request, Response } from 'express';

export const updateAppearancePreferences = async (req: Request, res: Response) => {
	return res
		.status(402)
		.json({ message: 'Storing appearance preference is a PRO feature. Please, Updrade to OpenVidu PRO' });
};

export const getAppearancePreferences = async (req: Request, res: Response) => {
	return res
		.status(402)
		.json({ message: 'Getting appearance preference is a PRO feature. Please, Updrade to OpenVidu PRO' });
};
