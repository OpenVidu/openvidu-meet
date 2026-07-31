import { Component, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MeetUserDTO, MeetUserFilters, MeetUserRole, SortOrder, TextMatchMode } from '@openvidu-meet/typings';
import { firstValueFrom } from 'rxjs';
import { ScrollPersistDirective } from '../../../../shared/directives/scroll-persist.directive';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { DialogPresetsService } from '../../../../shared/services/dialog-presets.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { EntityListSnapshot, EntityListState } from '../../../../shared/models/entity-list.model';
import { ListStateCacheService } from '../../../../shared/services/list-state-cache.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { parseBulkDeleteError } from '../../../../shared/utils/bulk-delete.utils';
import { AuthService } from '../../../auth/services/auth.service';
import { ResetPasswordDialogComponent } from '../../components/reset-password-dialog/reset-password-dialog.component';
import { UpdateRoleDialogComponent } from '../../components/update-role-dialog/update-role-dialog.component';
import {
	UsersListsComponent,
	UserTableAction,
	UserTableFilter
} from '../../components/users-lists/users-lists.component';
import { UserService } from '../../services/user.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import type { ILogger } from '../../../../shared/models/logger.model';

/** Cached UI state for the users list, restored when navigating back to it. */
interface UsersListCachedState {
	list: EntityListSnapshot<MeetUserDTO, UserTableFilter>;
	scrollTop: number;
}

@Component({
	selector: 'ov-users',
	imports: [
		MatButtonModule,
		MatIconModule,
		MatProgressSpinnerModule,
		UsersListsComponent,
		ScrollPersistDirective,
		TranslatePipe
	],
	templateUrl: './users.component.html',
	styleUrl: './users.component.scss'
})
export class UsersComponent implements OnInit, OnDestroy {
	private userService = inject(UserService);
	private listStateCache = inject(ListStateCacheService);
	private authService = inject(AuthService);
	private notificationService = inject(NotificationService);
	private readonly translateService = inject(TranslateService);
	private dialogPresetsService = inject(DialogPresetsService);
	private navigationService = inject(NavigationService);
	private dialog = inject(MatDialog);
	private loggerService = inject(LoggerService);
	protected log: ILogger = this.loggerService.get('OpenVidu Meet - UsersComponent');

	private static readonly STATE_KEY = 'users';

	private readonly scroller = viewChild(ScrollPersistDirective);
	/** Scroll position to restore on the page container (set when restoring cached state). */
	protected scrollToRestore = 0;

	currentUserId = signal<string>('');
	rootAdminId = signal<string>('');

	initialFilters = signal<UserTableFilter>({
		nameFilter: '',
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
		roleFilter: '',
		sortField: 'registrationDate',
		sortOrder: SortOrder.DESC
	});

	protected readonly list = new EntityListState<MeetUserDTO, UserTableFilter>({
		initialFilters: this.initialFilters(),
		fetchPage: (filters, nextPageToken) => this.fetchUsersPage(filters, nextPageToken),
		onLoadError: (error) => {
			this.log.e('Error loading users:', error);
			this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.USERS_LOAD_FAILED'));
		}
	});

	async ngOnInit() {
		// Capture the navigation trigger synchronously, before any await finalizes the navigation.
		const isBackNavigation = this.navigationService.isPopStateNavigation();

		this.currentUserId.set((await this.authService.getUserId()) ?? '');

		const rootAdmin = await this.userService.getRootAdmin();
		if (rootAdmin) this.rootAdminId.set(rootAdmin.userId);

		// Restore cached state only when navigating *back* (browser back/forward); an
		// explicit navigation to this page loads fresh data so others' changes show.
		const cached = this.listStateCache.get<UsersListCachedState>(UsersComponent.STATE_KEY);
		if (cached && isBackNavigation) {
			this.list.restore(cached.list);
			this.initialFilters.set(cached.list.filters);
			this.scrollToRestore = cached.scrollTop; // applied by ScrollPersistDirective once rendered
			return;
		}

		await this.list.initialize(this.initialFilters());
	}

	ngOnDestroy() {
		this.listStateCache.set<UsersListCachedState>(UsersComponent.STATE_KEY, {
			list: this.list.snapshot(),
			scrollTop: this.scroller()?.scrollTop ?? 0
		});
	}

