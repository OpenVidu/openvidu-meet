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
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
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
import {
	MeetRoom,
	MeetRoomSortField,
	MeetRoomStatus,
	MeetUserRole,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';
import { merge } from 'rxjs';
import { setsAreEqual } from '../../../../shared/utils/array.utils';
import { RoomUiUtils } from '../../utils/ui';

export interface RoomTableAction {
	rooms: MeetRoom[];
	action: 'create' | 'join' | 'edit' | 'shareLink' | 'reopen' | 'close' | 'delete' | 'bulkDelete';
}

export interface RoomTableFilter {
	nameFilter: string;
	/** Match mode applied to the room name search. Defaults to 'prefix'. */
	nameMatchMode: TextMatchMode;
	/** Whether room name matching ignores case. Defaults to false. */
	nameCaseInsensitive: boolean;
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
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
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
	filtersForm = new FormGroup({
		nameFilter: new FormControl<string>('', { nonNullable: true }),
		nameMatchMode: new FormControl<TextMatchMode>(TextMatchMode.PREFIX, { nonNullable: true }),
		nameCaseInsensitive: new FormControl<boolean>(false, { nonNullable: true }),
		statusFilter: new FormControl<MeetRoomStatus | ''>('', { nonNullable: true }),
		ownerFilter: new FormControl<string>('', { nonNullable: true }),
		memberFilter: new FormControl<string>('', { nonNullable: true }),
		showOwnedRooms: new FormControl<boolean>(false, { nonNullable: true }),
		showMemberRooms: new FormControl<boolean>(false, { nonNullable: true }),
		showRegisteredAccessRooms: new FormControl<boolean>(false, { nonNullable: true })
	});

	get controls() {
		return this.filtersForm.controls;
	}

	// Pending form snapshot — reflects what's in the input fields right now.
	// Drives transient UI cues (clear-X visibility, search-modifier active states).
	protected filterState = signal(this.filtersForm.getRawValue());

	// Applied filter snapshot — reflects what's actually filtering the table.
	// Updated only when emitFilterChange() fires, so free-text fields that
	// require Enter/click don't make chips appear before the search is applied.
	protected appliedFilterState = signal(this.filtersForm.getRawValue());

	// Match mode and case-insensitivity are search modifiers, not counted as active filters.
	// Reads the applied snapshot so pending free-text input doesn't count as "active".
	hasActiveFilters = computed(() => {
		const f = this.appliedFilterState();
		return !!(
			f.nameFilter ||
			f.statusFilter ||
			f.ownerFilter ||
			f.memberFilter ||
			f.showOwnedRooms ||
			f.showMemberRooms ||
			f.showRegisteredAccessRooms
		);
	});

	// Whether the inline filter panel is expanded
	showFilterPanel = signal(false);

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

	// Room name match mode options
	nameMatchModeOptions = [
		{ value: TextMatchMode.PREFIX, label: 'Starts with', icon: 'first_page' },
		{ value: TextMatchMode.PARTIAL, label: 'Contains', icon: 'more_horiz' },
		{ value: TextMatchMode.EXACT, label: 'Exact', icon: 'format_quote' },
		{ value: TextMatchMode.REGEX, label: 'Regex', icon: 'code' }
	];

	// Currently selected match mode option (drives the search-box trigger button)
	currentMatchMode = computed(
		() =>
			this.nameMatchModeOptions.find((o) => o.value === this.filterState().nameMatchMode) ??
			this.nameMatchModeOptions[0]
	);

	// Active filters shown as removable chips (excludes search text and match-mode/case modifiers).
	// Reads the applied snapshot so chips only appear once the filter is actually in effect.
	activeFilterChips = computed(() => {
		const f = this.appliedFilterState();
		const chips: { key: string; label: string }[] = [];
		if (f.statusFilter) {
			const opt = this.statusOptions.find((o) => o.value === f.statusFilter);
			chips.push({ key: 'statusFilter', label: `Status: ${opt?.label ?? f.statusFilter}` });
		}
		if (f.ownerFilter) chips.push({ key: 'ownerFilter', label: `Owner: ${f.ownerFilter}` });
		if (f.memberFilter) chips.push({ key: 'memberFilter', label: `Member: ${f.memberFilter}` });
		if (f.showOwnedRooms) chips.push({ key: 'showOwnedRooms', label: 'Created by me' });
		if (f.showMemberRooms) chips.push({ key: 'showMemberRooms', label: "I'm a member of" });
		if (f.showRegisteredAccessRooms) {
			chips.push({ key: 'showRegisteredAccessRooms', label: 'Open to all registered users' });
		}
		return chips;
	});

	// Expose TextMatchMode for template
	protected readonly TextMatchMode = TextMatchMode;

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
		const initial = this.initialFilters();
		this.filtersForm.patchValue(initial, { emitEvent: false });
		const initialSnapshot = this.filtersForm.getRawValue();
		this.filterState.set(initialSnapshot);
		this.appliedFilterState.set(initialSnapshot);
		this.currentSortField.set(initial.sortField);
		this.currentSortOrder.set(initial.sortOrder);

		// Keep the reactive snapshot in sync with any form change
		this.filtersForm.valueChanges
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => this.filterState.set(this.filtersForm.getRawValue()));

		const {
			nameFilter,
			nameMatchMode,
			nameCaseInsensitive,
			statusFilter,
			ownerFilter,
			memberFilter,
			showOwnedRooms,
			showMemberRooms,
			showRegisteredAccessRooms
		} = this.filtersForm.controls;

		// Emit only when text field is cleared
		merge(nameFilter.valueChanges, ownerFilter.valueChanges, memberFilter.valueChanges)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((value) => {
				if (!value) this.emitFilterChange();
			});

		// Emit immediately on any option/select change
		merge(
			nameMatchMode.valueChanges,
			nameCaseInsensitive.valueChanges,
			statusFilter.valueChanges,
			showOwnedRooms.valueChanges,
			showMemberRooms.valueChanges,
			showRegisteredAccessRooms.valueChanges
		)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => this.emitFilterChange());
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
		this.loadMore.emit(this.buildFilterSnapshot());
	}

	refreshRooms() {
		this.refresh.emit(this.buildFilterSnapshot());
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

	toggleFilterPanel() {
		this.showFilterPanel.update((open) => !open);
	}

	toggleCaseInsensitive() {
		this.controls.nameCaseInsensitive.setValue(!this.controls.nameCaseInsensitive.value);
	}

	clearNameFilter() {
		this.controls.nameFilter.setValue('');
	}

	setMatchMode(mode: TextMatchMode) {
		this.controls.nameMatchMode.setValue(mode);
	}

	removeFilter(key: string) {
		const control = (this.filtersForm.controls as Record<string, FormControl>)[key];
		if (!control) return;
		control.setValue(typeof control.value === 'boolean' ? false : '');
	}

	private buildFilterSnapshot(): RoomTableFilter {
		return {
			...this.filtersForm.getRawValue(),
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		};
	}

	private emitFilterChange() {
		const snapshot = this.buildFilterSnapshot();
		this.appliedFilterState.set(snapshot);
		this.filterChange.emit(snapshot);
	}

	clearFilters() {
		this.filtersForm.reset(
			{
				nameFilter: '',
				// Preserve search modifiers — they are not part of "filters"
				nameMatchMode: this.controls.nameMatchMode.value,
				nameCaseInsensitive: this.controls.nameCaseInsensitive.value,
				statusFilter: '',
				ownerFilter: '',
				memberFilter: '',
				showOwnedRooms: false,
				showMemberRooms: false,
				showRegisteredAccessRooms: false
			},
			{ emitEvent: false }
		);
		this.filterState.set(this.filtersForm.getRawValue());
		this.emitFilterChange();
	}
}
