import path from 'node:path';
import fs from 'node:fs';

export default async function({ user, systemApi }) {
    const sessions = await fs.promises.readdir('sessions');
    await Promise.all(sessions.map(async file => {
        const dbPath = path.join('sessions', file);
        const db = JSON.parse(await fs.promises.readFile(dbPath, 'utf8'));
        const [id] = Object.entries(db).find(([id, entry]) => entry.user === user) ?? [];
        if (id) {
            delete db[id];
            await fs.promises.writeFile(dbPath, JSON.stringify(db, undefined, 2) + '\n');
        }
    }));
    await systemApi.deleteUser(user);
}