	private async fetchUsersPage(filters: UserTableFilter, nextPageToken: string | undefined) {
		const userFilters: MeetUserFilters = {
			maxItems: 50,
			nextPageToken,
			sortField: filters.sortField,
			sortOrder: filters.sortOrder
		};

		// Apply user name filter if provided
		if (filters.nameFilter) {
			userFilters.name = filters.nameFilter;
			userFilters.nameMatchMode = filters.nameMatchMode;
			userFilters.nameCaseInsensitive = filters.nameCaseInsensitive || undefined;
		}

		// Apply role filter if provided
		if (filters.roleFilter) {
			userFilters.role = filters.roleFilter as MeetUserRole;
		}

		const response = await this.userService.listUsers(userFilters);

		return {
			items: response.users,
			nextPageToken: response.pagination.nextPageToken,
			hasMore: response.pagination.isTruncated
		};
	}

	// ─── Actions ──────────────────────────────────────────────────────────────

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

	private async onCreateUser() {
		await this.navigationService.navigateTo('/users/new');
	}

	private async onUpdateRole(user: MeetUserDTO) {
		const updatedUser = await firstValueFrom(
			this.dialog
				.open(UpdateRoleDialogComponent, {
					width: '520px',
					data: { user },
					panelClass: 'ov-meet-dialog'
				})
				.afterClosed()
		);

		if (!updatedUser) {
			return;
		}

		this.list.update((users) =>
			users.map((currentUser) => (currentUser.userId === updatedUser.userId ? updatedUser : currentUser))
		);
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
			...this.dialogPresetsService.getDeleteUserDialogPreset(user.name, user.userId),
			confirmCallback: async () => {
				try {
					await this.userService.deleteUser(user.userId);

					this.list.remove((u) => u.userId === user.userId);
					this.notificationService.showSnackbar(
						`${this.translateService.translate('USERS.ERRORS.USER_DELETED_PREFIX')}${user.name}${this.translateService.translate('USERS.ERRORS.USER_DELETED_SUFFIX')}`
					);
					await this.list.autoLoadIfEmpty();
				} catch (error) {
					this.log.e('Error deleting user:', error);
					this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.USER_DELETE_FAILED'));
				}
			}
		});
	}

	private onBulkDeleteUsers(usersToDelete: MeetUserDTO[]) {
		const bulkDeleteCallback = async () => {
			try {
				const userIds = usersToDelete.map((u) => u.userId);
				const { deleted } = await this.userService.bulkDeleteUsers(userIds);

				this.list.remove((u) => deleted.includes(u.userId));
				this.notificationService.showSnackbar(
					`${deleted.length} ${this.translateService.translate(deleted.length > 1 ? 'USERS.ERRORS.USERS_DELETED_SUFFIX_PLURAL' : 'USERS.ERRORS.USERS_DELETED_SUFFIX_SINGULAR')}`
				);
				await this.list.autoLoadIfEmpty();
			} catch (error) {
				this.log.e('Error deleting users:', error);

				const { deleted, failed } = parseBulkDeleteError<{ userId: string; error: string }>(error);

				// Nothing structured to report (401, 500, network drop): plain failure.
				if (deleted.length === 0 && failed.length === 0) {
					this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.USERS_DELETE_FAILED'));
					return;
				}

				// Partial result: some users were deleted, some not.
				this.list.remove((u) => deleted.includes(u.userId));

				let message = '';

				if (deleted.length > 0) {
					message += `${deleted.length} ${this.translateService.translate(deleted.length > 1 ? 'USERS.ERRORS.USERS_DELETED_SUFFIX_PLURAL' : 'USERS.ERRORS.USERS_DELETED_SUFFIX_SINGULAR')} `;
				}

				if (failed.length > 0) {
					message += `${failed.length} ${this.translateService.translate(failed.length > 1 ? 'USERS.ERRORS.USERS_FAILED_SUFFIX_PLURAL' : 'USERS.ERRORS.USERS_FAILED_SUFFIX_SINGULAR')}`;
				}

				this.notificationService.showSnackbar(message.trim());
				await this.list.autoLoadIfEmpty();
			}
		};

		const count = usersToDelete.length;
		this.notificationService.showDialog({
			...this.dialogPresetsService.getBulkDeleteUsersDialogPreset(count),
			confirmCallback: bulkDeleteCallback
		});
	}

	async onUserClick(userId: string) {
		try {
			await this.navigateToUserProfile(userId);
		} catch (error) {
			this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.USER_PROFILE_NAVIGATION_FAILED'));
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
}
