import { execa } from 'execa';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureElevated } from '../utils.js';

export default async function({ user, date, timeFrom, timeTo, projects, systemApi }) {
    await ensureElevated(systemApi);
    const dbPath = path.resolve('sessions', `${date}.json`);
    const db = await fs.promises.readFile(dbPath, 'utf8').then(text => JSON.parse(text), error => ({}));
    let sessionId; do {
        sessionId = crypto.randomBytes(20).toString('hex');
    } while (
        sessionId in db
    );
    if (Object.values(db).some(entry => entry.user === user)) {
        throw new Error(`user already defined: ${user}`);
    }
    db[sessionId] = { user, timeFrom, timeTo };
    await fs.promises.writeFile(dbPath, JSON.stringify(db, undefined, 2) + '\n');
    const { uid, gid } = await systemApi.createUser(user);
    const workspace = path.resolve('/', 'home', user, 'workspace');
    await fs.promises.mkdir(workspace, { recursive: true });
    await Promise.all(projects.map(
        project => fs.promises.cp(project, path.join(workspace, path.basename(project)), { recursive: true })
    ));
    await execa('chown', ['-R', `${uid}:${gid}`, workspace]);
}
