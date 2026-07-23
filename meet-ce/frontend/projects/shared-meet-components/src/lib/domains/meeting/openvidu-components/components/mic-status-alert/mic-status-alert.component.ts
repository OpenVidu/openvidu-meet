import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
	AfterViewInit,
	Component,
	ElementRef,
	OnDestroy,
	TemplateRef,
	ViewContainerRef,
	computed,
	effect,
	inject,
	input,
	signal,
	viewChild
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { MicActivityService } from '../../services/mic-activity/mic-activity.service';

type MicAlertKind = 'system-muted' | 'muted-speaking';

@Component({
	selector: 'ov-mic-status-alert',
	imports: [MatIconModule, TranslatePipe],
	templateUrl: './mic-status-alert.component.html',
	styleUrl: './mic-status-alert.component.scss'
})
export class MicStatusAlertComponent implements AfterViewInit, OnDestroy {
	/** Whether the microphone is enabled in-app (i.e. not muted by the user). */
	readonly micEnabled = input<boolean>(true);
	/**
	 * CSS selector (within this component's anchor) for the mic button the popup points at. The
	 * overlay connects to that element and the pointer is aligned to its center, so the bubble
	 * tracks the button wherever the toolbar reflows it. Resolved live, decoupled from the button's
	 * component type.
	 */
	readonly originSelector = input<string>();

	private readonly popupTpl = viewChild<TemplateRef<unknown>>('popupTpl');

	private readonly micActivity = inject(MicActivityService);
	private readonly overlay = inject(Overlay);
	private readonly host = inject(ElementRef<HTMLElement>);
	private readonly viewContainerRef = inject(ViewContainerRef);

	private readonly dismissedSystemMuted = signal(false);
	private readonly dismissedMutedSpeaking = signal(false);

	/**
	 * Latch: whether voice activity has been detected at least once during the current muted
	 * window. Set on the first detection and kept until the mic is toggled, so the popup stays
	 * up through speech pauses instead of flapping with `isSpeaking`.
	 */
	private readonly hasSpokenWhileMuted = signal(false);

	private readonly systemMutedCondition = computed(() => this.micActivity.active() && this.micActivity.systemMuted());

	/** Live "talking while muted" reading (flaps with speech); only used to arm the latch. */
	private readonly mutedSpeakingDetected = computed(
		() => !this.micEnabled() && this.micActivity.isSpeaking() && !this.micActivity.systemMuted()
	);

	/** Latched "talking while muted" state that drives the popup's visibility. */
	private readonly mutedSpeakingCondition = computed(
		() => !this.micEnabled() && this.hasSpokenWhileMuted() && !this.micActivity.systemMuted()
	);

	/** The OS-muted badge stays on the button even after the popup is dismissed. */
	protected readonly showBadge = this.systemMutedCondition;

	protected readonly activeAlert = computed<MicAlertKind | undefined>(() => {
		if (this.systemMutedCondition() && !this.dismissedSystemMuted()) {
			return 'system-muted';
		}
		if (this.mutedSpeakingCondition() && !this.dismissedMutedSpeaking()) {
			return 'muted-speaking';
		}
		return undefined;
	});

	private overlayRef?: OverlayRef;
	private bubbleResizeObserver?: ResizeObserver;
	private viewReady = false;

	constructor() {
		// Arm the latch the first time voice activity is detected while muted. It is never
		// cleared here, so the popup survives speech pauses until the user acts (see below).
		effect(() => {
			if (this.mutedSpeakingDetected()) {
				this.hasSpokenWhileMuted.set(true);
			}
		});

		// Re-arm the system-muted popup once the OS stops reporting the input as muted.
		effect(() => {
			if (!this.systemMutedCondition()) {
				this.dismissedSystemMuted.set(false);
			}
		});

		// Toggling the mic resets the whole "talking while muted" cycle: it clears the latch and
		// the dismissal so a fresh muted window can raise the warning again. Keying on the enabled
		// state covers "mute again" too, since re-muting requires unmuting first.
		effect(() => {
			if (this.micEnabled()) {
				this.hasSpokenWhileMuted.set(false);
				this.dismissedMutedSpeaking.set(false);
			}
		});

		// Attach/detach the popup overlay as the active alert appears/clears.
		effect(() => {
			if (this.activeAlert() && this.viewReady) {
				this.showOverlay();
			} else {
				this.hideOverlay();
			}
		});
	}

