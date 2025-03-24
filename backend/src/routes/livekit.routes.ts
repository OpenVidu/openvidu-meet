import express, { Router } from 'express';
import { lkWebhookHandler } from '../controllers/livekit-webhook.controller.js';

const livekitWebhookRouter = Router();

livekitWebhookRouter.use(express.raw({ type: 'application/webhook+json' }));
livekitWebhookRouter.post('/', lkWebhookHandler);

export { livekitWebhookRouter };
