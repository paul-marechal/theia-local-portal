import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import cookieParser from 'cookie-parser';
import { execaNode } from 'execa';
import express from 'express';
import http from 'http';
import httpProxy from 'http-proxy';
import { ensureElevated } from '../utils.js';

export default async function({ hostname, port, dbs, logs, html, data, sessionArgv, systemApi }) {
    await ensureElevated(systemApi);

    const today = new Date();
    console.debug(today);

    // WHY A "FULL" YEAR?!
    const year = today.getFullYear().toString(10).padStart(4, '0');
    // MONTHS START AT 0?!
    const month = (today.getMonth() + 1).toString(10).padStart(2, '0');
    // `getDay` RETURNS THE DAY OF WEEK?!
    const day = today.getDate().toString(10).padStart(2, '0');

    const unauthorizedPath = path.resolve(data, 'unauthorized.txt');
    const dbPath = path.resolve(dbs, `${year}-${month}-${day}.json`);
    const db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : {};
    console.debug('Loaded db:', dbPath, db);

    const sessions = {};

    process.on('SIGINT', shutdown);

    const checkSessionsInterval = setInterval(checkSessions, 60_000);

    const cookieMiddleware = cookieParser();

    const portal = express()
        .use(cookieMiddleware)
        .use('/portal', express.Router()
            .get('/auth/:sessionId', extractSessionIdFromParams, findSession, handleSessionAuth, unauthorized)
            .get('/status', extractSessionIdFromCookies, findSession, handleSessionStatus, unauthorized)
            .use('/', express.static(html, { extensions: ['html'] }))
            .use(endWithStatus(404))
        )
        .use('/', extractSessionIdFromCookies, findSession, handleSessionEditor, unauthorized);

    const server = http.createServer(portal)
        .on('upgrade', (req, socket, head) => {
            // @ts-expect-error hack to read cookies from a WebSocket UPGRADE request
            cookieMiddleware(req, undefined, async () => {
                // @ts-expect-error
                const { sessionId } = req.cookies;
                if (sessionId) {
                    const session = await getOrCreateSession(sessionId);
                    if (session) {
                        const proxy = await session.proxyPromise;
                        return proxy.ws(req, socket, head);
                    }
                }
                socket.destroy();
            });
        })
        .listen(port, hostname, () => {
            console.log('portal running on:', hostname, port);
        });

    /**
     * @param {number} status
     * @returns {express.Handler}
     */
    function endWithStatus(status) {
        return (req, res, next) => {
            res.sendStatus(status);
        }
    }

    /**
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     */
    function unauthorized(req, res, next) {
        res.status(401).sendFile(unauthorizedPath);
    }

    /**
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     */
    function extractSessionIdFromCookies(req, res, next) {
        const { sessionId } = req.cookies;
        if (sessionId) {
            res.locals.sessionId = sessionId;
        }
        next();
    }

    /**
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     */
    function extractSessionIdFromParams(req, res, next) {
        const { sessionId } = req.params;
        if (sessionId) {
            res.locals.sessionId = sessionId;
        }
        next();
    }

    /**
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     */
    async function findSession(req, res, next) {
        const { sessionId } = res.locals;
        if (sessionId) {
            const session = await getOrCreateSession(sessionId);
            if (session) {
                res.locals.session = session;
            }
        }
        next();
    }

    /**
     * @param {string} sessionId
     * @return {Promise<object | undefined>}
     */
    async function getOrCreateSession(sessionId) {
        const scheduled = db[sessionId];
        const activeSession = sessions[sessionId];
        if (activeSession) {
            return activeSession;
        } else if (scheduled) {
            const timeFrom = parseScheduledTime(scheduled.timeFrom);
            const timeTo = parseScheduledTime(scheduled.timeTo);
            if (timeFrom > Date.now()) {
                console.debug('Attempt to load a session too soon for', scheduled.user, sessionId);
            } else if (timeTo < Date.now()) {
                console.debug('Attempt to load a session too late for', scheduled.user, sessionId);
            } else {
                console.debug('Creating new session for', scheduled.user, sessionId);
                const session = sessions[sessionId] = await createNewSession(sessionId, scheduled);
                return session;
            }
        }
    }

    /**
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     */
    function handleSessionStatus(req, res, next) {
        const { session } = res.locals;
        if (!session) {
            return next();
        }
        session.proxyPromise.then(
            () => res.send(`/#/home/${session.user}/workspace`),
            error => {
                console.error(error);
                res.sendStatus(500);
            }
        );
    }

    /**
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     */
    function handleSessionAuth(req, res, next) {
        const { session } = res.locals;
        if (!session) {
            return next();
        }
        res.cookie('sessionId', session.id, { httpOnly: true });
        res.redirect(303, `/portal/loading`);
    }

    /**
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     */
    async function handleSessionEditor(req, res, next) {
        const { session } = res.locals;
        if (!session) {
            return next();
        }
        const proxy = await session.proxyPromise;
        proxy.web(req, res);
    }

    /**
     * @param {string} sessionId
     * @param {object} scheduled
     * @returns {Promise<object>}
     */
    async function createNewSession(sessionId, scheduled) {
        const { user } = scheduled;
        const timeFrom = parseScheduledTime(scheduled.timeFrom);
        const timeTo = parseScheduledTime(scheduled.timeTo);
        const log = fs.createWriteStream(path.resolve(logs, `${user}.log`));
        const [{ uid, gid }, userEnv] = await Promise.all([
            systemApi.getUserInfo(user),
            systemApi.getUserEnv(user)
        ]);
        const [sessionBin, ...sessionRest] = sessionArgv;
        const sessionProcess = execaNode(sessionBin, sessionRest, {
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            extendEnv: false,
            env: userEnv,
            uid,
            gid
        });
        sessionProcess.stdout.pipe(log);
        sessionProcess.stderr.pipe(log);
        const session = {
            id: sessionId,
            user,
            timeFrom,
            timeTo,
            sessionProcess,
            dispose() {
                delete sessions[sessionId];
                delete this.proxy;
                sessionProcess.kill();
            }
        };
        session.proxyPromise = new Promise((resolve, reject) => {
            sessionProcess.on('message', function messageReader(maybePort) {
                if (sessionId in sessions && typeof maybePort === 'number') {
                    sessionProcess.off('line', messageReader);
                    resolve(session.proxy = httpProxy.createProxy({ target: `http://127.0.0.1:${maybePort}/` }));
                }
            });
            sessionProcess.once('error', reject);
            sessionProcess.once('close', (code, signal) => {
                reject(new Error(`session process closed ${code || signal}`));
                delete session[sessionId];
            });
        });
        return session;
    }

    function checkSessions() {
        Object.entries(sessions).forEach(([sessionId, session]) => {
            if (!isInInterval(session.timeFrom, Date.now(), session.timeTo)) {
                delete sessions[sessionId];
                session.dispose();
            }
        });
    }

    /**
     * @param {string} scheduledTime HH:SS
     * @returns {number}
     */
    function parseScheduledTime(scheduledTime) {
        const date = new Date(today.getTime());
        const [hour, minute] = scheduledTime.split(':', 2);
        return date.setHours(Number.parseInt(hour), Number.parseInt(minute), 0, 0);
    }

    /**
     * @param {number} lower
     * @param {number} value
     * @param {number} upper
     * @returns {boolean} lower <= value <= upper
     */
    function isInInterval(lower, value, upper) {
        return lower <= value && value <= upper;
    }

    function shutdown() {
        clearInterval(checkSessionsInterval);
        Object.values(sessions).forEach(session => session.dispose());
        server.close();
    }
}
