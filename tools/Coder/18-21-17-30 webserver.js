/*


This code is for a node js web server.

create text documentation for all globalThis. defined functions and objects.
give examples how to use them




*/


const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

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
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
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
