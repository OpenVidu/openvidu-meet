import express, { Router } from 'express';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { lkWebhookHandler } from '../controllers/livekit-webhook.controller.js';

export const livekitWebhookRouter: Router = Router();
livekitWebhookRouter.use(express.raw({ type: 'application/webhook+json', limit: INTERNAL_CONFIG.REQUEST_BODY_LIMIT }));

livekitWebhookRouter.post('/', lkWebhookHandler);
