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
import { RouterModule } from '@angular/router';
import { MeetRoom, MeetRoomSortField, MeetRoomStatus, MeetUserRole, SortOrder } from '@openvidu-meet/typings';
import { setsAreEqual } from '../../../../shared/utils/array.utils';
import { RoomUiUtils } from '../../utils/ui';

export interface RoomTableAction {
	rooms: MeetRoom[];
	action: 'create' | 'join' | 'edit' | 'shareLink' | 'reopen' | 'close' | 'delete' | 'bulkDelete';
}

export interface RoomTableFilter {
	nameFilter: string;
	statusFilter: MeetRoomStatus | '';
	sortField: MeetRoomSortField;
	sortOrder: SortOrder;
	/** ADMIN only: filter by owner userId */
	ownerFilter: string;
	/** ADMIN only: filter by member userId */
	memberFilter: string;
	/** USER only: include only owned rooms in results */
	showOwnedRooms: boolean;
	/** USER/ROOM_MEMBER: include only rooms the user is a member of */
	showMemberRooms: boolean;
	/** All roles: include rooms accessible to all registered users */
	showRegisteredAccessRooms: boolean;
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
		RouterModule,
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
	canSelectRooms = computed(() => !!this.currentUserRole() && this.currentUserRole() !== MeetUserRole.ROOM_MEMBER);
	showLoadMore = input(false);
	loading = input(false);
	currentUserId = input<string>('');
	currentUserRole = input<MeetUserRole | undefined>(undefined);
	canViewUserProfiles = computed(
		() => !!this.currentUserRole() && this.currentUserRole() !== MeetUserRole.ROOM_MEMBER
	);
	initialFilters = input<RoomTableFilter>({
		nameFilter: '',
		statusFilter: '',
		sortField: 'creationDate',
		sortOrder: SortOrder.DESC,
		ownerFilter: '',
		memberFilter: '',
		showOwnedRooms: false,
		showMemberRooms: false,
		showRegisteredAccessRooms: false
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
	// Admin-only: free-text user ID filters
	ownerFilterControl = new FormControl<string>('', { nonNullable: true });
	memberFilterControl = new FormControl<string>('', { nonNullable: true });
	// Scope selectors (USER/ROOM_MEMBER checkboxes)
	showOwnedRoomsControl = new FormControl<boolean>(false, { nonNullable: true });
	showMemberRoomsControl = new FormControl<boolean>(false, { nonNullable: true });
	showRegisteredAccessRoomsControl = new FormControl<boolean>(false, { nonNullable: true });

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
	protected readonly MeetUserRole = MeetUserRole;

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
		const initial = this.initialFilters();
		this.nameFilterControl.setValue(initial.nameFilter);
		this.statusFilterControl.setValue(initial.statusFilter);
		this.currentSortField.set(initial.sortField);
		this.currentSortOrder.set(initial.sortOrder);
		this.ownerFilterControl.setValue(initial.ownerFilter);
		this.memberFilterControl.setValue(initial.memberFilter);
		this.showOwnedRoomsControl.setValue(initial.showOwnedRooms);
		this.showMemberRoomsControl.setValue(initial.showMemberRooms);
		this.showRegisteredAccessRoomsControl.setValue(initial.showRegisteredAccessRooms);

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

		// Admin text filters: auto-emit only when cleared
		this.ownerFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
			if (!value) {
				this.emitFilterChange();
			}
		});
		this.memberFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
			if (!value) {
				this.emitFilterChange();
			}
		});

		// Scope checkbox controls: emit immediately on change
		this.showOwnedRoomsControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			this.emitFilterChange();
		});
		this.showMemberRoomsControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			this.emitFilterChange();
		});
		this.showRegisteredAccessRoomsControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
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

	canSelectRoom(room: MeetRoom): boolean {
		return this.RoomUiUtils.canManageRoom(room, this.currentUserId(), this.currentUserRole());
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

	shareLink(room: MeetRoom) {
		this.roomAction.emit({ rooms: [room], action: 'shareLink' });
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
		this.loadMore.emit({
			nameFilter: this.nameFilterControl.value,
			statusFilter: this.statusFilterControl.value,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder(),
			ownerFilter: this.ownerFilterControl.value,
			memberFilter: this.memberFilterControl.value,
			showOwnedRooms: this.showOwnedRoomsControl.value,
			showMemberRooms: this.showMemberRoomsControl.value,
			showRegisteredAccessRooms: this.showRegisteredAccessRoomsControl.value
		});
	}

	refreshRooms() {
		this.refresh.emit({
			nameFilter: this.nameFilterControl.value,
			statusFilter: this.statusFilterControl.value,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder(),
			ownerFilter: this.ownerFilterControl.value,
			memberFilter: this.memberFilterControl.value,
			showOwnedRooms: this.showOwnedRoomsControl.value,
			showMemberRooms: this.showMemberRoomsControl.value,
			showRegisteredAccessRooms: this.showRegisteredAccessRoomsControl.value
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
			sortOrder: this.currentSortOrder(),
			ownerFilter: this.ownerFilterControl.value,
			memberFilter: this.memberFilterControl.value,
			showOwnedRooms: this.showOwnedRoomsControl.value,
			showMemberRooms: this.showMemberRoomsControl.value,
			showRegisteredAccessRooms: this.showRegisteredAccessRoomsControl.value
		});
	}

	hasActiveFilters(): boolean {
		return !!(
			this.nameFilterControl.value ||
			this.statusFilterControl.value ||
			this.ownerFilterControl.value ||
			this.memberFilterControl.value ||
			this.showOwnedRoomsControl.value ||
			this.showMemberRoomsControl.value ||
			this.showRegisteredAccessRoomsControl.value
		);
	}

	clearFilters() {
		const silent = { emitEvent: false };
		this.nameFilterControl.setValue('', silent);
		this.statusFilterControl.setValue('', silent);
		this.ownerFilterControl.setValue('', silent);
		this.memberFilterControl.setValue('', silent);
		this.showOwnedRoomsControl.setValue(false, silent);
		this.showMemberRoomsControl.setValue(false, silent);
		this.showRegisteredAccessRoomsControl.setValue(false, silent);
		this.emitFilterChange();
	}
}
