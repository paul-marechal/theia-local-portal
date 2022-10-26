import yargs from 'yargs';
import register from './commands/register.js';
import runServer from './commands/run-server.js';
import unregister from './commands/unregister.js';
import { AbortError } from './errors.js';
import { match } from './utils.js';

yargs()
    .option('systemApi', {
        description: 'module to use when issuing system commands',
        default: './linux/linux-system-api.js',
        coerce: async api => {
            const mod = await import(api);
            return mod.default ?? mod;
        }
    })
    .command(
        'run [sessionArgv..]',
        'Run the portal server',
        cli => cli
            .positional('sessionArgv', { type: 'string', array: true })
            .option('hostname', { alias: 'h', type: 'string', default: 'localhost' })
            .option('port', { alias: 'p', type: 'number', default: 9090 })
            .option('dbs', { type: 'string', default: 'sessions', description: 'folder containing the session databases' })
            .option('logs', { type: 'string', default: 'logs', description: 'folder containing the session logs' })
            .option('html', { type: 'string', default: 'html', description: 'folder containing the static html files to serve' })
            .option('data', { type: 'string', default: 'data', description: '' }),
        argv => runServer({ ...argv })
    )
    .command(
        'register <user> <date> <timeFrom> <timeTo> [projects..]',
        'Register a user for a given date and time interval',
        cli => cli
            .positional('user', { type: 'string', description: 'username to create' })
            .positional('date', { coerce: match(/\d{4}-\d{2}-\d{2}/), description: 'format: YYYY-MM-DD' })
            .positional('timeFrom', { coerce: match(/\d{2}:\d{2}/), description: 'format: HH:mm' })
            .positional('timeTo', { coerce: match(/\d{2}:\d{2}/), description: 'format: HH:mm' })
            .positional('projects', { type: 'string', array: true, description: 'list of folders to copy into the user home' }),
        argv => register({ ...argv })
    )
    .command(
        'unregister <user>',
        'Unregister a user',
        cli => cli.positional('user', { type: 'string' }),
        argv => unregister({ ...argv })
    )
    .strictCommands()
    .showHelpOnFail(true)
    .parseAsync(process.argv.slice(2))
    .catch(error => {
        if (error instanceof AbortError) {
            process.exitCode = error.exitCode;
            console.error(error.message);
        } else {
            throw error;
        }
    });
