import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RoomRecordingsComponent } from './room-recordings.component';

/** Data contract for {@link RoomRecordingsDialogComponent}. */
export interface RoomRecordingsDialogData {
	roomId: string;
}

/**
 * Presents {@link RoomRecordingsComponent} inside a MatDialog. The web component
 * opens this when "view recordings" is clicked during a live meeting: it has no
 * standalone route to open in a new tab, so the recordings list is shown as an
 * overlay while the LiveKit session keeps running underneath.
 *
 * This component owns every dialog concern — `MatDialogRef`, dialog data, the
 * close affordance — so that {@link RoomRecordingsComponent} stays agnostic of
 * how it is presented (single-responsibility). It composes the page in its
 * embedded presentation mode and adds its own close button.
 */
@Component({
	selector: 'ov-room-recordings-dialog',
	imports: [RoomRecordingsComponent, MatButtonModule, MatIconModule],
	template: `
		<button mat-icon-button class="recordings-dialog-close" aria-label="Close recordings" (click)="close()">
			<mat-icon>close</mat-icon>
		</button>
		<ov-room-recordings [roomId]="data.roomId" [webcomponentMode]="true" />
	`,
	styles: `
		:host {
			position: relative;
			display: block;
			height: 100%;
		}

		.recordings-dialog-close {
			position: absolute;
			top: var(--ov-meet-spacing-sm);
			right: var(--ov-meet-spacing-sm);
			z-index: 1;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomRecordingsDialogComponent {
	private readonly dialogRef = inject(MatDialogRef);
	protected readonly data = inject<RoomRecordingsDialogData>(MAT_DIALOG_DATA);

	close(): void {
		this.dialogRef.close();
	}
}
