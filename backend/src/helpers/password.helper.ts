import bcrypt from 'bcrypt';
import { uid } from 'uid/secure';

const SALT_ROUNDS = 10;

export class PasswordHelper {
	static async hashPassword(password: string): Promise<string> {
		return bcrypt.hash(password, SALT_ROUNDS);
	}

	static async verifyPassword(password: string, hash: string): Promise<boolean> {
		return bcrypt.compare(password, hash);
	}

	// Generate a secure API key using uid with a length of 32 characters
	static generateApiKey(): { key: string; creationDate: string } {
		return { key: `ovmeet-${uid(32)}`, creationDate: new Date().toISOString() };
	}
}
