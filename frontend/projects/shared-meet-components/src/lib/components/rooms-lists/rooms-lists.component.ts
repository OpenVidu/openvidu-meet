import { CommonModule, DatePipe } from '@angular/common';
import { Component, EventEmitter, HostBinding, Input, OnInit, Output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { ActionService } from 'openvidu-components-angular';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Clipboard } from '@angular/cdk/clipboard';
import { HttpService, NotificationService } from '../../services';
import { MeetRoom } from '../../typings/ce';

export interface RoomTableAction {
	rooms: MeetRoom[];
	action:
		| 'refresh'
		| 'create'
		| 'open'
		| 'edit'
		| 'settings'
		| 'copyModeratorLink'
		| 'copyPublisherLink'
		| 'viewRecordings'
		| 'delete'
		| 'batchDelete';
}

/**
 * Reusable component for displaying a list of rooms with filtering, selection, and batch operations.
 *
 * Features:
 * - Display rooms in a Material Design table
 * - Filter by room name and status
 * - Multi-selection for batch operations
 * - Individual room actions (open, settings, copy links, view recordings, delete)
 * - Responsive design with mobile optimization
 * - Status-based styling using design tokens
 *
 * @example
 * ```html
 * <ov-rooms-lists
 *   [rooms]="rooms"
 *   [canDeleteRooms]="true"
 *   [loading]="isLoading"
 *   [showFilters]="true"
 *   [showSelection]="true"
 *   emptyMessage="No rooms found"
 *   (roomAction)="handleRoomAction($event)"
 *   (filterChange)="handleFilterChange($event)"
 *   (refresh)="refreshRooms()">
 * </ov-rooms-lists>
 * ```
 */

@Component({
	selector: 'ov-rooms-lists',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatTableModule,
		MatCheckboxModule,
		MatButtonModule,
		MatIconModule,
		MatFormFieldModule,
		MatInputModule,
		MatSelectModule,
		MatMenuModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatToolbarModule,
		MatBadgeModule,
		MatDividerModule,
		DatePipe
	],
	templateUrl: './rooms-lists.component.html',
	styleUrl: './rooms-lists.component.scss'
})
export class RoomsListsComponent implements OnInit {
	// Input properties
	@Input() rooms: MeetRoom[] = [];
	@Input() canCreateRooms = true;
	@Input() showFilters = false;
	@Input() showSelection = true;
	@Input() loading = false;
	@Input() emptyMessage = 'No rooms found';

	// Host binding for styling when rooms are selected
	@HostBinding('class.has-selections')
	get hasSelections(): boolean {
		return this.selectedRooms().size > 0;
	}

	// Output events
	@Output() roomAction = new EventEmitter<RoomTableAction>();
	@Output() filterChange = new EventEmitter<{ nameFilter: string; statusFilter: string }>();

	// Filter controls
	nameFilterControl = new FormControl('');
	statusFilterControl = new FormControl('');

	// Selection state
	selectedRooms = signal<Set<string>>(new Set());
	allSelected = signal(false);
	someSelected = signal(false);

	// Table configuration
	displayedColumns: string[] = ['select', 'roomId', 'status', 'creationDate', 'autoDeletion', 'actions'];

	// Status options
	statusOptions = [
		{ value: '', label: 'All statuses' },
		{ value: 'active', label: 'Active' },
		{ value: 'inactive', label: 'Inactive' }
	];

	// Room status groups for different states
	private static readonly STATUS_GROUPS = {
		ACTIVE: ['active'] as readonly string[],
		INACTIVE: ['inactive'] as readonly string[],
		SELECTABLE: ['active', 'inactive'] as readonly string[]
	} as const;

	constructor(
		private dialog: MatDialog,
		private httpService: HttpService,
		private actionService: ActionService,
		private clipboard: Clipboard,
		private notificationService: NotificationService
	) {}

	ngOnInit() {
		this.setupFilters();
		this.updateDisplayedColumns();
	}

	// ===== INITIALIZATION METHODS =====

	private setupFilters() {
		// Set up name filter with debounce
		this.nameFilterControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe((value) => {
			this.filterChange.emit({
				nameFilter: value || '',
				statusFilter: this.statusFilterControl.value || ''
			});
		});

		// Set up status filter
		this.statusFilterControl.valueChanges.subscribe((value) => {
			this.filterChange.emit({
				nameFilter: this.nameFilterControl.value || '',
				statusFilter: value || ''
			});
		});
	}

