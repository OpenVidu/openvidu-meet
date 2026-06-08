import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RoomRecordingsComponent } from './room-recordings.component';

/**
 * Presents {@link RoomRecordingsComponent} as a modal overlay rendered *inside*
 * the meeting layout — and therefore inside the `<openvidu-meet>` shadow DOM —
 * rather than as a viewport-level CDK dialog. This keeps the overlay scoped to
 * the element: it can never spill over the host page, and the host page's own UI
 * stays interactive around it (a viewport backdrop would block it).
 *
 * It owns every modal concern — backdrop, focus trap, close affordances (ESC /
 * backdrop click / button → `closed`), ARIA — so {@link RoomRecordingsComponent}
 * stays agnostic of how it is presented. The shell toggles it via a signal in
 * `MeetingComponent`.
 *
 * The host element is the backdrop; the `:host` fills its positioned ancestor
 * (the meeting `:host`), so it covers exactly the meeting area.
 */
@Component({
	selector: 'ov-room-recordings-overlay',
	imports: [A11yModule, MatButtonModule, MatIconModule, RoomRecordingsComponent],
	template: `
		<div
			class="recordings-overlay-panel"
			role="dialog"
			aria-modal="true"
			aria-label="Room recordings"
			cdkTrapFocus
			[cdkTrapFocusAutoCapture]="true"
			(click)="$event.stopPropagation()"
		>
			<button
				mat-icon-button
				class="recordings-overlay-close"
				aria-label="Close recordings"
				(click)="closed.emit()"
			>
				<mat-icon>close</mat-icon>
			</button>

			<ov-room-recordings [roomId]="roomId()" [webcomponentMode]="true" [showBackButton]="false" />
		</div>
	`,
	styles: `
		:host {
			position: absolute;
			inset: 0;
			z-index: 1000;
			display: flex;
			align-items: center;
			justify-content: center;
			background: rgba(0, 0, 0, 0.6);
		}

		.recordings-overlay-panel {
			position: relative;
			width: 90%;
			height: 90%;
			overflow: hidden;
			background: var(--ov-surface-color, var(--ov-meet-background-color));
			/* Same corner radius as the activity panel (openvidu theme variable). */
			border-radius: var(--ov-surface-radius, 8px);
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
		}

		.recordings-overlay-panel ov-room-recordings {
			display: block;
			height: 100%;
		}

		.recordings-overlay-close {
			position: absolute;
			top: var(--ov-meet-spacing-sm);
			right: var(--ov-meet-spacing-sm);
			z-index: 1;
		}
	`,
	host: {
		// Marks the overlay subtree for the slim-scrollbar rule in the shadow-root
		// stylesheet (which can reach nested components' scroll areas).
		class: 'ov-recordings-overlay',
		'(click)': 'closed.emit()',
		'(keydown.escape)': 'closed.emit()'
	},
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomRecordingsOverlayComponent {
	/** Room whose recordings are listed. */
	readonly roomId = input.required<string>();

	/** Emitted when the overlay should close (backdrop click, close button or ESC). */
	readonly closed = output<void>();
}
