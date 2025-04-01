import { Router } from 'express';
import bodyParser from 'body-parser';
import * as appearancePrefCtrl from '../controllers/global-preferences/appearance-preferences.controller.js';
import * as webhookPrefCtrl from '../controllers/global-preferences/webhook-preferences.controller.js';
import * as securityPrefCtrl from '../controllers/global-preferences/security-preferences.controller.js';
import { withAuth, tokenAndRoleValidator, apiKeyValidator } from '../middlewares/auth.middleware.js';
import { UserRole } from '@typings-ce';
import {
	validateSecurityPreferences,
	validateWebhookPreferences
} from '../middlewares/request-validators/preferences-validator.middleware.js';

export const preferencesRouter = Router();
preferencesRouter.use(bodyParser.urlencoded({ extended: true }));
preferencesRouter.use(bodyParser.json());

// Webhook preferences
preferencesRouter.put(
	'/webhooks',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	validateWebhookPreferences,
	webhookPrefCtrl.updateWebhookPreferences
);
preferencesRouter.get(
	'/webhooks',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	webhookPrefCtrl.getWebhookPreferences
);

// Security preferences
preferencesRouter.put(
	'/security',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	validateSecurityPreferences,
	securityPrefCtrl.updateSecurityPreferences
);
preferencesRouter.get('/security', securityPrefCtrl.getSecurityPreferences);

// Appearance preferences
preferencesRouter.put(
	'/appearance',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	appearancePrefCtrl.updateAppearancePreferences
);
preferencesRouter.get(
	'/appearance',
	withAuth(apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)),
	appearancePrefCtrl.getAppearancePreferences
);