


//webserver.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util'); // For async file operations

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir); // Promisify fs.mkdir
const rename = promisify(fs.rename); // Promisify fs.rename
const unlink = promisify(fs.unlink); // Promisify fs.unlink
const rm = promisify(fs.rm); // Promisify fs.rm (for recursive delete in Node.js 14+)

// Promisify fs.copyFile for file copying
const copyFile = promisify(fs.copyFile);

const _mimetype = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.js': 'text/javascript',
    '.jpg': 'image/jpeg',
    '.JPG': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.svg': 'image/svg+xml',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.css': 'text/css',
    '.hdr': 'application/octet-stream',
    '.json': 'application/json',
    '.stl': 'application/sla',
    '.dxf': 'application/dxf',
    '.gif': 'image/gif',
    '.woff2': 'font/woff2',
    '.ico': 'image/vnd.microsoft.icon',
    '.glb': 'model/gltf-binary',
    '.wasm': 'application/wasm',
    '.pvr': 'image/x-png',
    '.usdz': 'vnd.usdz+zip',
    '.mpd': 'application/dash+xml',
    '.dae': 'model/vnd.collada+xml',
    '.obj': 'multipart/form-data', // Note: This might not be the most appropriate for single .obj files
    '.ply': 'model/mesh',
    '.3dm': 'model/vnd.3dm',
    '.3ds': 'application/x-3ds',
    '.3mf': 'model/3mf',
    '.amf': 'application/octet-stream',
    '.bvh': 'animation/bvh',
    '.drc': 'application/octet-stream',
    '.fbx': 'application/octet-stream',
    '.gcode': 'text/x-gcode',
    '.kmz': 'application/vnd.google-earth.kmz+xml',
    '.lwo': 'image/x-lwo',
    '.md2': 'model/md2',
    '.mdd': 'application/octet-stream',
    '.nrrd': 'application/octet-stream',
    '.mtl': 'text/plain',
    '.pcd': 'application/vnd.pointcloud+json',
    '.pdb': 'chemical/pdb',
    '.vox': 'application/octet-stream',
    '.wrl': 'model/x3d-vrl',
    '.vtk': 'application/octet-stream',
    '.dds': 'image/vnd.ms-dds',
    '.exr': 'application/octet-stream',
    '.ktx': 'application/octet-stream',
    '.ktx2': 'application/octet-stream',
    '.tga': 'image/x-tga',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.ttf': 'font/ttf',
    '.vtp': 'application/vibrationview',
    '.zip': 'application/zip',
    '.xyz': 'application/octet-stream',
    '.webm': 'video/webm',
    '.wat': 'text/plain' // Added .wat mimetype
}

const serverOptions = {
    port: 80,
    sslport: 443,
    key: './key.pem', // Make sure these paths are correct
    cert: './cert.pem', // Make sure these paths are correct
    additionalMethods: []
}

const allowHead = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':
        'OPTIONS, POST, GET, PUT, PATCH, DELETE',
    'Access-Control-Max-Age': 2592000, //30 days
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-LS-Path, X-Read-File, X-Save-File, X-File-Path, X-File-Content, X-MKPATH, X-MV-Source, X-MV-Destination, X-DEL-Path, X-COPY-Source, X-COPY-Destination' // Added custom headers for MKPATH, MV, DEL, COPY
}

// Global response handlers
globalThis.sendPlainTextResponse = function (res, message, statusCode = 200, headers = {}) {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain', ...headers });
    res.end(typeof message === 'object' ? JSON.stringify(message) : message);
};

globalThis.sendJsonResponse = function (res, data, statusCode = 200, headers = {}) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(data));
};

/**
 * Handles streaming files.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {string} filePath - The path to the file to stream.
 * @param {string} contentType - The MIME type of the file.
 * @param {number} statusCode - The HTTP status code.
 * @param {object} headers - Additional headers to include.
 */
globalThis.streamFile = function (req, res, filePath, contentType, statusCode = 200, headers = {}) {
    fs.stat(filePath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                sendPlainTextResponse(res, '404 Not Found', 404);
            } else {
                sendPlainTextResponse(res, '500 Internal Server Error', 500);
            }
            return;
        }

        const fileSize = stats.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            const streamHeaders = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
                ...headers
            };

            res.writeHead(206, streamHeaders); // Partial Content
            const fileStream = fs.createReadStream(filePath, { start, end });
            fileStream.pipe(res);
        } else {
            const streamHeaders = {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                ...headers
            };
            res.writeHead(statusCode, streamHeaders);
            fs.createReadStream(filePath).pipe(res);
        }
    });
};

