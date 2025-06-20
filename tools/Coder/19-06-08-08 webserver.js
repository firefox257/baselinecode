

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util'); // For async file operations

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

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
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-LS-Path, X-Read-File, X-Save-File, X-File-Path, X-File-Content' // Added custom headers
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
    console.log(filePath)
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
            sendPlainTextResponse(res, `LS Error: Path not found or base directory for wildcard doesn't exist: ${lsPath}`, 404);
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
        const content = await readFile(fullPath, 'utf8');
        sendPlainTextResponse(res, content);
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

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        try {
            // Ensure the directory exists before writing the file
            const dir = path.dirname(fullPath);
            await fs.promises.mkdir(dir, { recursive: true }); // THIS LINE CREATES DIRECTORIES RECURSIVELY

            await writeFile(fullPath, body, 'utf8');
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

    // --- Check for custom headers for LS, READFILE, SAVEFILE ---
    const lsPath = req.headers['x-ls-path'];
    const readFileHeader = req.headers['x-read-file'];
    const saveFileHeader = req.headers['x-save-file'];

    if (lsPath) {
        handleLs(res, lsPath);
        return;
    }

    if (readFileHeader) {
        handleReadFile(res, readFileHeader);
        return;
    }

    if (saveFileHeader && (req.method === 'POST' || req.method === 'PUT')) {
        handleSaveFile(req, res, saveFileHeader);
        return;
    } else if (saveFileHeader) {
        // If X-Save-File header is present but not a POST/PUT, it's a bad request
        sendPlainTextResponse(res, 'SAVEFILE requires POST or PUT method.', 405);
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




