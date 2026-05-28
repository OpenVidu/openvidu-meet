/**
 * webhook-bridge.js
 *
 * Tiny Express + Socket.IO server that receives webhook POSTs from the Meet
 * backend and broadcasts them to any browser connected via Socket.IO. The
 * Angular dev server proxies `/webhook` and `/socket.io` to this process (see
 * `proxy.conf.json`), so from the backend's and the browser's perspective
 * everything still happens on `MEET_TESTAPP_URL` (default 5080).
 *
 * Pattern is a straight port of the legacy testapp:
 *   https://github.com/OpenVidu/openvidu-meet/blob/main/testapp/src/controllers/roomController.ts
 *
 * Run automatically as part of `pnpm run serve` / `pnpm run start` via
 * `concurrently`, or manually with `node scripts/webhook-bridge.js`.
 */

const express = require('express');
const http = require('node:http');
const { Server: IOServer } = require('socket.io');

const PORT = Number(process.env.TESTAPP_WEBHOOK_BRIDGE_PORT) || 5081;

const app = express();
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: '*' } });

app.post('/webhook', (req, res) => {
	const event = req.body;
	console.info(`[webhook-bridge] received: ${event?.event ?? 'unknown'}`);
	io.emit('webhookEvent', event);
	res.status(200).send('Webhook received');
});

app.get('/webhook/health', (_req, res) => res.json({ ok: true }));

server.listen(PORT, () => {
	console.info(`[webhook-bridge] listening on http://localhost:${PORT}`);
});