const apiCache = new Map(); // Stores loaded API modules and their last access time

/**
 * Handles file requests, including range requests.
 * @param {http.ServerRequest} req - The HTTP request object.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {string} filePath - The absolute path to the file.
 */
function handleFileRequest(req, res, filePath) {
    //console.log(filePath)
    fs.stat(filePath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                sendPlainTextResponse(res, '404 Not Found', 404);
            } else {
                sendPlainTextResponse(res, '500 Internal Server Error', 500);
            }
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = _mimetype[ext] || 'application/octet-stream';

        streamFile(req, res, filePath, contentType);
    });
}

/**
 * Loads and calls API files dynamically.
 * @param {http.ServerRequest} req - The HTTP request object.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {string} apiName - The name of the API (e.g., 'data' for data.api.js).
 */
async function handleApiRequest(req, res, apiName) {
    // Corrected path for API files to include 'files/api'
    const apiFilePath = path.join(__dirname, 'files', 'api', `${apiName}.api.js`);

    if (apiCache.has(apiName)) {
        const cachedApi = apiCache.get(apiName);
        cachedApi.lastAccessed = Date.now();
        try {
            await cachedApi.module.handler(req, res);
        } catch (error) {
            console.error(`Error executing cached API ${apiName}:`, error);
            sendPlainTextResponse(res, '500 Internal Server Error', 500);
        }
    } else {
        fs.access(apiFilePath, fs.constants.F_OK, async (err) => {
            if (err) {
                sendPlainTextResponse(res, `404 API Not Found: ${apiName}`, 404);
                return;
            }

            try {
                // Clear module from cache to ensure fresh load in development,
                // or if the file changed on disk. In production, consider
                // more robust caching or restart for updates.
                delete require.cache[require.resolve(apiFilePath)];
                const apiModule = require(apiFilePath);
                if (typeof apiModule.handler === 'function') {
                    apiCache.set(apiName, { module: apiModule, lastAccessed: Date.now() });
                    await apiModule.handler(req, res);
                } else {
                    sendPlainTextResponse(res, `500 API Error: ${apiName}.api.js does not export a 'handler' function.`, 500);
                }
            } catch (error) {
                console.error(`Error loading or executing API ${apiName}:`, error);
                sendPlainTextResponse(res, '500 Internal Server Error', 500);
            }
        });
    }
}

// Function to unload APIs if not used for an hour
setInterval(() => {
    const now = Date.now();
    for (const [apiName, apiInfo] of apiCache.entries()) {
        const oneHour = 60 * 60 * 1000;
        if (now - apiInfo.lastAccessed > oneHour) {
            console.log(`Unloading API: ${apiName}.api.js due to inactivity.`);
            // Corrected path for API files to include 'files/api'
            const apiFilePath = path.join(__dirname, 'files', 'api', `${apiName}.api.js`);
            // Remove from require cache to allow for fresh load next time
            delete require.cache[require.resolve(apiFilePath)];
            apiCache.delete(apiName);
        }
    }
}, 10 * 60 * 1000); // Check every 10 minutes


// --- New LS, READFILE, SAVEFILE functionality ---

const FILES_ROOT = path.join(__dirname, 'files');
const TRASH_DIR = path.join(FILES_ROOT, 'trash'); // Define the trash directory

/**
 * Handles LS (list files) functionality.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {string} lsPath - The path from the 'files' directory to list. Can include wildcards.
 */
