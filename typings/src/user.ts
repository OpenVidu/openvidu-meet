export interface User {
    username: string;
    passwordHash: string;
    roles: UserRole[];
}

export const enum UserRole {
    ADMIN = 'admin',
    USER = 'user',
    APP = 'app'
}

export type UserDTO = Omit<User, 'passwordHash'>;
