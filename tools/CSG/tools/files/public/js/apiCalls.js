

// ./js/apiCalls.js

/**
 * A basic API module for interacting with the webserver's file system endpoints.
 * This is designed to be imported as an ES Module.
 */
export const api = {
    /**
     * Lists files and directories in a given path.
     * @param {string} lsPath The path to list, relative to the server's root. Can include wildcards.
     * @returns {Promise<Array<Object>>} An array of file and directory info objects.
     */
    async ls(lsPath) {
        try {
            const response = await fetch('/', {
                method: 'GET',
                headers: {
                    'X-LS-Path': lsPath
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned error: ${errorText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('LS API Call Failed:', error);
            throw error;
        }
    },

    /**
     * Reads the content of a specific file.
     * @param {string} filePath The path to the file to read.
     * @returns {Promise<string>} The content of the file as a string.
     */
    async readFile(filePath) {
        try {
            const response = await fetch('/', {
                method: 'GET',
                headers: {
                    'X-Read-File': filePath
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned error: ${errorText}`);
            }

            // Return the raw text content of the file
            return await response.text();
        } catch (error) {
            console.error('READFILE API Call Failed:', error);
            throw error;
        }
    },

    /**
     * Saves content to a specified file path.
     * @param {string} filePath The path to save the file to.
     * @param {string|Blob|ArrayBuffer} content The content to be saved.
     * @returns {Promise<string>} A success message from the server.
     */
    async saveFile(filePath, content) {
        try {
            // The content should be sent as a Blob or other streamable object.
            // This is the most reliable way to ensure the browser sends a proper body.
            const blob = new Blob([content], { type: 'text/plain' });

            const response = await fetch('/', {
                method: 'PUT', // Use PUT for creating/updating a resource
                headers: {
                    'X-Save-File': filePath,
                    // Note: fetch will automatically set the 'Content-Type' and 'Content-Length'
                    // headers correctly for a Blob, which is ideal.
                },
                body: blob // Pass the Blob as the request body
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned error: ${errorText}`);
            }

            return await response.text();
        } catch (error) {
            console.error('SAVEFILE API Call Failed:', error);
            throw error;
        }
    },

    /**
     * Creates a new directory path.
     * @param {string} newPath The directory path to create.
     * @returns {Promise<string>} A success message.
     */
    async mkpath(newPath) {
        try {
            const response = await fetch('/', {
                method: 'POST',
                headers: {
                    'X-MKPATH': newPath
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned error: ${errorText}`);
            }

            return await response.text();
        } catch (error) {
            console.error('MKPATH API Call Failed:', error);
            throw error;
        }
    },

    /**
     * Moves a file or directory.
     * @param {string} sourcePath The path of the item to move.
     * @param {string} destinationPath The destination path.
     * @returns {Promise<string>} A success message.
     */
    async mv(sourcePath, destinationPath) {
        try {
            const response = await fetch('/', {
                method: 'POST',
                headers: {
                    'X-MV-Source': sourcePath,
                    'X-MV-Destination': destinationPath
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned error: ${errorText}`);
            }

            return await response.text();
        } catch (error) {
            console.error('MV API Call Failed:', error);
            throw error;
        }
    },

    /**
     * Copies a file or directory.
     * @param {string} sourcePath The path of the item to copy.
     * @param {string} destinationPath The destination path.
     * @returns {Promise<string>} A success message.
     */
    async copy(sourcePath, destinationPath) {
        try {
            const response = await fetch('/', {
                method: 'POST',
                headers: {
                    'X-COPY-Source': sourcePath,
                    'X-COPY-Destination': destinationPath
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned error: ${errorText}`);
            }

            return await response.text();
        } catch (error) {
            console.error('COPY API Call Failed:', error);
            throw error;
        }
    },

    /**
     * Deletes a file or directory.
     * @param {string} delPath The path of the item to delete.
     * @returns {Promise<string>} A success message.
     */
    async del(delPath) {
        try {
            const response = await fetch('/', {
                method: 'DELETE',
                headers: {
                    'X-DEL-Path': delPath
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned error: ${errorText}`);
            }

            return await response.text();
        } catch (error) {
            console.error('DEL API Call Failed:', error);
            throw error;
        }
    },
};