async function handleLs(res, lsPath) {
    const hasWildcard = lsPath.includes('*');
    let targetDirectory = path.join(FILES_ROOT, path.dirname(lsPath)); // Directory to read
    let pattern = hasWildcard ? path.basename(lsPath) : null; // Pattern to filter by

    // Basic path traversal prevention for the target directory
    if (!targetDirectory.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid LS path.', 403);
    }

    try {
        // First, check if the targetDirectory actually exists and is a directory
        const dirStats = await stat(targetDirectory);
        if (!dirStats.isDirectory()) {
            // If the targetDirectory from the path (e.g., /public/index.html in /public/*.html)
            // is not a directory, it means the base path for wildcard is invalid or
            // the whole lsPath is pointing to a specific non-existent file without wildcard
            return sendPlainTextResponse(res, `LS Error: Base path is not a directory or does not exist: ${path.dirname(lsPath)}`, 404);
        }

        let files = await readdir(targetDirectory);
        let filteredFiles = [];

        if (hasWildcard) {
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            filteredFiles = files.filter(file => regex.test(file));
        } else {
            // If no wildcard, check if the full path resolves to a specific file or directory
            const specificPath = path.join(FILES_ROOT, lsPath);
            try {
                const specificStats = await stat(specificPath);
                if (specificStats.isFile()) {
                    // If it's a direct file request, return only that file's info
                    sendJsonResponse(res, [{
                        name: path.basename(specificPath),
                        type: 'file',
                        size: specificStats.size,
                        modifiedTime: specificStats.mtime.toISOString(),
                        modifiedTimeMs: specificStats.mtime.getTime()
                    }]);
                    return; // Exit here as we've responded
                } else if (specificStats.isDirectory()) {
                    // If it's a direct directory request, list all its contents
                    filteredFiles = files; // All files in the directory
                }
            } catch (err) {
                // If specificPath doesn't exist, it means the user asked for a non-existent file/directory
                // without a wildcard. In this case, we proceed to check if the base directory exists
                // and return an empty list or 404 if the directory itself doesn't exist.
                // Or if base directory exists, but specific file doesn't, we should treat it as "no matching files"
                if (err.code === 'ENOENT' && !hasWildcard) {
                     sendPlainTextResponse(res, `LS Error: Path not found: ${lsPath}`, 404);
                     return;
                }
            }
        }
        
        // If we reached here, it means it's either a wildcard search or a direct directory listing
        const fileInfoList = [];
        const filesToProcess = hasWildcard ? filteredFiles : files; // Use filtered list for wildcards, full list for direct directory
        
        for (const file of filesToProcess) {
            const filePath = path.join(targetDirectory, file);
            try {
                const fileStats = await stat(filePath);
                fileInfoList.push({
                    name: file,
                    type: fileStats.isDirectory() ? 'directory' : 'file',
                    size: fileStats.size,
                    modifiedTime: fileStats.mtime.toISOString(),
                    modifiedTimeMs: fileStats.mtime.getTime()
                });
            } catch (err) {
                console.warn(`Could not get stats for ${filePath}: ${err.message}`);
                // Optionally, include a note about the error or skip
            }
        }
        sendJsonResponse(res, fileInfoList);

    } catch (error) {
        if (error.code === 'ENOENT') {
            sendPlainTextResponse(res, `LS Error: Path not found or base directory for wildcard does not exist: ${lsPath}`, 404);
        } else {
            console.error(`LS Internal Server Error for path "${lsPath}": ${error.message}`);
            sendPlainTextResponse(res, `LS Internal Server Error: ${error.message}`, 500);
        }
    }
}

/**
 * Reads a file in plain text.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {string} filePathHeader - The path from the 'files' directory to read.
 */
async function handleReadFile(res, filePathHeader) {
    const fullPath = path.join(FILES_ROOT, filePathHeader);

    // Basic path traversal prevention
    if (!fullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid file path.', 403);
    }

    try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
            return sendPlainTextResponse(res, 'READFILE Error: Cannot read a directory.', 400);
        }
        // Reading as a buffer by default to handle all file types.
        // If you specifically need text, you would specify 'utf8'.
        const content = await readFile(fullPath); 
        // Determine content type based on file extension
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = _mimetype[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            sendPlainTextResponse(res, `READFILE Error: File not found: ${filePathHeader}`, 404);
        } else {
            console.error(`READFILE Error: ${error.message}`);
            sendPlainTextResponse(res, `READFILE Internal Server Error: ${error.message}`, 500);
        }
    }
}

/**
 * Saves content to a file.
 * @param {http.ServerRequest} req - The HTTP request object.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {string} filePathHeader - The path from the 'files' directory to save.
 */
