import { Component, inject, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestappConfigStore } from '../../services/testapp-config';
import { RoomBrowser } from '../room-browser/room-browser';

/**
 * Setup tab: the properties the embedded app is mounted with. Edits go straight
 * to the config store; applying them is the shell's job, since it owns the
 * remount.
 */
@Component({
	selector: 'app-setup-panel',
	imports: [FormsModule, RoomBrowser],
	templateUrl: './setup-panel.html',
	styleUrl: './setup-panel.css'
})
export class SetupPanel {
	protected readonly config = inject(TestappConfigStore);

	/** Emitted when the user asks for the current draft to be mounted. */
	readonly apply = output<void>();

	private readonly roomBrowser = viewChild.required(RoomBrowser);

	protected browseRooms(): void {
		void this.roomBrowser().open();
	}
}
