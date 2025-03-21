import { Router } from 'express';
import bodyParser from 'body-parser';
import {
	getAppearancePreferences,
	updateAppearancePreferences
} from '../controllers/global-preferences/appearance-preferences.controller.js';
import { withAuth, tokenAndRoleValidator, apiKeyValidator } from '../middlewares/auth.middleware.js';
import { Role } from '@typings-ce';

export const preferencesRouter = Router();

preferencesRouter.use(bodyParser.urlencoded({ extended: true }));
preferencesRouter.use(bodyParser.json());

preferencesRouter.put(
	'/appearance',
	withAuth(apiKeyValidator, tokenAndRoleValidator(Role.ADMIN)),
	updateAppearancePreferences
);
preferencesRouter.get(
	'/appearance',
	withAuth(apiKeyValidator, tokenAndRoleValidator(Role.ADMIN)),
	getAppearancePreferences
);