async function handleSaveFile(req, res, filePathHeader) {
    const fullPath = path.join(FILES_ROOT, filePathHeader);

    // Basic path traversal prevention
    if (!fullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid file path.', 403);
    }

    const chunks = [];
    req.on('data', chunk => {
		console.log("saving chunk");
        chunks.push(chunk); // Collect chunks as Buffers
    });

    req.on('end', async () => {
        try {
            // Concatenate all chunks into a single Buffer
            const buffer = Buffer.concat(chunks); 

            // Ensure the directory exists before writing the file
            const dir = path.dirname(fullPath);
            await mkdir(dir, { recursive: true });

            // Write the Buffer directly to the file
            await writeFile(fullPath, buffer); 
            sendPlainTextResponse(res, `File saved successfully: ${filePathHeader}`, 200);
        } catch (error) {
            console.error(`SAVEFILE Error: ${error.message}`);
            sendPlainTextResponse(res, `SAVEFILE Internal Server Error: ${error.message}`, 500);
        }
    });

    req.on('error', (error) => {
        console.error(`Request error during SAVEFILE: ${error.message}`);
        sendPlainTextResponse(res, 'Request Error during SAVEFILE', 500);
    });
}

/**
 * Creates a path of directories. If a directory in a path doesn't exist, it's created.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {string} mkPathHeader - The path of directories to create, relative to FILES_ROOT.
 */
async function handleMkpath(res, mkPathHeader) {
    const fullPath = path.join(FILES_ROOT, mkPathHeader);

    // Basic path traversal prevention
    if (!fullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid MKPATH.', 403);
    }

    try {
        await mkdir(fullPath, { recursive: true });
        sendPlainTextResponse(res, `Path created successfully: ${mkPathHeader}`, 200);
    } catch (error) {
        if (error.code === 'EEXIST') {
            sendPlainTextResponse(res, `MKPATH Warning: Path already exists: ${mkPathHeader}`, 200);
        } else {
            console.error(`MKPATH Error: ${error.message}`);
            sendPlainTextResponse(res, `MKPATH Internal Server Error: ${error.message}`, 500);
        }
    }
}

/**
 * Moves file/files or directory/directories into another path. Supports wildcards.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {string} mvSourceHeader - The source path(s) (can include wildcards) relative to FILES_ROOT.
 * @param {string} mvDestinationHeader - The destination directory relative to FILES_ROOT.
 */
async function handleMv(res, mvSourceHeader, mvDestinationHeader) {
    const sourceFullPath = path.join(FILES_ROOT, mvSourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, mvDestinationHeader);

    // Basic path traversal prevention for both source and destination
    if (!sourceFullPath.startsWith(FILES_ROOT) || !destinationFullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid MV source or destination path.', 403);
    }

    try {
        const destinationStats = await stat(destinationFullPath);
        if (!destinationStats.isDirectory()) {
            return sendPlainTextResponse(res, `MV Error: Destination is not a directory: ${mvDestinationHeader}`, 400);
        }

        const hasWildcard = mvSourceHeader.includes('*');
        let filesToMove = [];
        let baseSourceDir = path.dirname(sourceFullPath);
        let pattern = hasWildcard ? path.basename(sourceFullPath) : null;

        if (hasWildcard) {
            try {
                const sourceFiles = await readdir(baseSourceDir);
                const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                filesToMove = sourceFiles
                    .filter(file => regex.test(file))
                    .map(file => path.join(baseSourceDir, file));
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `MV Error: Source directory for wildcard not found: ${path.dirname(mvSourceHeader)}`, 404);
                }
                throw err; // Re-throw other errors
            }
        } else {
            // No wildcard, check if the specific source exists
            try {
                await stat(sourceFullPath); // Just to check if it exists
                filesToMove.push(sourceFullPath);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `MV Error: Source not found: ${mvSourceHeader}`, 404);
                }
                throw err;
            }
        }

        if (filesToMove.length === 0) {
            return sendPlainTextResponse(res, `MV Warning: No files or directories matched the source: ${mvSourceHeader}`, 200);
        }

        const results = [];
        for (const fileToMove of filesToMove) {
            const fileName = path.basename(fileToMove);
            const finalDestinationPath = path.join(destinationFullPath, fileName);
            try {
                await rename(fileToMove, finalDestinationPath);
                results.push(`Moved: ${path.relative(FILES_ROOT, fileToMove)} to ${path.relative(FILES_ROOT, finalDestinationPath)}`);
            } catch (moveError) {
                console.error(`Error moving ${fileToMove}: ${moveError.message}`);
                results.push(`Failed to move ${path.relative(FILES_ROOT, fileToMove)}: ${moveError.message}`);
            }
        }
        sendPlainTextResponse(res, `MV Operation complete:\n${results.join('\n')}`, 200);

    } catch (error) {
        console.error(`MV Internal Server Error: ${error.message}`);
        sendPlainTextResponse(res, `MV Internal Server Error: ${error.message}`, 500);
    }
}

