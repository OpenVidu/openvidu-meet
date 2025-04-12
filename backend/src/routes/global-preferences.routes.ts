import { Router } from 'express';
import bodyParser from 'body-parser';
import * as appearancePrefCtrl from '../controllers/global-preferences/appearance-preferences.controller.js';
import * as webhookPrefCtrl from '../controllers/global-preferences/webhook-preferences.controller.js';
import * as securityPrefCtrl from '../controllers/global-preferences/security-preferences.controller.js';
import {
	validateSecurityPreferences,
	validateWebhookPreferences,
	withAuth,
	tokenAndRoleValidator
} from '../middlewares/index.js';
import { UserRole } from '@typings-ce';

export const preferencesRouter = Router();
preferencesRouter.use(bodyParser.urlencoded({ extended: true }));
preferencesRouter.use(bodyParser.json());

// Webhook preferences
preferencesRouter.put(
	'/webhooks',
	withAuth(tokenAndRoleValidator(UserRole.ADMIN)),
	validateWebhookPreferences,
	webhookPrefCtrl.updateWebhookPreferences
);
preferencesRouter.get(
	'/webhooks',
	withAuth(tokenAndRoleValidator(UserRole.ADMIN)),
	webhookPrefCtrl.getWebhookPreferences
);

// Security preferences
preferencesRouter.put(
	'/security',
	withAuth(tokenAndRoleValidator(UserRole.ADMIN)),
	validateSecurityPreferences,
	securityPrefCtrl.updateSecurityPreferences
);
preferencesRouter.get('/security', securityPrefCtrl.getSecurityPreferences);

// Appearance preferences
preferencesRouter.put(
	'/appearance',
	withAuth(tokenAndRoleValidator(UserRole.ADMIN)),
	appearancePrefCtrl.updateAppearancePreferences
);
preferencesRouter.get(
	'/appearance',
	withAuth(tokenAndRoleValidator(UserRole.ADMIN)),
	appearancePrefCtrl.getAppearancePreferences
);
