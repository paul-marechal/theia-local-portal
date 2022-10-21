import assert from 'assert';
import { AbortError } from './errors.js';

/**
 * @param {RegExp} pattern
 * @returns {<T extends string>(input: T) => T}
 */
export function match(pattern) {
    return input => {
        assert.match(input, pattern);
        return input;
    };
}

/**
 * @param {import('theia-local-portal').SystemApi} systemApi
 * @returns {Promise<void>}
 */
export async function ensureElevated(systemApi) {
    if (!await systemApi.isElevated()) {
        throw new AbortError('please run this script as root!');
    }
}
