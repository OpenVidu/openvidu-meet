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
import { MeetingEndAction, MeetRoom, MeetRoomStatus } from '@openvidu-meet/typings';

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
		DatePipe
	],
	templateUrl: './rooms-lists.component.html',
	styleUrl: './rooms-lists.component.scss'
})
export class RoomsListsComponent implements OnInit, OnChanges {
	// Input properties
	@Input() rooms: MeetRoom[] = [];
	@Input() showSearchBox = true;
	@Input() showFilters = true;
	@Input() showSelection = true;
	@Input() showLoadMore = false;
	@Input() loading = false;
	@Input() initialFilters: { nameFilter: string; statusFilter: string } = { nameFilter: '', statusFilter: '' };

	// Host binding for styling when rooms are selected
	@HostBinding('class.has-selections')
	get hasSelections(): boolean {
		return this.selectedRooms().size > 0;
	}

	// Output events
	@Output() roomAction = new EventEmitter<RoomTableAction>();
	@Output() filterChange = new EventEmitter<{ nameFilter: string; statusFilter: string }>();
	@Output() loadMore = new EventEmitter<{ nameFilter: string; statusFilter: string }>();
	@Output() refresh = new EventEmitter<{ nameFilter: string; statusFilter: string }>();

	// Filter controls
	nameFilterControl = new FormControl('');
	statusFilterControl = new FormControl('');

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

	constructor() {}

	ngOnInit() {
		this.setupFilters();
		this.updateDisplayedColumns();
	}

	ngOnChanges(changes: SimpleChanges) {
		if (changes['rooms']) {
			// Update selected rooms based on current rooms
			const validIds = new Set(this.rooms.map((r) => r.roomId));
			const filteredSelection = new Set([...this.selectedRooms()].filter((id) => validIds.has(id)));
			this.selectedRooms.set(filteredSelection);
			this.updateSelectionState();

			// Show message when no rooms match filters
			this.showEmptyFilterMessage = this.rooms.length === 0 && this.hasActiveFilters();
		}
	}

	// ===== INITIALIZATION METHODS =====

