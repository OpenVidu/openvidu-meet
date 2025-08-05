import { CommonModule, DatePipe } from '@angular/common';
import {
	Component,
	EventEmitter,
	HostBinding,
	Input,
	OnChanges,
	OnInit,
	Output,
	signal,
	SimpleChanges
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRoom } from '@lib/typings/ce';
import { debounceTime, distinctUntilChanged } from 'rxjs';

export interface RoomTableAction {
	rooms: MeetRoom[];
	action:
		| 'create'
		| 'open'
		| 'edit'
		| 'copyModeratorLink'
		| 'copyPublisherLink'
		| 'viewRecordings'
		| 'delete'
		| 'bulkDelete';
}

/**
 * Reusable component for displaying a list of rooms with filtering, selection, and bulk operations.
 *
 * Features:
 * - Display rooms in a Material Design table
 * - Filter by room name and status
 * - Multi-selection for bulk operations
 * - Individual room actions (open, edit, copy links, view recordings, delete)
 * - Responsive design with mobile optimization
 * - Status-based styling using design tokens
 *
 * @example
 * ```html
 * <ov-rooms-lists
 *   [rooms]="rooms"
 *   [loading]="isLoading"
 *   [showFilters]="true"
 *   [showSelection]="true"
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
export class RoomsListsComponent implements OnInit, OnChanges {
	// Input properties
	@Input() rooms: MeetRoom[] = [];
	@Input() showFilters = false;
	@Input() showSelection = true;
	@Input() showLoadMore = false;
	@Input() loading = false;

	// Host binding for styling when rooms are selected
	@HostBinding('class.has-selections')
	get hasSelections(): boolean {
		return this.selectedRooms().size > 0;
	}

	// Output events
	@Output() roomAction = new EventEmitter<RoomTableAction>();
	@Output() filterChange = new EventEmitter<{ nameFilter: string; statusFilter: string }>();
	@Output() loadMore = new EventEmitter<void>();
	@Output() refresh = new EventEmitter<void>();

	// Filter controls
	nameFilterControl = new FormControl('');
	statusFilterControl = new FormControl('');

	// Selection state
	selectedRooms = signal<Set<string>>(new Set());
	allSelected = signal(false);
	someSelected = signal(false);

	// Table configuration
	displayedColumns: string[] = ['select', 'roomName', 'status', 'creationDate', 'autoDeletion', 'actions'];

	// Status options
	statusOptions = [
		{ value: '', label: 'All statuses' },
		{ value: 'active', label: 'Active' },
		{ value: 'inactive', label: 'Inactive' }
	];

	constructor() {}

	ngOnInit() {
		this.setupFilters();
		this.updateDisplayedColumns();
	}

	ngOnChanges(changes: SimpleChanges) {
		if (changes['rooms']) {
			const validIds = new Set(this.rooms.map((r) => r.roomId));
			const filteredSelection = new Set([...this.selectedRooms()].filter((id) => validIds.has(id)));
			this.selectedRooms.set(filteredSelection);
			this.updateSelectionState();
		}
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

		this.displayedColumns.push('roomName', 'status', 'creationDate', 'autoDeletion', 'actions');
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

	bulkDeleteSelected() {
		const selectedRooms = this.getSelectedRooms();
		if (selectedRooms.length > 0) {
			this.roomAction.emit({ rooms: selectedRooms, action: 'bulkDelete' });
		}
	}

	// ===== FILTER METHODS =====

	hasActiveFilters(): boolean {
		return !!(this.nameFilterControl.value || this.statusFilterControl.value);
	}

	clearFilters() {
		this.nameFilterControl.setValue('');
		this.statusFilterControl.setValue('');
	}

	// ===== STATUS UTILITY METHODS =====

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

	getStatusTooltip(room: MeetRoom): string {
		return room.markedForDeletion
			? 'Room is inactive and marked for deletion'
			: 'Room is active and accepting participants';
	}

	hasAutoDeletion(room: MeetRoom): boolean {
		return !!room.autoDeletionDate;
	}

	getAutoDeletionStatus(room: MeetRoom): string {
		if (room.markedForDeletion) {
			return 'Immediate';
		}
		return room.autoDeletionDate ? 'Scheduled' : 'Disabled';
	}

	getAutoDeletionIcon(room: MeetRoom): string {
		if (room.markedForDeletion) {
			return 'acute';
		}
		return room.autoDeletionDate ? 'auto_delete' : 'close';
	}

	getAutoDeletionClass(room: MeetRoom): string {
		if (room.markedForDeletion) {
			return 'auto-deletion-pending';
		}
		return room.autoDeletionDate ? 'auto-deletion-scheduled' : 'auto-deletion-not-scheduled';
	}

	getAutoDeletionTooltip(room: MeetRoom): string {
		if (room.markedForDeletion) {
			return 'Deletes when last participant leaves';
		}
		return room.autoDeletionDate
			? 'Auto-deletion scheduled'
			: 'No auto-deletion. Room remains until manually deleted';
	}
}