	ngAfterViewInit(): void {
		this.viewReady = true;
		if (this.activeAlert()) {
			this.showOverlay();
		}
	}

	ngOnDestroy(): void {
		this.bubbleResizeObserver?.disconnect();
		this.bubbleResizeObserver = undefined;
		this.overlayRef?.dispose();
		this.overlayRef = undefined;
	}

	protected dismiss(kind: MicAlertKind): void {
		if (kind === 'system-muted') {
			this.dismissedSystemMuted.set(true);
		} else {
			this.dismissedMutedSpeaking.set(true);
		}
	}

	private showOverlay(): void {
		const template = this.popupTpl();
		if (!template) {
			return;
		}

		if (!this.overlayRef) {
			// Connect to the mic button, preferring a spot above it and falling back below; push
			// into the viewport when either would overflow, so the bubble is never clipped near a
			// screen edge.
			const positionStrategy = this.overlay
				.position()
				.flexibleConnectedTo(this.resolveOrigin())
				.withPush(true)
				.withViewportMargin(8)
				.withPositions([
					{ originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -12 },
					{ originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 12 }
				]);

			// Re-aim the pointer at the button after each (re)position / push.
			positionStrategy.positionChanges.subscribe(() => this.syncArrow());

			this.overlayRef = this.overlay.create({
				positionStrategy,
				scrollStrategy: this.overlay.scrollStrategies.reposition()
			});
		}

		if (!this.overlayRef.hasAttached()) {
			this.overlayRef.attach(new TemplatePortal(template, this.viewContainerRef));
			// The portal content renders asynchronously (zoneless), so its box has no size on the
			// current frame. A ResizeObserver on the overlay pane fires once the bubble gets
			// dimensions — and again if the content height changes — which is when we can aim the
			// pointer. positionChanges above handles later repositions (scroll / viewport resize).
			this.observeBubbleSize();
		}
	}

	private observeBubbleSize(): void {
		if (typeof ResizeObserver === 'undefined' || !this.overlayRef) {
			return;
		}
		this.bubbleResizeObserver?.disconnect();
		this.bubbleResizeObserver = new ResizeObserver(() => this.syncArrow());
		this.bubbleResizeObserver.observe(this.overlayRef.overlayElement);
	}

	private hideOverlay(): void {
		this.bubbleResizeObserver?.disconnect();
		this.bubbleResizeObserver = undefined;
		if (this.overlayRef?.hasAttached()) {
			this.overlayRef.detach();
		}
	}

	private resolveOrigin(): HTMLElement {
		const anchor = this.host.nativeElement.parentElement;
		const selector = this.originSelector();
		const button = selector && anchor ? (anchor.querySelector(selector) as HTMLElement | null) : null;
		return button ?? anchor ?? this.host.nativeElement;
	}

	/**
	 * Aims the pointer at the mic button and flips it up/down to match the bubble's placement.
	 *
	 * Applied imperatively to the DOM (not through a signal binding): this runs from the CDK
	 * position callback and a ResizeObserver, i.e. outside Angular's change detection, so a
	 * declarative binding would not reliably refresh the projected overlay view. Measured from live
	 * rects, so it stays correct as the toolbar reflows and the button moves, and clamps the pointer
	 * to the bubble so it never detaches from the card.
	 */
	private syncArrow(): void {
		const bubble = this.overlayRef?.overlayElement.querySelector('.mic-status-alert') as HTMLElement | null;
		const pointer = bubble?.querySelector('.alert-pointer') as HTMLElement | null;
		const originEl = this.resolveOrigin();
		if (!bubble || !pointer || !originEl) {
			return;
		}
		const bubbleRect = bubble.getBoundingClientRect();
		const originRect = originEl.getBoundingClientRect();
		if (bubbleRect.width === 0) {
			return;
		}

		// Flip the pointer to the top edge when the bubble sits below the button.
		bubble.classList.toggle('below', bubbleRect.top >= originRect.bottom);

		const originCenterX = originRect.left + originRect.width / 2;
		const EDGE = 14; // keep the arrow away from the rounded corners
		const offset = Math.max(EDGE, Math.min(bubbleRect.width - EDGE, originCenterX - bubbleRect.left));
		pointer.style.left = `${Math.round(offset)}px`;
	}
}