	private setupFilters() {
		// Set up initial filter values
		this.nameFilterControl.setValue(this.initialFilters.nameFilter);
		this.statusFilterControl.setValue(this.initialFilters.statusFilter);

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

	canSelectRoom(_room: MeetRoom): boolean {
		return true;
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
		const statusFilter = this.statusFilterControl.value || '';
		this.loadMore.emit({ nameFilter, statusFilter });
	}

	refreshRooms() {
		const nameFilter = this.nameFilterControl.value || '';
		const statusFilter = this.statusFilterControl.value || '';
		this.refresh.emit({ nameFilter, statusFilter });
	}

	// ===== FILTER METHODS =====

	triggerSearch() {
		this.emitFilterChange();
	}

	private emitFilterChange() {
		this.filterChange.emit({
			nameFilter: this.nameFilterControl.value || '',
			statusFilter: this.statusFilterControl.value || ''
		});
	}

	hasActiveFilters(): boolean {
		return !!(this.nameFilterControl.value || this.statusFilterControl.value);
	}

	clearFilters() {
		this.nameFilterControl.setValue('');
		this.statusFilterControl.setValue('');
	}

	// ===== PERMISSION AND CAPABILITY METHODS =====

	canOpenRoom(room: MeetRoom): boolean {
		return room.status !== MeetRoomStatus.CLOSED;
	}

	canEditRoom(room: MeetRoom): boolean {
		return room.status !== MeetRoomStatus.ACTIVE_MEETING;
	}

	// ===== UI HELPER METHODS =====

	// ===== STATUS =====

	getRoomStatus(room: MeetRoom): string {
		return room.status.toUpperCase().replace(/_/g, ' ');
	}

	getStatusIcon(room: MeetRoom): string {
		switch (room.status) {
			case MeetRoomStatus.OPEN:
				return 'meeting_room';
			case MeetRoomStatus.ACTIVE_MEETING:
				return 'videocam';
			case MeetRoomStatus.CLOSED:
				return 'lock';
		}
	}

	getStatusTooltip(room: MeetRoom): string {
		switch (room.status) {
			case MeetRoomStatus.OPEN:
				return 'Room is open and ready to accept participants';
			case MeetRoomStatus.ACTIVE_MEETING:
				return 'A meeting is currently ongoing in this room';
			case MeetRoomStatus.CLOSED:
				return 'Room is closed and not accepting participants';
		}
	}

	getStatusColor(room: MeetRoom): string {
		switch (room.status) {
			case MeetRoomStatus.OPEN:
				return 'var(--ov-meet-color-success)';
			case MeetRoomStatus.ACTIVE_MEETING:
				return 'var(--ov-meet-color-primary)';
			case MeetRoomStatus.CLOSED:
				return 'var(--ov-meet-color-warning)';
		}
	}

	// ===== MEETING END ACTION INFO =====

	hasMeetingEndAction(room: MeetRoom): boolean {
		return room.status === MeetRoomStatus.ACTIVE_MEETING && room.meetingEndAction !== MeetingEndAction.NONE;
	}

	getMeetingEndActionTooltip(room: MeetRoom): string {
		switch (room.meetingEndAction) {
			case MeetingEndAction.CLOSE:
				return 'The room will be closed when the meeting ends';
			case MeetingEndAction.DELETE:
				return 'The room and its recordings will be deleted when the meeting ends';
			default:
				return '';
		}
	}

	getMeetingEndActionClass(room: MeetRoom): string {
		switch (room.meetingEndAction) {
			case MeetingEndAction.CLOSE:
				return 'meeting-end-close';
			case MeetingEndAction.DELETE:
				return 'meeting-end-delete';
			default:
				return '';
		}
	}

	// ===== AUTO-DELETION =====

	hasAutoDeletion(room: MeetRoom): boolean {
		return !!room.autoDeletionDate;
	}

	isAutoDeletionExpired(room: MeetRoom): boolean {
		if (!room.autoDeletionDate) return false;

		// Check if auto-deletion date is more than 1 hour in the past
		const oneHourAgo = Date.now() - 60 * 60 * 1000;
		return room.autoDeletionDate < oneHourAgo;
	}

	getAutoDeletionStatus(room: MeetRoom): string {
		if (!room.autoDeletionDate) {
			return 'DISABLED';
		}

		return this.isAutoDeletionExpired(room) ? 'EXPIRED' : 'SCHEDULED';
	}

	getAutoDeletionIcon(room: MeetRoom): string {
		if (!room.autoDeletionDate) {
			return 'close';
		}

		return this.isAutoDeletionExpired(room) ? 'warning' : 'auto_delete';
	}

	getAutoDeletionTooltip(room: MeetRoom): string {
		if (!room.autoDeletionDate) {
			return 'No auto-deletion. Room remains until manually deleted';
		}

		if (this.isAutoDeletionExpired(room)) {
			return 'Auto-deletion date has passed but room was not deleted due to auto-deletion policy';
		}

		return 'Auto-deletion scheduled';
	}

	getAutoDeletionClass(room: MeetRoom): string {
		if (!room.autoDeletionDate) {
			return 'auto-deletion-disabled';
		}

		return this.isAutoDeletionExpired(room) ? 'auto-deletion-expired' : 'auto-deletion-scheduled';
	}

	// ===== ROOM TOGGLE =====

	getRoomToggleIcon(room: MeetRoom): string {
		return room.status !== MeetRoomStatus.CLOSED ? 'lock' : 'meeting_room';
	}

	getRoomToggleLabel(room: MeetRoom): string {
		return room.status !== MeetRoomStatus.CLOSED ? 'Close Room' : 'Open Room';
	}

	getRoomToggleIconClass(room: MeetRoom): string {
		return room.status !== MeetRoomStatus.CLOSED ? 'close-room-icon' : 'open-room-icon';
	}
}
