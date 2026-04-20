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
import { MeetUserDTO, MeetUserRole, MeetUserSortField, SortOrder } from '@openvidu-meet/typings';
import { setsAreEqual } from '../../../../shared/utils/array.utils';
import { UsersUiUtils } from '../../utils/ui';

export interface UserTableAction {
	users: MeetUserDTO[];
	action: 'create' | 'updateRole' | 'resetPassword' | 'delete' | 'bulkDelete';
}

export interface UserTableFilter {
	nameFilter: string;
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
	templateUrl: './users-lists.component.html',
	styleUrl: './users-lists.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[class.has-selections]': 'hasSelections()'
	}
})
export class UsersListsComponent implements OnInit {
	private destroyRef = inject(DestroyRef);

	users = input<MeetUserDTO[]>([]);
	currentUserId = input('');
	showSearchBox = input(true);
	showFilters = input(true);
	showSelection = input(true);
	showLoadMore = input(false);
	loading = input(false);
	initialFilters = input<UserTableFilter>({
		nameFilter: '',
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
	nameFilterControl = new FormControl<string>('', { nonNullable: true });
	roleFilterControl = new FormControl<MeetUserRole | ''>('', { nonNullable: true });

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
		{ value: '', label: 'All roles' },
		{ value: MeetUserRole.ADMIN, label: 'Admin' },
		{ value: MeetUserRole.USER, label: 'User' },
		{ value: MeetUserRole.ROOM_MEMBER, label: 'Room Member' }
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
		// Initialize from initialFilters input
		this.nameFilterControl.setValue(this.initialFilters().nameFilter);
		this.roleFilterControl.setValue(this.initialFilters().roleFilter);
		this.currentSortField.set(this.initialFilters().sortField);
		this.currentSortOrder.set(this.initialFilters().sortOrder);

		// Set up name filter change detection
		this.nameFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
			// Emit filter change if value is empty
			if (!value) {
				this.emitFilterChange();
			}
		});

		// Set up role filter change detection
		this.roleFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			this.emitFilterChange();
		});
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
		return !UsersUiUtils.isProtectedUser(user, this.currentUserId());
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
		const nameFilter = this.nameFilterControl.value;
		const roleFilter = this.roleFilterControl.value;
		this.loadMore.emit({
			nameFilter,
			roleFilter,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		});
	}

	refreshUsers() {
		const nameFilter = this.nameFilterControl.value;
		const roleFilter = this.roleFilterControl.value;
		this.refresh.emit({
			nameFilter,
			roleFilter,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		});
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

	private emitFilterChange() {
		this.filterChange.emit({
			nameFilter: this.nameFilterControl.value,
			roleFilter: this.roleFilterControl.value,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		});
	}

	hasActiveFilters(): boolean {
		return !!(this.nameFilterControl.value || this.roleFilterControl.value);
	}

	clearFilters() {
		this.nameFilterControl.setValue('');
		this.roleFilterControl.setValue('');
	}
}
