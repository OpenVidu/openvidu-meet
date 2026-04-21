import { DatePipe, NgClass } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	input,
	OnInit,
	output,
	signal,
	untracked
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { MeetRoom, MeetRoomSortField, MeetRoomStatus, SortOrder } from '@openvidu-meet/typings';
import { setsAreEqual } from '../../../../shared/utils/array.utils';
import { RoomUiUtils } from '../../utils/ui';

export interface RoomTableAction {
	rooms: MeetRoom[];
	action:
		| 'create'
		| 'join'
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
	sortField: MeetRoomSortField;
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
		NgClass,
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
	styleUrl: './rooms-lists.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[class.has-selections]': 'hasSelections()'
	}
})
export class RoomsListsComponent implements OnInit {
	private destroyRef = inject(DestroyRef);

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

	// Host binding state for styling when rooms are selected
	hasSelections = computed(() => this.selectedRooms().size > 0);

	// Output events
	roomAction = output<RoomTableAction>();
	filterChange = output<RoomTableFilter>();
	loadMore = output<RoomTableFilter>();
	refresh = output<RoomTableFilter>();
	roomClicked = output<string>();

	// Filter controls
	nameFilterControl = new FormControl<string>('', { nonNullable: true });
	statusFilterControl = new FormControl<MeetRoomStatus | ''>('', { nonNullable: true });

	// Sort state
	currentSortField = signal<MeetRoomSortField>('creationDate');
	currentSortOrder = signal<SortOrder>(SortOrder.DESC);

	showEmptyFilterMessage = signal(false); // Show message when no rooms match filters

	// Selection state
	selectedRooms = signal<Set<string>>(new Set());
	allSelected = signal(false);
	someSelected = signal(false);

	// Table configuration
	displayedColumns = computed(() => {
		const columns = ['roomName', 'owner', 'status', 'creationDate', 'autoDeletionDate', 'actions'];
		return this.showSelection() ? ['select', ...columns] : columns;
	});

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
			this.showEmptyFilterMessage.set(rooms.length === 0 && this.hasActiveFilters());
		});
	}

	ngOnInit() {
		this.setupFilters();
	}

	// ===== INITIALIZATION METHODS =====

	private setupFilters() {
		// Initialize from initialFilters input
		this.nameFilterControl.setValue(this.initialFilters().nameFilter);
		this.statusFilterControl.setValue(this.initialFilters().statusFilter);
		this.currentSortField.set(this.initialFilters().sortField);
		this.currentSortOrder.set(this.initialFilters().sortOrder);

		// Set up name filter change detection
		this.nameFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
			// Emit filter change if value is empty
			if (!value) {
				this.emitFilterChange();
			}
		});

		// Set up status filter change detection
		this.statusFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			this.emitFilterChange();
		});
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

	joinRoom(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'join' });
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
		const nameFilter = this.nameFilterControl.value;
		const statusFilter = this.statusFilterControl.value;
		this.loadMore.emit({
			nameFilter,
			statusFilter,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		});
	}

	refreshRooms() {
		const nameFilter = this.nameFilterControl.value;
		const statusFilter = this.statusFilterControl.value;
		this.refresh.emit({
			nameFilter,
			statusFilter,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		});
	}

	onSortChange(sortState: Sort) {
		this.currentSortField.set(sortState.active as MeetRoomSortField);
		this.currentSortOrder.set(sortState.direction as SortOrder);
		this.emitFilterChange();
	}

	// ===== FILTER METHODS =====

	triggerSearch() {
		this.emitFilterChange();
	}

	private emitFilterChange() {
		this.filterChange.emit({
			nameFilter: this.nameFilterControl.value,
			statusFilter: this.statusFilterControl.value,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
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
