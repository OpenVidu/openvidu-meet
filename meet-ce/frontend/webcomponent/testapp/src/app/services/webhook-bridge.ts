import { DestroyRef, inject, Injectable } from '@angular/core';
import type { IOFactory, WebhookEventPayload } from '../models/webhook-event';
import { EventLogService } from './event-log';

/**
 * ⚠️ TEST-HARNESS SCAFFOLDING — NOT a web-component integration example.
 *
 * This service exists solely to feed the Playwright e2e suite. It connects to
 * the local webhook-bridge server (`scripts/webhook-bridge.js`, proxied at
 * `/socket.io` by `proxy.conf.js`) and, for every webhook the bridge
 * broadcasts, reproduces the exact DOM/storage contract the tests rely on:
 *
 *   1. A hidden `<li class="webhook-{event}">` appended under
 *      `<ul id="__wc-webhook-markers">` — consumed by `webhookLocator` /
 *      `expectWebhook` in `tests/helpers/testapp.helper.ts`.
 *   2. A `sessionStorage["webhookEventsByRoom"]` map of
 *      `{ [roomId]: WebhookEventPayload[] }` — consumed by
 *      `getWebhookFromStorage` in `tests/helpers/ui-utils.helper.ts`.
 *
 * Keep this isolated from `App` so the integration example stays clean. Changing
 * the marker class, the element id, or the storage key/shape will break e2e.
 */
@Injectable({ providedIn: 'root' })
export class WebhookBridgeService {
	private static readonly STORAGE_KEY = 'webhookEventsByRoom';
	private static readonly MARKERS_ID = '__wc-webhook-markers';

	private readonly destroyRef = inject(DestroyRef);
	private readonly eventLog = inject(EventLogService);

	/** Opens the Socket.IO connection and starts mirroring webhooks. */
	connect(): void {
		const io = (window as unknown as { io?: IOFactory }).io;

		if (typeof io !== 'function') {
			// The bridge is optional during dev; nothing to do if the script never loaded.
			console.warn('[testapp] window.io not found — webhook bridge inactive');
			return;
		}

		const socket = io();
		socket.on('webhookEvent', (event: WebhookEventPayload) => this.handleWebhookEvent(event));

		this.destroyRef.onDestroy(() => socket.disconnect());
	}

	private handleWebhookEvent(event: WebhookEventPayload): void {
		const name = event?.event ?? 'unknown';
		this.appendWebhookMarker(name, event);
		this.saveWebhookToSessionStorage(event);
		this.eventLog.log(`[webhook] ${name}`);
	}

	private saveWebhookToSessionStorage(event: WebhookEventPayload): void {
		const roomId = event?.data?.roomId;

		if (typeof roomId !== 'string' || !roomId) return;

		const raw = sessionStorage.getItem(WebhookBridgeService.STORAGE_KEY);
		const map: Record<string, WebhookEventPayload[]> = raw ? JSON.parse(raw) : {};

		if (!map[roomId]) {
			map[roomId] = [];
		}

		map[roomId].push(event);
		sessionStorage.setItem(WebhookBridgeService.STORAGE_KEY, JSON.stringify(map));
	}

	private appendWebhookMarker(name: string, event: WebhookEventPayload): void {
		let log = document.getElementById(WebhookBridgeService.MARKERS_ID);

		if (!log) {
			log = document.createElement('ul');
			log.id = WebhookBridgeService.MARKERS_ID;
			// Positioned off-viewport but with a real box so Playwright's
			// `toBeVisible()` passes on each child — same convention as the
			// `event-{name}` markers added by the e2e fixture's `ensureFixture`.
			log.style.cssText =
				'position:fixed;top:-9999px;left:0;width:auto;height:auto;pointer-events:none;margin:0;padding:0;list-style:none;';
			document.body.appendChild(log);
		}

		const li = document.createElement('li');
		li.className = `webhook-${name}`;

		try {
			li.textContent = JSON.stringify(event);
		} catch {
			li.textContent = '';
		}

		log.appendChild(li);
	}
}
