import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MeetUserDTO, MeetUserFilters, MeetUserRole, SortOrder } from '@openvidu-meet/typings';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { AuthService } from '../../../auth/services/auth.service';
import { ILogger, LoggerService } from '../../../meeting/openvidu-components';
import { ResetPasswordDialogComponent } from '../../components/reset-password-dialog/reset-password-dialog.component';
import {
	UsersListsComponent,
	UserTableAction,
	UserTableFilter
} from '../../components/users-lists/users-lists.component';
import { UserService } from '../../services/user.service';

@Component({
	selector: 'ov-users',
	imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, UsersListsComponent],
	templateUrl: './users.component.html',
	styleUrl: './users.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsersComponent implements OnInit {
	private userService = inject(UserService);
	private authService = inject(AuthService);
	private notificationService = inject(NotificationService);
	private navigationService = inject(NavigationService);
	private dialog = inject(MatDialog);
	private loggerService = inject(LoggerService);
	protected log: ILogger;

	users = signal<MeetUserDTO[]>([]);
	currentUserId = signal<string>('');

	isInitializing = signal(true);
	showInitialLoader = signal(false);
	isLoading = signal(false);

	hasMoreUsers = signal(false);
	private nextPageToken?: string;

	initialFilters = signal<UserTableFilter>({
		nameFilter: '',
		roleFilter: '',
		sortField: 'registrationDate',
		sortOrder: SortOrder.DESC
	});

	constructor() {
		this.log = this.loggerService.get('OpenVidu Meet - UsersComponent');
	}

	async ngOnInit() {
		const delayLoader = setTimeout(() => {
			this.showInitialLoader.set(true);
		}, 200);

		this.currentUserId.set((await this.authService.getUserId()) ?? '');
		await this.loadUsers(this.initialFilters());

		clearTimeout(delayLoader);
		this.showInitialLoader.set(false);
		this.isInitializing.set(false);
	}

	async onUserAction(action: UserTableAction) {
		switch (action.action) {
			case 'create':
				await this.onCreateUser();
				break;
			case 'updateRole':
				await this.onUpdateRole(action.users[0]);
				break;
			case 'resetPassword':
				this.onResetPassword(action.users[0]);
				break;
			case 'delete':
				this.onDeleteUser(action.users[0]);
				break;
			case 'bulkDelete':
				this.onBulkDeleteUsers(action.users);
				break;
		}
	}

	async refreshUsers(filters: UserTableFilter) {
		this.nextPageToken = undefined;
		await this.loadUsers(filters, true);
	}

	async loadMoreUsers(filters: UserTableFilter) {
		await this.loadUsers(filters);
	}

	// ─── Actions ──────────────────────────────────────────────────────────────

	private async onCreateUser() {
		await this.navigationService.navigateTo('/users/new');
	}

	private async onUpdateRole(user: MeetUserDTO) {
		await this.navigateToUserProfile(user.userId);
	}

	private onResetPassword(user: MeetUserDTO) {
		this.dialog.open(ResetPasswordDialogComponent, {
			width: '520px',
			data: { user },
			panelClass: 'ov-meet-dialog'
		});
	}

	private onDeleteUser(user: MeetUserDTO) {
		this.notificationService.showDialog({
			title: 'Delete User',
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete user <strong>${user.name}</strong> (${user.userId})? This action cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: async () => {
				try {
					await this.userService.deleteUser(user.userId);
					this.users.set(this.users().filter((u) => u.userId !== user.userId));
					this.notificationService.showSnackbar(`User "${user.name}" deleted successfully`);
				} catch (error) {
					this.log.e('Error deleting user:', error);
					this.notificationService.showSnackbar('Failed to delete user');
				}
			}
		});
	}

	private onBulkDeleteUsers(usersToDelete: MeetUserDTO[]) {
		const count = usersToDelete.length;
		this.notificationService.showDialog({
			title: 'Delete Users',
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete <strong>${count} user${count > 1 ? 's' : ''}</strong>? This action cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: async () => {
				const failed: string[] = [];
				for (const user of usersToDelete) {
					try {
						await this.userService.deleteUser(user.userId);
					} catch (error) {
						this.log.e('Error deleting user:', user.userId, error);
						failed.push(user.name);
					}
				}
				const deletedIds = new Set(usersToDelete.map((u) => u.userId));
				this.users.set(this.users().filter((u) => !deletedIds.has(u.userId)));
				if (failed.length > 0) {
					this.notificationService.showSnackbar(`Failed to delete: ${failed.join(', ')}`);
				} else {
					this.notificationService.showSnackbar(`${count} user${count > 1 ? 's' : ''} deleted successfully`);
				}
			}
		});
	}

	async onUserClick(userId: string) {
		try {
			await this.navigateToUserProfile(userId);
		} catch (error) {
			this.notificationService.showSnackbar('Error navigating to user profile');
			this.log.e('Error navigating to user profile:', error);
		}
	}

	private async navigateToUserProfile(userId: string) {
		if (userId === this.currentUserId()) {
			await this.navigationService.navigateTo('/profile');
			return;
		}

		await this.navigationService.navigateTo(`/users/${userId}`);
	}

	// ─── Data loading ─────────────────────────────────────────────────────────

	private async loadUsers(filters: UserTableFilter, refresh = false) {
		const delayLoader = setTimeout(() => {
			this.isLoading.set(true);
		}, 200);

		try {
			const userFilters: MeetUserFilters = {
				maxItems: 50,
				nextPageToken: !refresh ? this.nextPageToken : undefined,
				sortField: filters.sortField,
				sortOrder: filters.sortOrder
			};

			if (filters.nameFilter) {
				userFilters.name = filters.nameFilter;
			}

			if (filters.roleFilter) {
				userFilters.role = filters.roleFilter as MeetUserRole;
			}

			const response = await this.userService.listUsers(userFilters);

			if (!refresh) {
				this.users.set([...this.users(), ...response.users]);
			} else {
				this.users.set(response.users);
			}

			this.nextPageToken = response.pagination.nextPageToken;
			this.hasMoreUsers.set(response.pagination.isTruncated);
		} catch (error) {
			this.log.e('Error loading users:', error);
			this.notificationService.showSnackbar('Failed to load users');
		} finally {
			clearTimeout(delayLoader);
			this.isLoading.set(false);
		}
	}
}