/**
 * Recursively copies a directory.
 * @param {string} src - The source directory path.
 * @param {string} dest - The destination directory path.
 */
async function copyDirectoryRecursive(src, dest) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectoryRecursive(srcPath, destPath);
        } else {
            await copyFile(srcPath, destPath);
        }
    }
}

/**
 * Copies file/files or directory/directories into another path. Supports wildcards.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {string} copySourceHeader - The source path(s) (can include wildcards) relative to FILES_ROOT.
 * @param {string} copyDestinationHeader - The destination directory relative to FILES_ROOT.
 */
async function handleCopy(res, copySourceHeader, copyDestinationHeader) {
    const sourceFullPath = path.join(FILES_ROOT, copySourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, copyDestinationHeader);

    // Basic path traversal prevention for both source and destination
    if (!sourceFullPath.startsWith(FILES_ROOT) || !destinationFullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid COPY source or destination path.', 403);
    }

    try {
        // Ensure the destinationFullPath is a directory or its parent exists if it's a file path
        // For COPY, if destinationFullPath is meant to be a directory, it must exist.
        // If it's a file, its parent must exist.
        let actualDestinationDir = destinationFullPath;
        try {
            const destStats = await stat(destinationFullPath);
            if (!destStats.isDirectory()) {
                // If destinationFullPath exists but is a file, we can't copy into it as a directory.
                // Or if it's a file that will be overwritten, its parent directory must exist.
                // In a COPY operation into a specified "destination directory", this case should usually imply an error,
                // or if the intent is to rename during copy, then the parent directory of the new name must exist.
                // For simplicity and alignment with the MV operation, we assume copyDestinationHeader refers to a *directory*.
                return sendPlainTextResponse(res, `COPY Error: Destination is not a directory: ${copyDestinationHeader}`, 400);
            }
        } catch (err) {
            if (err.code === 'ENOENT') {
                // If destinationFullPath doesn't exist, it means we need to create it recursively.
                // This handles cases like `COPY source/file.txt to_new_dir/` where `to_new_dir` doesn't exist.
                await mkdir(destinationFullPath, { recursive: true });
                // Now that it's created, it's a directory.
            } else {
                throw err; // Re-throw other stat errors
            }
        }


        const hasWildcard = copySourceHeader.includes('*');
        let itemsToCopy = [];
        let baseSourceDir = path.dirname(sourceFullPath);
        let pattern = hasWildcard ? path.basename(sourceFullPath) : null;

        if (hasWildcard) {
            try {
                const sourceEntries = await readdir(baseSourceDir);
                const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                itemsToCopy = sourceEntries
                    .filter(entry => regex.test(entry))
                    .map(entry => path.join(baseSourceDir, entry));
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `COPY Error: Source directory for wildcard not found: ${path.dirname(copySourceHeader)}`, 404);
                }
                throw err;
            }
        } else {
            // No wildcard, check if the specific source exists
            try {
                await stat(sourceFullPath);
                itemsToCopy.push(sourceFullPath);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `COPY Error: Source not found: ${copySourceHeader}`, 404);
                }
                throw err;
            }
        }

        if (itemsToCopy.length === 0) {
            return sendPlainTextResponse(res, `COPY Warning: No files or directories matched the source: ${copySourceHeader}`, 200);
        }

        const results = [];
        for (const itemToCopy of itemsToCopy) {
            const itemName = path.basename(itemToCopy);
            const finalDestinationPath = path.join(destinationFullPath, itemName); // Destination is guaranteed to be a directory at this point

            try {
                const itemStats = await stat(itemToCopy);
                if (itemStats.isDirectory()) {
                    await copyDirectoryRecursive(itemToCopy, finalDestinationPath);
                    results.push(`Copied directory: ${path.relative(FILES_ROOT, itemToCopy)} to ${path.relative(FILES_ROOT, finalDestinationPath)}`);
                } else {
                    // For files, ensure the parent directory of the finalDestinationPath exists
                    const parentDirOfFile = path.dirname(finalDestinationPath);
                    await mkdir(parentDirOfFile, { recursive: true }); // Ensure parent directory exists for the file
                    await copyFile(itemToCopy, finalDestinationPath);
                    results.push(`Copied file: ${path.relative(FILES_ROOT, itemToCopy)} to ${path.relative(FILES_ROOT, finalDestinationPath)}`);
                }
            } catch (copyError) {
                console.error(`Error copying ${itemToCopy}: ${copyError.message}`);
                results.push(`Failed to copy ${path.relative(FILES_ROOT, itemToCopy)}: ${copyError.message}`);
            }
        }
        sendPlainTextResponse(res, `COPY Operation complete:\n${results.join('\n')}`, 200);

    } catch (error) {
        console.error(`COPY Internal Server Error: ${error.message}`);
        sendPlainTextResponse(res, `COPY Internal Server Error: ${error.message}`, 500);
    }
}


