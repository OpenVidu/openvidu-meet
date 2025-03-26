export interface User {
    username: string;
    role: UserRole;
}

export const enum UserRole {
    ADMIN = 'admin',
    USER = 'user',
    APP = 'app'
}
