import { CommonModule, DatePipe } from '@angular/common';
import { Component, effect, EventEmitter, HostBinding, input, OnInit, Output, signal, untracked } from '@angular/core';
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
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRoom, MeetRoomStatus, SortOrder } from '@openvidu-meet/typings';
import { setsAreEqual } from '../../../../shared/utils/array.utils';
import { RoomUiUtils } from '../../utils/ui';

export interface RoomTableAction {
	rooms: MeetRoom[];
	action:
		| 'create'
		| 'open'
		| 'edit'
		| 'copyModeratorLink'
		| 'copySpeakerLink'
		| 'viewRecordings'
		| 'reopen'
		| 'close'
		| 'delete'
		| 'bulkDelete';
}

export interface RoomTableFilter {
	nameFilter: string;
	statusFilter: MeetRoomStatus | '';
	sortField: 'roomName' | 'creationDate' | 'autoDeletionDate';
	sortOrder: SortOrder;
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
		MatSortModule,
		DatePipe
	],
	templateUrl: './rooms-lists.component.html',
	styleUrl: './rooms-lists.component.scss'
})
export class RoomsListsComponent implements OnInit {
	rooms = input<MeetRoom[]>([]);
	showSearchBox = input(true);
	showFilters = input(true);
	showSelection = input(true);
	showLoadMore = input(false);
	loading = input(false);
	initialFilters = input<RoomTableFilter>({
		nameFilter: '',
		statusFilter: '',
		sortField: 'creationDate',
		sortOrder: SortOrder.DESC
	});

	// Host binding for styling when rooms are selected
	@HostBinding('class.has-selections')
	get hasSelections(): boolean {
		return this.selectedRooms().size > 0;
	}

	// Output events
	@Output() roomAction = new EventEmitter<RoomTableAction>();
	@Output() filterChange = new EventEmitter<RoomTableFilter>();
	@Output() loadMore = new EventEmitter<RoomTableFilter>();
	@Output() refresh = new EventEmitter<RoomTableFilter>();
	@Output() roomClicked = new EventEmitter<string>();

	// Filter controls
	nameFilterControl = new FormControl('');
	statusFilterControl = new FormControl('');

	// Sort state
	currentSortField: 'roomName' | 'creationDate' | 'autoDeletionDate' = 'creationDate';
	currentSortOrder: SortOrder = SortOrder.DESC;

	showEmptyFilterMessage = false; // Show message when no rooms match filters

	// Selection state
	selectedRooms = signal<Set<string>>(new Set());
	allSelected = signal(false);
	someSelected = signal(false);

	// Table configuration
	displayedColumns: string[] = ['select', 'roomName', 'status', 'creationDate', 'autoDeletion', 'actions'];

	// Status options
	statusOptions = [
		{ value: '', label: 'All statuses' },
		{ value: MeetRoomStatus.OPEN, label: 'Open' },
		{ value: MeetRoomStatus.ACTIVE_MEETING, label: 'Active Meeting' },
		{ value: MeetRoomStatus.CLOSED, label: 'Closed' }
	];

	// Make RoomUiUtils available in template
	protected readonly RoomUiUtils = RoomUiUtils;

	constructor() {
		effect(() => {
			// Update selected rooms based on current rooms
			const rooms = this.rooms();
			const validRoomIds = new Set(rooms.map((r) => r.roomId));

			// Use untracked to avoid creating a reactive dependency on selectedRooms
			const currentSelection = untracked(() => this.selectedRooms());
			const filteredSelection = new Set([...currentSelection].filter((id) => validRoomIds.has(id)));

			// Only update if the selection has actually changed
			if (!setsAreEqual(filteredSelection, currentSelection)) {
				this.selectedRooms.set(filteredSelection);
				this.updateSelectionState();
			}

			// Show message when no rooms match filters
			this.showEmptyFilterMessage = rooms.length === 0 && this.hasActiveFilters();
		});
	}

	ngOnInit() {
		this.setupFilters();
		this.updateDisplayedColumns();
	}

