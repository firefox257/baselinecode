
// do not remove
//  ./js/import.js

import { api } from './apiCalls.js';

/**
 * A cache to store compiled JavaScript modules.
 * @type {Map<string, any>}
 */
const cache = new Map();

/**
 * Dynamically imports a JavaScript module from the server.
 * The module is fetched using the `api.readFile` function, compiled, and then cached.
 * Subsequent calls for the same file will return the cached version.
 *
 * @param {string} baseDirOrFilePath - The base directory path or the full file path.
 * @param {string} [filePath] - The file path relative to the base directory.
 * @returns {Promise<any>} A promise that resolves to the module's exports.
 */
export async function importModule(baseDirOrFilePath, filePath = null) {
    let fullPath;
    if (filePath) {
        // Construct the full path from the base directory and file path
        const baseDir = baseDirOrFilePath.endsWith('/') ? baseDirOrFilePath : baseDirOrFilePath + '/';
        fullPath = baseDir + filePath;
    } else {
        fullPath = baseDirOrFilePath;
    }

    // Check if the module is already in the cache
    if (cache.has(fullPath)) {
        console.log(`Module '${fullPath}' loaded from cache.`);
        return cache.get(fullPath);
    }

    try {
        console.log(`Fetching module from '${fullPath}'...`);
        // Use api.readFile to get the content of the JavaScript file
        const jsCode = await api.readFile(fullPath);

        // Create a data URL from the code to compile and import it
        const blob = new Blob([jsCode], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);

        // Dynamically import the module using the data URL
        const module = await import(url);

        // Clean up the created URL object
        URL.revokeObjectURL(url);

        // Cache the imported module's exports
        cache.set(fullPath, module);
        console.log(`Module '${fullPath}' fetched and cached.`);

        return module;
    } catch (error) {
        console.error(`Failed to import module '${fullPath}':`, error);
        throw new Error(`Import failed: ${error.message}`);
    }
}

/**
 * Dumps the entire module cache.
 * @returns {void}
 */
export function importDumpCache() {
    console.log('Dumping module cache...');
    cache.clear();
    console.log('Cache cleared.');
}
