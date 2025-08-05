
/*


create text documentation
*/


/*
do not remove!!!
location is at ./js/apiCalls.js
*/


/** @typedef {Object} FileInfo
 * @property {string} name - The name of the file or directory.
 * @property {'file' | 'directory'} type - The type of the item.
 * @property {number} size - The size of the file in bytes (0 for directories).
 * @property {string} modifiedTime - The ISO 8601 formatted last modified timestamp.
 * @property {number} modifiedTimeMs - The last modified timestamp in milliseconds.
 */

/**
 * Makes an API call to the server with custom headers.
 * @param {string} method - The HTTP method (GET, POST, PUT, DELETE).
 * @param {string} endpoint - The path to the endpoint on the server (e.g., '/').
 * @param {Object} [headers={}] - Custom headers for the request.
 * @param {string | Blob | File | FormData | URLSearchParams} [body=null] - The request body for POST/PUT requests.
 * Can be a string (for text/plain), Blob/File (for binary), FormData, or URLSearchParams.
 * @returns {Promise<string | Object>} - The response text or parsed JSON.
 */
async function makeApiCall(method, endpoint, headers = {}, body = null) {
    const options = {
        method: method,
        headers: {
            // Default Content-Type. This will be overridden or omitted for binary data types.
            'Content-Type': 'text/plain',
            ...headers
        }
    };

    if (body !== null) {
        // --- MODIFIED LOGIC TO HANDLE DIFFERENT BODY TYPES ---
        if (body instanceof Blob || body instanceof File) {
            // If the body is a Blob or File, set options.body directly.
            options.body = body;
            // Crucially, remove the default 'Content-Type': 'text/plain'
            // and let the browser automatically set the correct 'Content-Type' header
            // based on the Blob's type (e.g., 'image/png').
            // If the caller already provided a 'Content-Type' in `headers`, it will be preserved.
            if (!headers['Content-Type']) { // Only delete if caller didn't provide one
                delete options.headers['Content-Type'];
            }
        } else if (body instanceof FormData) {
            // FormData bodies automatically get their Content-Type set by the browser
            options.body = body;
            delete options.headers['Content-Type']; // Let browser handle 'multipart/form-data'
        } else if (body instanceof URLSearchParams) {
            options.body = body;
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        else {
            // For strings or other simple types, treat as text/plain (default)
            options.body = body;
        }
    }

    try {
        const response = await fetch(endpoint, options);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else {
            return await response.text();
        }
    } catch (error) {
        console.error("Network or API call error:", error);
        throw error;
    }
}

const api = {
    /**
     * Lists files and directories on the server.
     * @param {string} path - The path to list, relative to the server's 'files' root. Can include wildcards (e.g., 'public/*.html').
     * @returns {Promise<FileInfo[]>} - A promise that resolves to an array of file/directory information.
     */
    ls: async (path) => {
        if (!path) {
            throw new Error("LS: Path is required.");
        }
        return makeApiCall('GET', '/', { 'X-LS-Path': path });
    },

    /**
     * Reads the content of a file.
     * @param {string} filePath - The path to the file to read, relative to the server's 'files' root.
     * @returns {Promise<string>} - A promise that resolves to the file's content as a string.
     */
    readFile: async (filePath) => {
        if (!filePath) {
            throw new Error("ReadFile: File path is required.");
        }
        return makeApiCall('GET', '/', { 'X-Read-File': filePath });
    },

    /**
     * Saves content to a file. Creates or overwrites the file.
     * This function can now accept a string OR a Blob/File object for content.
     * When providing a Blob/File, ensure the server is configured to receive raw binary data.
     *
     * @param {string} filePath - The path where the file will be saved, relative to the server's 'files' root. Directories in the path will be created if they don't exist.
     * @param {string | Blob | File} content - The content to write to the file. Can be a string (for text) or a Blob/File (for binary).
     * @param {Object} [additionalHeaders={}] - Optional additional headers, especially useful for 'Content-Type' when saving Blobs/Files if the Blob's type isn't sufficient.
     * @returns {Promise<string>} - A promise that resolves to a success message.
     */
    saveFile: async (filePath, content, additionalHeaders = {}) => {
        if (!filePath || content === undefined) {
            throw new Error("SaveFile: File path and content are required.");
        }

        // Merge X-Save-File header with any additional headers
        const headers = { 'X-Save-File': filePath, ...additionalHeaders };

        // makeApiCall will handle the content type based on the 'content' argument's type
        return makeApiCall('POST', '/', headers, content);
    },

    /**
     * Creates a directory path recursively.
     * @param {string} mkPath - The directory path to create, relative to the server's 'files' root.
     * @returns {Promise<string>} - A promise that resolves to a success message.
     */
    mkPath: async (mkPath) => {
        if (!mkPath) {
            throw new Error("MkPath: Path to create is required.");
        }
        return makeApiCall('POST', '/', { 'X-MKPATH': mkPath });
    },

    /**
     * Moves a file or directory (or multiple using wildcards) to a new destination.
     * @param {string} sourcePath - The source path(s) to move, relative to the server's 'files' root. Can include wildcards (e.g., 'public/*.txt').
     * @param {string} destinationPath - The destination directory, relative to the server's 'files' root.
     * @returns {Promise<string>} - A promise that resolves to a success message detailing the move operation.
     */
    mv: async (sourcePath, destinationPath) => {
        if (!sourcePath || !destinationPath) {
            throw new Error("MV: Source and destination paths are required.");
        }
        return makeApiCall('POST', '/', {
            'X-MV-Source': sourcePath,
            'X-MV-Destination': destinationPath
        });
    },

    /**
     * Copies a file or directory (or multiple using wildcards) to a new destination.
     * @param {string} sourcePath - The source path(s) to copy, relative to the server's 'files' root. Can include wildcards (e.g., 'public/*.txt').
     * @param {string} destinationPath - The destination directory, relative to the server's 'files' root.
     * @returns {Promise<string>} - A promise that resolves to a success message detailing the copy operation.
     */
    copy: async (sourcePath, destinationPath) => {
        if (!sourcePath || !destinationPath) {
            throw new Error("COPY: Source and destination paths are required.");
        }
        return makeApiCall('POST', '/', {
            'X-COPY-Source': sourcePath,
            'X-COPY-Destination': destinationPath
        });
    },

    /**
     * Deletes files or directories. Moves to trash first if not already in trash, then permanently deletes from trash.
     * @param {string} delPath - The path(s) to delete, relative to the server's 'files' root. Can include wildcards (e.g., 'temp/*.log').
     * @returns {Promise<string>} - A promise that resolves to a success message detailing the deletion operation.
     */
    del: async (delPath) => {
        if (!delPath) {
            throw new Error("DEL: Path to delete is required.");
        }
        return makeApiCall('DELETE', '/', { 'X-DEL-Path': delPath });
    }
};

export { api };



