import { inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../../domains/meeting/openvidu-components';
import { WcEvent, WcNavigationRequest } from '../models/webcomponent-bridge.model';

/**
 * Plumbing between the shared library and the Angular Elements
 * `<openvidu-meet>` webcomponent shell. The WC has no Angular Router, so domain
 * code drives the shell through two channels here, shaped differently on purpose:
 *
 * - {@link wcEvents} (domain → host): a FIFO queue of lifecycle events the shell
 *   re-emits as public DOM `CustomEvent`s. Each is part of the host contract and
 *   must not be lost — Angular effects read only the latest value when they
 *   flush, so same-tick emits on a single slot would coalesce. The queue plus an
 *   ordered drain guarantees zero loss.
 * - {@link navigationRequest} (domain → shell): the latest internal view swap.
 *   User-driven and never co-occurring, so last-wins on a single slot is correct
 *   and a queue would be over-engineering.
 *
 * Emitters: navigation from `NavigationService` (single WC-vs-SPA branch),
 * lifecycle events (`joined`/`left`) from the meeting domain. Imperative commands
 * live on `MeetingWebComponentManagerService` to keep this service in `shared/`
 * and free of domain deps.
 */
@Injectable({
	providedIn: 'root'
})
export class WebComponentBridgeService {
	private readonly log = inject(LoggerService).get('WebComponentBridgeService');

	private readonly _wcEvents = signal<WcEvent[]>([]);
	private readonly _navigationRequest = signal<WcNavigationRequest | null>(null);

	/** Pending outbound host events, oldest first; the shell drains and re-emits each. */
	readonly wcEvents = this._wcEvents.asReadonly();

	/** Latest internal navigation request, or `null`; the shell observes it and swaps its view. */
	readonly navigationRequest = this._navigationRequest.asReadonly();

	/** Enqueue a lifecycle event for the host to re-emit as a public DOM `CustomEvent`. */
	emitWebComponentEvent(detail: WcEvent): void {
		this.log.d('Emitting WC event', detail);
		this._wcEvents.update((queue) => [...queue, detail]);
	}

	/** Request a view swap, mirroring a router navigation the WC cannot perform. */
	emitNavigationRequest(detail: WcNavigationRequest): void {
		this.log.d('Emitting navigation request', detail);
		// Fresh reference per emit so repeats with identical payloads still notify.
		this._navigationRequest.set({ ...detail });
	}

	/** Clear the active navigation request so the shell falls back to its attribute-derived view. */
	clearNavigationRequest(): void {
		this.log.d('Clearing navigation request');
		this._navigationRequest.set(null);
	}

	/**
	 * Remove and return all queued host events, oldest first. Events enqueued
	 * during draining (e.g. re-entrantly) stay queued and re-trigger the effect.
	 */
	drainWebComponentEvents(): WcEvent[] {
		const queued = this._wcEvents();
		if (queued.length === 0) {
			return queued;
		}
		this._wcEvents.set([]);
		return queued;
	}
}
