import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { inject, Injector, Service, signal } from '@angular/core';
import { NotificationsComponent } from '../components/notifications/notifications.component';
import { NotificationOptions, NotificationText, ShownNotification } from '../models/notification.model';

/** Long enough to read a line, short enough not to sit on top of the screen behind it. */
const MESSAGE_DURATION_MS = 4_000;

/** The corner stack is as wide as its longest notification, up to this, and never wider than the screen. */
const CORNER_STACK_MAX_WIDTH = '360px';
const CORNER_STACK_OFFSET = '16px';

/**
 * Says things to the user without stopping what they are doing. What has to stop them until they
 * answer is a dialog, and belongs to {@link DialogService}.
 *
 * Every notification looks the same wherever it is raised; only where it is stacked differs, which
 * is what {@link NotificationPlacement} chooses. The corner stack is put up here, on first use, so a
 * screen can raise a notification without hosting an outlet of its own.
 */
@Service()
export class NotificationService {
	private readonly overlay = inject(Overlay);
	private readonly injector = inject(Injector);

	private lastNotificationId = 0;
	private readonly notificationTimers = new Map<number, ReturnType<typeof setTimeout>>();
	private cornerStack: OverlayRef | undefined;

	private readonly _notifications = signal<ShownNotification[]>([]);

	/**
	 * The notifications currently on screen, oldest first. Rendered by the `ov-notifications` outlets,
	 * each of which takes the ones stacked where it is.
	 */
	readonly notifications = this._notifications.asReadonly();

	/**
	 * Shows a notification and returns its id, which the caller keeps to take it away again. One with
	 * no `durationMs` stays until it is dismissed, by the participant or by whoever raised it.
	 */
	showNotification(options: NotificationOptions): number {
		if ((options.placement ?? 'corner') === 'corner') {
			this.openCornerStack();
		}

		const id = ++this.lastNotificationId;
		this._notifications.update((notifications) => [...notifications, { ...options, id }]);

		if (options.durationMs !== undefined) {
			this.notificationTimers.set(
				id,
				setTimeout(() => this.dismissNotification(id), options.durationMs)
			);
		}

		return id;
	}

	/** A line of text in the corner, for anything a screen has nowhere of its own to say. */
	showMessage(message: NotificationText): number {
		return this.showNotification({ kind: 'message', icon: 'info', message, durationMs: MESSAGE_DURATION_MS });
	}

	/** Takes a notification away. Dismissing one that is already gone does nothing. */
	dismissNotification(id: number): void {
		const timer = this.notificationTimers.get(id);

		if (timer !== undefined) {
			clearTimeout(timer);
			this.notificationTimers.delete(id);
		}

		this._notifications.update((notifications) => notifications.filter((notification) => notification.id !== id));
	}

	/**
	 * Hangs the corner stack in the CDK overlay container, which the meeting re-parents into the
	 * fullscreen element and the web component into its shadow root, so the stack follows both.
	 */
	private openCornerStack(): void {
		if (this.cornerStack) return;

		this.cornerStack = this.overlay.create({
			positionStrategy: this.overlay.position().global().top(CORNER_STACK_OFFSET).right(CORNER_STACK_OFFSET),
			maxWidth: `min(${CORNER_STACK_MAX_WIDTH}, calc(100vw - 2 * ${CORNER_STACK_OFFSET}))`
		});
		this.cornerStack
			.attach(new ComponentPortal(NotificationsComponent, null, this.injector))
			.setInput('placement', 'corner');
	}
}
