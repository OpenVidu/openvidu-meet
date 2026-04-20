import { MeetUserDTO, MeetUserRole } from '@openvidu-meet/typings';

/**
 * Utility functions for User-related UI operations.
 * These are pure functions that can be shared across user pages and components.
 */
export class UsersUiUtils {
	// TODO: Obtain root admin user ID from backend instead of hardcoding
	private static readonly ROOT_ADMIN_USER_ID = 'admin';

	private static readonly LOWERCASE_CHARSET = 'abcdefghijklmnopqrstuvwxyz';
	private static readonly UPPERCASE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	private static readonly DIGIT_CHARSET = '123456789';
	private static readonly SYMBOL_CHARSET = '.+!@#$%';
	private static readonly PASSWORD_CHARSET =
		UsersUiUtils.LOWERCASE_CHARSET +
		UsersUiUtils.UPPERCASE_CHARSET +
		UsersUiUtils.DIGIT_CHARSET +
		UsersUiUtils.SYMBOL_CHARSET;

	static readonly AVAILABLE_ROLES: MeetUserRole[] = [MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER];

	/**
	 * Gets a human-readable label for a user role.
	 *
	 * @param role - The user role to format
	 * @returns The display label for the given role
	 */
	static getRoleLabel(role: MeetUserRole): string {
		switch (role) {
			case MeetUserRole.ADMIN:
				return 'Admin';
			case MeetUserRole.USER:
				return 'User';
			case MeetUserRole.ROOM_MEMBER:
				return 'Room Member';
			default:
				return role;
		}
	}

	/**
	 * Builds up to two uppercase initials from a user's full name.
	 *
	 * @param name - The full name to convert
	 * @returns A string with up to two initials
	 */
	static getInitials(name: string): string {
		return name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((word) => word[0].toUpperCase())
			.join('');
	}

	/**
	 * Formats a timestamp into a localized long date.
	 *
	 * @param timestamp - Date value expressed as epoch milliseconds
	 * @returns A localized date string
	 */
	static formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	/**
	 * Checks whether the provided user is the root admin account.
	 *
	 * @param user - The user to evaluate
	 * @returns True if the user is the root admin, otherwise false
	 */
	static isRootAdmin(user: MeetUserDTO): boolean {
		return user.userId === UsersUiUtils.ROOT_ADMIN_USER_ID;
	}

	/**
	 * Checks whether a user corresponds to the currently authenticated user.
	 *
	 * @param user - The user to evaluate
	 * @param currentUserId - The authenticated user id
	 * @returns True if both user ids match, otherwise false
	 */
	static isSelf(user: MeetUserDTO, currentUserId: string): boolean {
		return user.userId === currentUserId;
	}

	/**
	 * Checks whether a user is protected from destructive actions.
	 *
	 * @param user - The user to evaluate
	 * @param currentUserId - The authenticated user id
	 * @returns True if the user is root admin or current user, otherwise false
	 */
	static isProtectedUser(user: MeetUserDTO, currentUserId: string): boolean {
		return UsersUiUtils.isRootAdmin(user) || UsersUiUtils.isSelf(user, currentUserId);
	}

	/**
	 * Generates a random temporary password using the configured character set.
	 * The password always includes at least one lowercase letter, one uppercase letter,
	 * one digit, and one symbol.
	 *
	 * @param length - Desired password length
	 * @returns A randomly generated password
	 */
	static generateTemporaryPassword(length = 12): string {
		const normalizedLength = Math.max(4, length);

		const requiredCharacters = [
			UsersUiUtils.pickRandomChar(UsersUiUtils.LOWERCASE_CHARSET),
			UsersUiUtils.pickRandomChar(UsersUiUtils.UPPERCASE_CHARSET),
			UsersUiUtils.pickRandomChar(UsersUiUtils.DIGIT_CHARSET),
			UsersUiUtils.pickRandomChar(UsersUiUtils.SYMBOL_CHARSET)
		];

		const remainingCharacters = Array.from({ length: normalizedLength - requiredCharacters.length }, () =>
			UsersUiUtils.pickRandomChar(UsersUiUtils.PASSWORD_CHARSET)
		);

		const passwordChars = [...requiredCharacters, ...remainingCharacters];
		UsersUiUtils.shuffle(passwordChars);

		return passwordChars.join('');
	}

	private static pickRandomChar(charset: string): string {
		return charset[Math.floor(Math.random() * charset.length)];
	}

	private static shuffle(values: string[]): void {
		for (let i = values.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[values[i], values[j]] = [values[j], values[i]];
		}
	}
}
