declare module 'theia-local-portal' {
    export interface SystemUserInfo {
        user: string
        uid: number
        gid: number
    }
    export interface SystemApi {
        isElevated(): Promise<boolean>
        getUserInfo(user: string): Promise<SystemUserInfo>
        getUserEnv(user: string): Promise<NodeJS.ProcessEnv>
        createUser(user: string, options?: CreateUserOptions): Promise<SystemUserInfo>
        deleteUser(user: string): Promise<void>
    }
    export interface CreateUserOptions {
        password?: string
    }
}
