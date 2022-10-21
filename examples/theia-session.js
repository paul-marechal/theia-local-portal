import { execaNode } from 'execa';

const theiaBackendMain = '/opt/theia/examples/browser/src-gen/backend/main.js';
const theiaArgs = ['--hostname', '127.0.0.1', '--port', '0', '--plugins=local-dir:/opt/theia/plugins'];

execaNode(theiaBackendMain, theiaArgs, {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
}).on('message', message => {
    const { port } = /** @type {any} */(message);
    if (port) {
        process.send(port);
    }
});
