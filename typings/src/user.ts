export interface User {
    username: string;
    role: Role;
}

export const enum Role {
    ADMIN = 'admin',
    USER = 'user'
}