	private updateDisplayedColumns() {
		this.displayedColumns = [];

		if (this.showSelection) {
			this.displayedColumns.push('select');
		}

		this.displayedColumns.push('roomId', 'status', 'creationDate', 'autoDeletion', 'actions');
	}

	// ===== SELECTION METHODS =====
	toggleAllSelection() {
		const selected = this.selectedRooms();
		if (this.allSelected()) {
			selected.clear();
		} else {
			this.rooms.forEach((room) => {
				if (this.canSelectRoom(room)) {
					selected.add(room.roomId);
				}
			});
		}
		this.selectedRooms.set(new Set(selected));
		this.updateSelectionState();
	}

	toggleRoomSelection(room: MeetRoom) {
		const selected = this.selectedRooms();
		if (selected.has(room.roomId)) {
			selected.delete(room.roomId);
		} else {
			selected.add(room.roomId);
		}
		this.selectedRooms.set(new Set(selected));
		this.updateSelectionState();
	}

	private updateSelectionState() {
		const selectableRooms = this.rooms.filter((r) => this.canSelectRoom(r));
		const selectedCount = this.selectedRooms().size;
		const selectableCount = selectableRooms.length;

		this.allSelected.set(selectedCount > 0 && selectedCount === selectableCount);
		this.someSelected.set(selectedCount > 0 && selectedCount < selectableCount);
	}

	isRoomSelected(room: MeetRoom): boolean {
		return this.selectedRooms().has(room.roomId);
	}

	canSelectRoom(room: MeetRoom): boolean {
		return !room.markedForDeletion; // Only active rooms can be selected
	}

	getSelectedRooms(): MeetRoom[] {
		const selected = this.selectedRooms();
		return this.rooms.filter((r) => selected.has(r.roomId));
	}

	// ===== ACTION METHODS =====

	refreshRooms() {
		this.roomAction.emit({ rooms: [], action: 'refresh' });
	}

	createRoom() {
		this.roomAction.emit({ rooms: [], action: 'create' });
	}
	openRoom(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'open' });
	}

	editRoom(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'edit' });
	}

	copyModeratorLink(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'copyModeratorLink' });
	}

	copyPublisherLink(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'copyPublisherLink' });
	}

	viewRecordings(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'viewRecordings' });
	}

	deleteRoom(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'delete' });
	}

	batchDeleteSelected() {
		const selectedRooms = this.getSelectedRooms();
		if (selectedRooms.length > 0) {
			this.roomAction.emit({ rooms: selectedRooms, action: 'batchDelete' });
		}
	}

	clearSelection() {
		this.selectedRooms.set(new Set());
		this.updateSelectionState();
	}

	// ===== STATUS UTILITY METHODS =====

	/**
	 * Check if a room is active (not marked for deletion)
	 */
	isRoomActive(room: MeetRoom): boolean {
		return !room.markedForDeletion;
	}

	/**
	 * Check if a room is inactive (marked for deletion)
	 */
	isRoomInactive(room: MeetRoom): boolean {
		return !!room.markedForDeletion;
	}

	/**
	 * Get room status label
	 */
	getRoomStatus(room: MeetRoom): string {
		return room.markedForDeletion ? 'INACTIVE' : 'ACTIVE';
	}

	// ===== PERMISSION AND CAPABILITY METHODS =====

	canOpenRoom(room: MeetRoom): boolean {
		return !room.markedForDeletion;
	}

	canEditRoom(room: MeetRoom): boolean {
		return !room.markedForDeletion;
	}

	// ===== UI HELPER METHODS =====

	getStatusIcon(room: MeetRoom): string {
		return room.markedForDeletion ? 'delete_outline' : 'check_circle';
	}

	getStatusColor(room: MeetRoom): string {
		if (room.markedForDeletion) {
			return 'var(--ov-meet-color-error)';
		}
		return 'var(--ov-meet-color-success)';
	}

	hasAutoDeletion(room: MeetRoom): boolean {
		return !!room.autoDeletionDate;
	}

	getAutoDeletionStatus(room: MeetRoom): string {
		return room.autoDeletionDate ? 'Scheduled' : 'Not scheduled';
	}

	getAutoDeletionIcon(room: MeetRoom): string {
		return room.autoDeletionDate ? 'auto_delete' : 'close';
	}

	getAutoDeletionTooltip(room: MeetRoom): string {
		return room.autoDeletionDate ? 'Scheduled for auto deletion' : 'The room is not scheduled for auto deletion';
	}
}
