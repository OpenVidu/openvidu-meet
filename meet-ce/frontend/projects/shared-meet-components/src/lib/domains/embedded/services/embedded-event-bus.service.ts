import { inject, Injectable, signal } from '@angular/core';
import { EmbeddedEvent } from '@openvidu-meet/typings';
import { LoggerService } from '../../../shared/services/logger.service';

/**
 * Plumbing between the shared library and the Angular Elements `<openvidu-meet>`
 * webcomponent shell: a FIFO queue of lifecycle events ({@link events}) the shell
 * drains and re-emits as public DOM `CustomEvent`s (`joined`/`left`/`closed`).
 * Each is part of the host contract and must not be lost — Angular effects read only
 * the latest value when they flush, so same-tick emits on a single slot would coalesce;
 * the queue plus an ordered drain guarantees zero loss.
 *
 * View selection (the WC has no Angular Router) is driven separately by the
 * `WcRouterService`. Imperative commands live on `EmbeddedCommandService`
 * to keep this service in `shared/` and free of domain deps.
 */
@Injectable({
	providedIn: 'root'
})
export class EmbeddedEventBusService {
	private readonly log = inject(LoggerService).get('EmbeddedEventBusService');

	private readonly _events = signal<EmbeddedEvent[]>([]);

	/** Pending outbound host events, oldest first; the shell drains and re-emits each. */
	readonly events = this._events.asReadonly();

	/** Enqueue a lifecycle event for the host to re-emit as a public DOM `CustomEvent`. */
	emit(detail: EmbeddedEvent): void {
		this.log.d('Emitting embedded lifecycle event', detail);
		this._events.update((queue) => [...queue, detail]);
	}

	/**
	 * Remove and return all queued host events, oldest first. Events enqueued
	 * during draining (e.g. re-entrantly) stay queued and re-trigger the effect.
	 */
	drain(): EmbeddedEvent[] {
		const queued = this._events();
		if (queued.length === 0) {
			return queued;
		}
		this._events.set([]);
		return queued;
	}
}
