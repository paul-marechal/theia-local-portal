import os from 'node:os';
import { execa } from 'execa';

/** @type {import("theia-local-portal").SystemApi} */
const api = {

    async isElevated() {
        return os.userInfo().uid === 0;
    },

    async getUserInfo(user) {
        const { stdout: userInfo } = await execa('id', [user]);
        const [, rawUid, rawGid] = /^uid=(\d+)\S* gid=(\d+)\S* /g.exec(userInfo);
        const uid = Number.parseInt(rawUid);
        const gid = Number.parseInt(rawGid);
        if (!validId(uid) || !validId(gid)) {
            throw new TypeError(`invalid uid=${rawUid} gid=${rawGid}`);
        }
        return { user, uid, gid };
    },

    async getUserEnv(user) {
        const { stdout } = await execa('sudo', ['-u', user, '--', 'env']);
        /** @type {NodeJS.ProcessEnv} */
        const env = {};
        stdout.split('\n').forEach(line => {
            const [key, value] = line.split('=', 2);
            env[key] = value;
        });
        return env;
    },

    async createUser(user, options) {
        if (options?.password) {
            console.warn('CreateUserOptions.password not supported!');
        }
        await execa('adduser', ['--disabled-password', '--gecos', '', user], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        // todo: parse adduser's output instead?
        return this.getUserInfo(user);
    },

    async deleteUser(user) {
        await execa('deluser', ['--remove-home', user]);
    }
};
export default api;

/**
 * @param {any} id
 * @returns {boolean}
 */
function validId(id) {
    return typeof id === 'number' && !Number.isNaN(id);
}
