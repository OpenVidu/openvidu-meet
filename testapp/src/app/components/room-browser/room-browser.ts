import { Component, computed, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccessRole, MeetApiService } from '../../services/meet-api';

/**
 * Lists the rooms the Meet API knows about so a room URL can be picked instead of
 * hunted down. Picking one hands the URL back to the caller; copying one leaves
 * the form untouched.
 */
@Component({
	selector: 'app-room-browser',
	imports: [FormsModule],
	templateUrl: './room-browser.html',
	styleUrl: './room-browser.css'
})
export class RoomBrowser {
	protected readonly api = inject(MeetApiService);

	/** Emitted with the access URL of the picked room. */
	readonly pick = output<string>();

	private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

	protected readonly role = signal<AccessRole>('moderator');
	protected readonly query = signal('');
	protected readonly copiedRoomId = signal<string | null>(null);

	protected readonly rows = computed(() => {
		const role = this.role();
		const query = this.query().trim().toLowerCase();

		return this.api
			.rooms()
			.filter((room) => !query || `${room.roomName} ${room.roomId}`.toLowerCase().includes(query))
			.map((room) => ({ ...room, url: room.urls[role] }));
	});

	async open(): Promise<void> {
		this.copiedRoomId.set(null);
		this.dialog().nativeElement.showModal();
		await this.api.loadRooms();
	}

	protected close(): void {
		this.dialog().nativeElement.close();
	}

	protected use(url: string): void {
		this.pick.emit(url);
		this.close();
	}

	protected async copy(roomId: string, url: string): Promise<void> {
		await navigator.clipboard?.writeText(url);
		this.copiedRoomId.set(roomId);
	}
}
