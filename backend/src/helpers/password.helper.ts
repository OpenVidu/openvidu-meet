import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export class PasswordHelper {
	static async hashPassword(password: string): Promise<string> {
		return bcrypt.hash(password, SALT_ROUNDS);
	}

	static async verifyPassword(password: string, hash: string): Promise<boolean> {
		return bcrypt.compare(password, hash);
	}
}
