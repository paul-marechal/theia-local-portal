export class AbortError extends Error {
    constructor(message, options) {
        super('abort: ' + message);
        this.exitCode = options?.exitCode ?? 1;
    }
}