/**
 * Moves file/files directory/directories into files/trash directory.
 * If the DEL is in files/trash then permanently remove the files and directories.
 * DEL has wildcards like LS for filtering.
 * @param {http.ServerResponse} res - The HTTP response object.
 * @param {string} delPathHeader - The path(s) to delete (can include wildcards) relative to FILES_ROOT.
 */
async function handleDel(res, delPathHeader) {
    const fullPathToDelete = path.join(FILES_ROOT, delPathHeader);

    // Basic path traversal prevention
    if (!fullPathToDelete.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid DEL path.', 403);
    }

    try {
        const hasWildcard = delPathHeader.includes('*');
        let itemsToDelete = [];
        let baseDeleteDir = path.dirname(fullPathToDelete);
        let pattern = hasWildcard ? path.basename(fullPathToDelete) : null;

        if (hasWildcard) {
            try {
                const sourceFiles = await readdir(baseDeleteDir);
                const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                itemsToDelete = sourceFiles
                    .filter(file => regex.test(file))
                    .map(file => path.join(baseDeleteDir, file));
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `DEL Error: Source directory for wildcard not found: ${path.dirname(delPathHeader)}`, 404);
                }
                throw err;
            }
        } else {
            // No wildcard, check if the specific item exists
            try {
                await stat(fullPathToDelete);
                itemsToDelete.push(fullPathToDelete);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `DEL Error: Item not found: ${delPathHeader}`, 404);
                }
                throw err;
            }
        }

        if (itemsToDelete.length === 0) {
            return sendPlainTextResponse(res, `DEL Warning: No files or directories matched for deletion: ${delPathHeader}`, 200);
        }

        const results = [];
        for (const itemPath of itemsToDelete) {
            const relativeItemPath = path.relative(FILES_ROOT, itemPath);
            try {
                const itemStats = await stat(itemPath);
                const isDirectory = itemStats.isDirectory();

                // Check if the item is already in the trash directory
                if (itemPath.startsWith(TRASH_DIR + path.sep) || itemPath === TRASH_DIR) {
                    // Permanent deletion from trash
                    if (isDirectory) {
                        await rm(itemPath, { recursive: true, force: true });
                        results.push(`Permanently deleted directory from trash: ${relativeItemPath}`);
                    } else {
                        await unlink(itemPath);
                        results.push(`Permanently deleted file from trash: ${relativeItemPath}`);
                    }
                } else {
                    // Move to trash
                    await mkdir(TRASH_DIR, { recursive: true }); // Ensure trash directory exists
                    const trashDestination = path.join(TRASH_DIR, path.basename(itemPath));
                    await rename(itemPath, trashDestination);
                    results.push(`Moved to trash: ${relativeItemPath}`);
                }
            } catch (deleteError) {
                console.error(`Error deleting/moving ${itemPath}: ${deleteError.message}`);
                results.push(`Failed to delete/move ${relativeItemPath}: ${deleteError.message}`);
            }
        }
        sendPlainTextResponse(res, `DEL Operation complete:\n${results.join('\n')}`, 200);

    } catch (error) {
        console.error(`DEL Internal Server Error: ${error.message}`);
        sendPlainTextResponse(res, `DEL Internal Server Error: ${error.message}`, 500);
    }
}

/**
 * The single web handler for all HTTP and HTTPS requests.
 * @param {http.ServerRequest} req - The HTTP request object.
 * @param {http.ServerResponse} res - The HTTP response object.
 */
