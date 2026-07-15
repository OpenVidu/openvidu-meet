import { DatePipe } from '@angular/common';
import {
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
import { MeetUserDTO, MeetUserRole, MeetUserSortField, SortOrder, TextMatchMode } from '@openvidu-meet/typings';
import { merge } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { setsAreEqual } from '../../../../shared/utils/array.utils';
import { UsersUiUtils } from '../../utils/ui';

export interface UserTableAction {
	users: MeetUserDTO[];
	action: 'create' | 'updateRole' | 'resetPassword' | 'delete' | 'bulkDelete';
}

export interface UserTableFilter {
	nameFilter: string;
	nameMatchMode: TextMatchMode;
	nameCaseInsensitive: boolean;
	roleFilter: MeetUserRole | '';
	sortField: MeetUserSortField;
	sortOrder: SortOrder;
}

/**
 * Reusable component for displaying a list of users with filtering, selection, and bulk operations.
 *
 * Features:
 * - Display users in a Material Design table
 * - Filter by user name and role
 * - Multi-selection for bulk operations
 * - Individual user actions (reset password, delete)
 * - Responsive design with mobile optimization
 * - Role-based styling using design tokens
 *
 * @example
 * ```html
 * <ov-users-lists
 *   [users]="users"
 *   [loading]="isLoading"
 *   [showFilters]="true"
 *   [showSelection]="true"
 *   (userAction)="handleUserAction($event)"
 *   (filterChange)="handleFilterChange($event)"
 *   (refresh)="refreshUsers()">
 * </ov-users-lists>
 * ```
 */

@Component({
	selector: 'ov-users-lists',
	imports: [
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
		MatSortModule,
		DatePipe,
		TranslatePipe
	],
	templateUrl: './users-lists.component.html',
	styleUrl: './users-lists.component.scss',
	host: {
		'[class.has-selections]': 'hasSelections()'
	}
})
export class UsersListsComponent implements OnInit {
	private destroyRef = inject(DestroyRef);
	private readonly translateService = inject(TranslateService);

	users = input<MeetUserDTO[]>([]);
	currentUserId = input('');
	rootAdminId = input('');
	showSearchBox = input(true);
	showFilters = input(true);
	showSelection = input(true);
	showLoadMore = input(false);
	loading = input(false);
	initialFilters = input<UserTableFilter>({
		nameFilter: '',
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
		roleFilter: '',
		sortField: 'registrationDate',
		sortOrder: SortOrder.DESC
	});

	// Host binding state for styling when users are selected
	hasSelections = computed(() => this.selectedUsers().size > 0);

	// Output events
	readonly userAction = output<UserTableAction>();
	readonly filterChange = output<UserTableFilter>();
	readonly loadMore = output<UserTableFilter>();
	readonly refresh = output<UserTableFilter>();
	readonly userClicked = output<string>();

	// Filter controls
	filtersForm = new FormGroup({
		nameFilter: new FormControl<string>('', { nonNullable: true }),
		nameMatchMode: new FormControl<TextMatchMode>(TextMatchMode.PREFIX, { nonNullable: true }),
		nameCaseInsensitive: new FormControl<boolean>(false, { nonNullable: true }),
		roleFilter: new FormControl<MeetUserRole | ''>('', { nonNullable: true })
	});

	get controls() {
		return this.filtersForm.controls;
	}

	// Pending form snapshot — reflects what's in the input fields right now.
	// Drives transient UI cues (clear-X visibility, search-modifier active states).
	protected filterState = signal(this.filtersForm.getRawValue());

	// Applied filter snapshot — reflects what's actually filtering the table.
	// Updated only when emitFilterChange() fires.
	protected appliedFilterState = signal(this.filtersForm.getRawValue());

	// Reads the applied snapshot so pending free-text input doesn't count as "active".
	hasActiveFilters = computed(() => {
		const f = this.appliedFilterState();
		return !!(f.nameFilter || f.roleFilter);
	});

	// Whether the inline filter panel is expanded
	showFilterPanel = signal(false);

	nameMatchModeOptions = [
		{ value: TextMatchMode.PREFIX, label: this.translateService.translate('USERS.LIST.MATCH_MODE_STARTS_WITH'), icon: 'first_page' },
		{ value: TextMatchMode.PARTIAL, label: this.translateService.translate('USERS.LIST.MATCH_MODE_CONTAINS'), icon: 'more_horiz' },
		{ value: TextMatchMode.EXACT, label: this.translateService.translate('USERS.LIST.MATCH_MODE_EXACT'), icon: 'format_quote' },
		{ value: TextMatchMode.REGEX, label: this.translateService.translate('USERS.LIST.MATCH_MODE_REGEX'), icon: 'code' }
	];

	// Currently selected match mode option (drives the search-box trigger button)
	currentMatchMode = computed(
		() =>
			this.nameMatchModeOptions.find((o) => o.value === this.filterState().nameMatchMode) ??
			this.nameMatchModeOptions[0]
	);

	// Active filters shown as removable chips. Reads the applied snapshot.
	activeFilterChips = computed(() => {
		const f = this.appliedFilterState();
		const chips: { key: string; label: string }[] = [];
		if (f.roleFilter) {
			const opt = this.roleOptions.find((o) => o.value === f.roleFilter);
			chips.push({
				key: 'roleFilter',
				label: `${this.translateService.translate('USERS.LIST.ROLE_CHIP_PREFIX')}${opt?.label ?? f.roleFilter}`
			});
		}
		return chips;
	});

	// Expose TextMatchMode for template
	protected readonly TextMatchMode = TextMatchMode;

	// Sort state
	currentSortField = signal<MeetUserSortField>('registrationDate');
	currentSortOrder = signal<SortOrder>(SortOrder.DESC);

	showEmptyFilterMessage = signal(false); // Show message when no users match filters

	// Selection state
	selectedUsers = signal<Set<string>>(new Set());
	allSelected = signal(false);
	someSelected = signal(false);

	// Table configuration
	displayedColumns = computed(() => {
		const columns = ['userName', 'role', 'registrationDate', 'actions'];
		return this.showSelection() ? ['select', ...columns] : columns;
	});

	// Role options
	roleOptions = [
		{ value: '', label: this.translateService.translate('USERS.LIST.ROLE_FILTER_ALL') },
		{ value: MeetUserRole.ADMIN, label: this.translateService.translate('USERS.LIST.ROLE_FILTER_ADMIN') },
		{ value: MeetUserRole.ROOM_MANAGER, label: this.translateService.translate('USERS.LIST.ROLE_FILTER_ROOM_MANAGER') },
		{ value: MeetUserRole.ROOM_MEMBER, label: this.translateService.translate('USERS.LIST.ROLE_FILTER_ROOM_MEMBER') }
	];
	protected readonly UsersUiUtils = UsersUiUtils;

	constructor() {
		effect(() => {
			// Update selected users based on current users
			const users = this.users();
			const validUserIds = new Set(users.map((u) => u.userId));

			// Use untracked to avoid creating a reactive dependency on selectedUsers
			const currentSelection = untracked(() => this.selectedUsers());
			const filteredSelection = new Set([...currentSelection].filter((id) => validUserIds.has(id)));

			// Only update if the selection has actually changed
			if (!setsAreEqual(filteredSelection, currentSelection)) {
				this.selectedUsers.set(filteredSelection);
				this.updateSelectionState();
			}

			// Show message when no users match filters
			this.showEmptyFilterMessage.set(users.length === 0 && this.hasActiveFilters());
		});
	}

	ngOnInit() {
		this.setupFilters();
	}

	// ===== INITIALIZATION METHODS =====

	private setupFilters() {
		const filters = this.initialFilters();
		this.filtersForm.patchValue(filters, { emitEvent: false });
		const initialSnapshot = this.filtersForm.getRawValue();
		this.filterState.set(initialSnapshot);
		this.appliedFilterState.set(initialSnapshot);
		this.currentSortField.set(filters.sortField);
		this.currentSortOrder.set(filters.sortOrder);

		// Keep the reactive snapshot in sync with any form change
		this.filtersForm.valueChanges
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => this.filterState.set(this.filtersForm.getRawValue()));

		const { nameFilter, nameMatchMode, nameCaseInsensitive, roleFilter } = this.controls;

		// Emit only when text field is cleared
		nameFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
			if (!value) this.emitFilterChange();
		});

		// Emit immediately on any option/select change
		merge(nameMatchMode.valueChanges, nameCaseInsensitive.valueChanges, roleFilter.valueChanges)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => this.emitFilterChange());
	}

	// ===== SELECTION METHODS =====

	toggleAllSelection() {
		const selected = this.selectedUsers();
		if (this.allSelected()) {
			selected.clear();
		} else {
			this.users().forEach((user) => {
				if (this.canSelectUser(user)) {
					selected.add(user.userId);
				}
			});
		}
		this.selectedUsers.set(new Set(selected));
		this.updateSelectionState();
	}

	toggleUserSelection(user: MeetUserDTO) {
		const selected = this.selectedUsers();
		if (selected.has(user.userId)) {
			selected.delete(user.userId);
		} else {
			selected.add(user.userId);
		}
		this.selectedUsers.set(new Set(selected));
		this.updateSelectionState();
	}

	private updateSelectionState() {
		const selectableUsers = this.users().filter((u) => this.canSelectUser(u));
		const selectedCount = this.selectedUsers().size;
		const selectableCount = selectableUsers.length;

		this.allSelected.set(selectedCount > 0 && selectedCount === selectableCount);
		this.someSelected.set(selectedCount > 0 && selectedCount < selectableCount);
	}

	isUserSelected(user: MeetUserDTO): boolean {
		return this.selectedUsers().has(user.userId);
	}

	canSelectUser(user: MeetUserDTO): boolean {
		return !UsersUiUtils.isProtectedUser(user, this.currentUserId(), this.rootAdminId());
	}

	getSelectedUsers(): MeetUserDTO[] {
		const selected = this.selectedUsers();
		return this.users().filter((u) => selected.has(u.userId));
	}

	// ===== ACTION METHODS =====

	createUser() {
		this.userAction.emit({ users: [], action: 'create' });
	}

	onUserClick(user: MeetUserDTO) {
		this.userClicked.emit(user.userId);
	}

	resetPassword(user: MeetUserDTO) {
		this.userAction.emit({ users: [user], action: 'resetPassword' });
	}

	updateRole(user: MeetUserDTO) {
		this.userAction.emit({ users: [user], action: 'updateRole' });
	}

	deleteUser(user: MeetUserDTO) {
		this.userAction.emit({ users: [user], action: 'delete' });
	}

	bulkDeleteSelected() {
		const selectedUsers = this.getSelectedUsers();
		if (selectedUsers.length > 0) {
			this.userAction.emit({ users: selectedUsers, action: 'bulkDelete' });
		}
	}

	loadMoreUsers() {
		this.loadMore.emit(this.buildFilterSnapshot());
	}

	refreshUsers() {
		this.refresh.emit(this.buildFilterSnapshot());
	}

	onSortChange(sortState: Sort) {
		this.currentSortField.set(sortState.active as MeetUserSortField);
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

	private buildFilterSnapshot(): UserTableFilter {
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
				roleFilter: ''
			},
			{ emitEvent: false }
		);
		this.filterState.set(this.filtersForm.getRawValue());
		this.emitFilterChange();
	}
}