	// ===== INITIALIZATION METHODS =====

	private setupFilters() {
		// Initialize from initialFilters input
		this.nameFilterControl.setValue(this.initialFilters().nameFilter);
		this.statusFilterControl.setValue(this.initialFilters().statusFilter);
		this.currentSortField = this.initialFilters().sortField;
		this.currentSortOrder = this.initialFilters().sortOrder;

		// Set up name filter change detection
		this.nameFilterControl.valueChanges.subscribe((value) => {
			// Emit filter change if value is empty
			if (!value) {
				this.emitFilterChange();
			}
		});

		// Set up status filter change detection
		this.statusFilterControl.valueChanges.subscribe(() => {
			this.emitFilterChange();
		});
	}

	private updateDisplayedColumns() {
		this.displayedColumns = [];

		if (this.showSelection()) {
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
			this.rooms().forEach((room) => {
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
		const selectableRooms = this.rooms().filter((r) => this.canSelectRoom(r));
		const selectedCount = this.selectedRooms().size;
		const selectableCount = selectableRooms.length;

		this.allSelected.set(selectedCount > 0 && selectedCount === selectableCount);
		this.someSelected.set(selectedCount > 0 && selectedCount < selectableCount);
	}

	isRoomSelected(room: MeetRoom): boolean {
		return this.selectedRooms().has(room.roomId);
	}

	canSelectRoom(_room: MeetRoom): boolean {
		return true;
	}

	getSelectedRooms(): MeetRoom[] {
		const selected = this.selectedRooms();
		return this.rooms().filter((r) => selected.has(r.roomId));
	}

	// ===== ACTION METHODS =====

	createRoom() {
		this.roomAction.emit({ rooms: [], action: 'create' });
	}

	openRoom(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'open' });
	}

	onRoomClick(room: MeetRoom) {
		this.roomClicked.emit(room.roomId);
	}

	editRoom(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'edit' });
	}

	copyModeratorLink(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'copyModeratorLink' });
	}

	copySpeakerLink(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'copySpeakerLink' });
	}

	viewRecordings(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'viewRecordings' });
	}

	toggleRoomStatus(room: MeetRoom) {
		if (room.status !== MeetRoomStatus.CLOSED) {
			this.roomAction.emit({ rooms: [room], action: 'close' });
		} else {
			this.roomAction.emit({ rooms: [room], action: 'reopen' });
		}
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

	loadMoreRooms() {
		const nameFilter = this.nameFilterControl.value || '';
		const statusFilter = (this.statusFilterControl.value || '') as MeetRoomStatus | '';
		this.loadMore.emit({
			nameFilter,
			statusFilter,
			sortField: this.currentSortField,
			sortOrder: this.currentSortOrder
		});
	}

	refreshRooms() {
		const nameFilter = this.nameFilterControl.value || '';
		const statusFilter = (this.statusFilterControl.value || '') as MeetRoomStatus | '';
		this.refresh.emit({
			nameFilter,
			statusFilter,
			sortField: this.currentSortField,
			sortOrder: this.currentSortOrder
		});
	}

	onSortChange(sortState: Sort) {
		this.currentSortField = sortState.active as 'roomName' | 'creationDate' | 'autoDeletionDate';
		this.currentSortOrder = sortState.direction === 'asc' ? SortOrder.ASC : SortOrder.DESC;
		this.emitFilterChange();
	}

	// ===== FILTER METHODS =====

	triggerSearch() {
		this.emitFilterChange();
	}

	private emitFilterChange() {
		this.filterChange.emit({
			nameFilter: this.nameFilterControl.value || '',
			statusFilter: (this.statusFilterControl.value || '') as MeetRoomStatus | '',
			sortField: this.currentSortField,
			sortOrder: this.currentSortOrder
		});
	}

	hasActiveFilters(): boolean {
		return !!(this.nameFilterControl.value || this.statusFilterControl.value);
	}

	clearFilters() {
		this.nameFilterControl.setValue('');
		this.statusFilterControl.setValue('');
	}
}