function webHandler(req, res) {
    // Handle OPTIONS preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(204, allowHead);
        res.end();
        return;
    }

    const requestedUrl = new URL(req.url, `http://${req.headers.host}`); // Use http as base for URL parsing
    const pathname = requestedUrl.pathname;

    // --- Check for custom headers for LS, READFILE, SAVEFILE, MKPATH, MV, DEL, COPY ---
    const lsPath = req.headers['x-ls-path'];
    const readFileHeader = req.headers['x-read-file'];
    const saveFileHeader = req.headers['x-save-file'];
    const mkPathHeader = req.headers['x-mkpath'];
    const mvSourceHeader = req.headers['x-mv-source'];
    const mvDestinationHeader = req.headers['x-mv-destination'];
    const delPathHeader = req.headers['x-del-path'];
    const copySourceHeader = req.headers['x-copy-source']; // New COPY header
    const copyDestinationHeader = req.headers['x-copy-destination']; // New COPY header


    if (lsPath) {
        handleLs(res, lsPath);
        return;
    }

    if (readFileHeader) {
        handleReadFile(res, readFileHeader);
        return;
    }

    if (saveFileHeader) {
        if (req.method === 'POST' || req.method === 'PUT') {
            handleSaveFile(req, res, saveFileHeader);
        } else {
            sendPlainTextResponse(res, 'SAVEFILE requires POST or PUT method.', 405);
        }
        return;
    }

    if (mkPathHeader) {
        if (req.method === 'POST' || req.method === 'PUT') {
            handleMkpath(res, mkPathHeader);
        } else {
            sendPlainTextResponse(res, 'MKPATH requires POST or PUT method.', 405);
        }
        return;
    }

    if (mvSourceHeader && mvDestinationHeader) {
        if (req.method === 'POST' || req.method === 'PUT') { // MV can be seen as modifying resources
            handleMv(res, mvSourceHeader, mvDestinationHeader);
        } else {
            sendPlainTextResponse(res, 'MV requires POST or PUT method.', 405);
        }
        return;
    } else if (mvSourceHeader || mvDestinationHeader) { // One is present, but not both
        sendPlainTextResponse(res, 'Both X-MV-Source and X-MV-Destination headers are required for MV operation.', 400);
        return;
    }

    // New COPY handling
    if (copySourceHeader && copyDestinationHeader) {
        if (req.method === 'POST' || req.method === 'PUT') { // COPY can be seen as creating/modifying resources
            handleCopy(res, copySourceHeader, copyDestinationHeader);
        } else {
            sendPlainTextResponse(res, 'COPY requires POST or PUT method.', 405);
        }
        return;
    } else if (copySourceHeader || copyDestinationHeader) { // One is present, but not both
        sendPlainTextResponse(res, 'Both X-COPY-Source and X-COPY-Destination headers are required for COPY operation.', 400);
        return;
    }

    if (delPathHeader) {
        if (req.method === 'DELETE') {
            handleDel(res, delPathHeader);
        } else {
            sendPlainTextResponse(res, 'DEL requires DELETE method.', 405);
        }
        return;
    }

    // Handle API routes ending with .api.js
    if (pathname.endsWith('.api.js')) {
        // Extract the apiName by removing the leading '/' and the '.api.js' extension
        const apiName = path.basename(pathname, '.api.js');
        handleApiRequest(req, res, apiName);
        return;
    }

    // Serve static files from 'public' directory
    // Corrected path for public files to include 'files/public'
    const filePath = path.join(__dirname, 'files', 'public', pathname === '/' ? 'index.html' : pathname);
    handleFileRequest(req, res, filePath);
}

// Create HTTP server
const httpServer = http.createServer(webHandler);

httpServer.listen(serverOptions.port, () => {
    console.log(`HTTP Server running on port ${serverOptions.port}`);
});

// Create HTTPS server
let httpsServer;
try {
    const privateKey = fs.readFileSync(serverOptions.key, 'utf8');
    const certificate = fs.readFileSync(serverOptions.cert, 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    httpsServer = https.createServer(credentials, webHandler);

    httpsServer.listen(serverOptions.sslport, () => {
        console.log(`HTTPS Server running on port ${serverOptions.sslport}`);
    });
} catch (error) {
    console.error('Error starting HTTPS server: Ensure key.pem and cert.pem exist in the server directory and are valid.', error.message);
    console.log('HTTPS server will not start.');
}


