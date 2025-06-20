/*

This is a html server for http and https.
Getting a 
Operation failed: Failed to compile WAT: 500 WAT compilation failed: wabt.parseWat is not a function

fix error

*/


var http = require('http')
var https = require('https')

var $path = require('path')
var fs = require('fs')
const wabtModule = require('wabt')

globalThis.syncFetch = (url) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, false)
    var data
    xhr.onload = (e) => {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                data = xhr.responseText
            } else {
                console.error(xhr.statusText)
            }
        }
    }
    xhr.onerror = (e) => {
        console.error(xhr.statusText)
    }
    xhr.send(null)
    return data
}

var _mimetype = {
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
	'.obj': 'multipart/form-data',
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

function mimetype(url) {
    var i = url.lastIndexOf('.')
    var tag = url.substring(i, url.length)
    if (!_mimetype[tag]) {
        // Fallback to octet-stream for unknown types
        return 'application/octet-stream'
    }
    return _mimetype[tag]
}

class HttpResponse {
    request;
    response;

    #url;
	#query;
	
	static #txtHead={
            'Content-Type': mimetype('.txt')
        }
	static #jsonHead={
            'Content-Type': mimetype('.json')
        }
	
    get url() {
        return this.#url
    }
	
    get query() {
        return this.#query
    }

    constructor(request, response) {
        this.request = request
        this.response = response

        var rawUrl = decodeURI(request.url.toString())
        var a = rawUrl.split('?')
        //console.log(a[1])
        this.#url = a[0]
        if (a[1]) {
            this.#query = JSON.parse(a[1])
        }
    }

    text(msg, code) {
        
        this.response.writeHead(code, HttpResponse.#txtHead)
        this.response.write(msg)
        this.response.end()
    }
    okText(message) {
        this.text(message, 200)
    }

    notFoundText(message) {
        this.text(message, 404)
    }
    errorText(message) {
        this.text(message, 500)
    }

    json(obj, code) {
		this.response.writeHead(code, HttpResponse.#jsonHead)
        this.response.write(JSON.stringify(obj))
        this.response.end()
	}
    okJson(obj) {
        this.json(obj,200);
    }

    notFoundJson(obj) {
        
        this.json(obj,404);
    }
    errorJson(obj) {
        
        this.json(obj,500);
    }
	
	fileResponse(path) 
	{
		var url1 = path;
        if (fs.statSync(url1).isDirectory())
		{
			if (url1.endsWith('/')) url1 += 'index.html';
			else url1 += '/index.html';
        }
		console.log(url1);
        /////////////////
        if (!fs.existsSync(url1)) 
		{
			//write(req, res, 404, url + ' Not Found!')
			this.notFoundText(path + " not found!");
			return;
        }
		
        //if (fs.statSync(url1).isDirectory()) url1 += '/index.html'
		var self = this;
        fs.stat(url1, function (err, stat) 
		{
			if (err) 
			{
				self.errorText(path + ' Something went wrong!');
			} 
			else 
			{
				//console.log(this)
				var range = self.request.headers.range
				var fileSize = stat.size
				var mtype = mimetype(url1)
		
				if (range) 
				{
					var parts = range.replace(/bytes=/, '').split('-')
					var start = parseInt(parts[0], 10)
					var end = parts[1]
						? parseInt(parts[1], 10)
						: fileSize - 1
					var chunksize = end - start + 1
					var file = fs.createReadStream(url1, { start, end })
					var head = 
					{
						'Content-Range': `bytes ${start}-${end}/${fileSize}`,
						'Accept-Ranges': 'bytes',
						'Content-Length': chunksize,
						'Content-Type': mtype
					};
					self.response.writeHead(206, head)
					file.pipe(self.response) // Corrected from this.reaponse to self.response
				} 
				else 
				{
					var head = 
					{
						'Content-Length': fileSize,
						'Content-Type': mtype
					};
					self.response.writeHead(200, head);
					fs.createReadStream(url1).pipe(self.response);
				}
			}
		});////stat
	}
	
}


function write(req, res, code, msg) {
    var head = {
        'Content-Type': mimetype('.txt')
    }
    res.writeHead(code, head)
    res.write(msg)
    res.end()
}

const defaultOptions = {
    port: 80,
    sslport: 443, // Corrected typo
    key: './server/key.pem',
    cert: './server/cert.pem',
    additionalMethods: []
}

class WebServer {
    #allowHead = {
        'Access-Control-Allow-Origin': '*', // Corrected typo
        'Access-Control-Allow-Methods':
            'OPTIONS, POST, GET, PUT, PATCH, DELETE',
        'Access-Control-Max-Age': 2592000, //30 days
        'Access-Control-Allow-Headers':
            'Origin, X-Requested-With, Content-Type, Accept, Authorization, LS, READFILE, SAVEFILE, COMPILEWAT, WAT-CONTENT, OUTPUT-PATH' // Added LS, READFILE, SAVEFILE, COMPILEWAT, WAT-CONTENT, OUTPUT-PATH
    }
	
	#port
	#sslport
	
    apiHook = {}

    constructor(options = {}) {
        for (var i in defaultOptions) {
            if (!options[i]) {
                options[i] = defaultOptions[i]
            }
        }

        var httpsoptions = {
            key: fs.readFileSync(options.key),
            cert: fs.readFileSync(options.cert)
        }

        if (options.additionalMethods.length > 0) {
            this.#allowHead['Access-Control-Allow-Methods'] +=
                ',' + options.additionalMethods.join(',')
        }

        this.#port = options.port;
        this.#sslport = options.sslport;

        http.createServer(this.handelweb.bind(this)).listen(this.#port);
        https.createServer(httpsoptions, this.handelweb.bind(this)).listen(this.#sslport);
        console.log(`HTTP server listening on port ${this.#port}`);
        console.log(`HTTPS server listening on port ${this.#sslport}`);
    }
	get port() {
		return this.#port;
	}
	
	get sslport() {
		return this.#sslport;
	}
	
    handelweb(req, res) {
        try {
            if (req.method === 'OPTIONS') {
                res.writeHead(204, this.#allowHead)
                res.end()
                return
            }

            var httpResponse = new HttpResponse(req, res)

            var url = httpResponse.url //decodeURI(req.url.toString())

            //console.log(url)
			
            // Custom API handling for LS, READFILE, SAVEFILE, COMPILEWAT
            const pathHeader = req.headers['path'];
            const wildcardHeader = req.headers['wildcard'];
            const contentHeader = req.headers['content'];
            const watContentHeader = req.headers['wat-content'];
            const outputPathHeader = req.headers['output-path'];


            if (req.headers['ls'] === 'true') {
                this.handleLs(httpResponse, pathHeader, wildcardHeader);
                return;
            } else if (req.headers['readfile'] === 'true') {
                this.handleReadFile(httpResponse, pathHeader);
                return;
            } else if (req.headers['savefile'] === 'true') {
                this.handleSaveFile(httpResponse, pathHeader, contentHeader, req);
                return;
            } else if (req.headers['compilewat'] === 'true') {
                this.handleCompileWat(httpResponse, watContentHeader, outputPathHeader, req);
                return;
            }
            
            var url1 = `www${url}`; // Assuming www is the web root
			httpResponse.fileResponse(url1);
			
        } catch (err) {
            console.error(err)
            write(req, res, 500, `Error: ${err.message}`)
        } /////
    }

    handleLs(httpResponse, path, wildcard) {
        try {
            const fullPath = $path.join('www', path || './'); // Default to www/ if path is not provided
            let files = [];

            if (!fs.existsSync(fullPath)) {
                httpResponse.notFoundJson({ error: `Path not found: ${path}` });
                return;
            }

            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                const dirents = fs.readdirSync(fullPath, { withFileTypes: true });
                files = dirents.map(dirent => {
                    const itemPath = $path.join(fullPath, dirent.name);
                    const itemStats = fs.statSync(itemPath);
                    return {
                        name: dirent.name,
                        type: dirent.isDirectory() ? 'directory' : 'file',
                        modified: itemStats.mtime.getTime(), // Modified date in milliseconds
                        size: dirent.isFile() ? itemStats.size : undefined // File size for files
                    };
                });

                if (wildcard) {
                    const regex = new RegExp(wildcard.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');
                    files = files.filter(file => regex.test(file.name));
                }
            } else { // It's a file
                files.push({
                    name: $path.basename(fullPath),
                    type: 'file',
                    modified: stats.mtime.getTime(),
                    size: stats.size
                });
            }
            httpResponse.okJson(files);
        } catch (error) {
            httpResponse.errorJson({ error: `LS failed: ${error.message}` });
        }
    }

    handleReadFile(httpResponse, path) {
        try {
            if (!path) {
                httpResponse.errorText('READFILE: Path header is required.');
                return;
            }
            const fullPath = $path.join('www', path);
            if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
                httpResponse.notFoundText(`File not found or is not a file: ${path}`);
                return;
            }
            const content = fs.readFileSync(fullPath, 'utf8');
            httpResponse.okText(content);
        } catch (error) {
            httpResponse.errorText(`READFILE failed: ${error.message}`);
        }
    }

    handleSaveFile(httpResponse, path, content, req) {
        try {
            if (!path) {
                httpResponse.errorText('SAVEFILE: Path header is required.');
                return;
            }
            
            // For SAVEFILE, the content can be in the 'content' header or in the request body
            let fileContent = content;

            if (fileContent === undefined) {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    const fullPath = $path.join('www', path);
                    const dir = $path.dirname(fullPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(fullPath, body, 'utf8');
                    httpResponse.okText(`File saved: ${path}`);
                });
            } else {
                const fullPath = $path.join('www', path);
                const dir = $path.dirname(fullPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(fullPath, fileContent, 'utf8');
                httpResponse.okText(`File saved: ${path}`);
            }

        } catch (error) {
            httpResponse.errorText(`SAVEFILE failed: ${error.message}`);
        }
    }

    handleCompileWat(httpResponse, watContent, outputPath, req) {
        try {
            if (!outputPath) {
                httpResponse.errorText('COMPILEWAT: OUTPUT-PATH header is required.');
                return;
            }

            let sourceWat = watContent;

            // If watContent is not in header, check request body
            if (sourceWat === undefined) {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    if (!body) {
                        httpResponse.errorText('COMPILEWAT: No WAT content provided in header or body.');
                        return;
                    }
                    this.processWatCompilation(httpResponse, body, outputPath);
                });
            } else {
                this.processWatCompilation(httpResponse, sourceWat, outputPath);
            }

        } catch (error) {
            httpResponse.errorText(`COMPILEWAT failed: ${error.message}`);
        }
    }

    async processWatCompilation(httpResponse, watSource, outputPath) { // Added async keyword
        try {
            const wabtInstance = await wabtModule(); // Initialize wabt and await its resolution
            const wasmModule = wabtInstance.parseWat('module.wat', watSource);
            wasmModule.validate(); // It's good practice to validate the WAT
            wasmModule.resolveNames(); // Resolve names
            wasmModule.applyNames(); // Apply names (for debugging)

            const { buffer } = wasmModule.toBinary({ write_debug_names: true });

            const fullOutputPath = $path.join('www', outputPath);
            const dir = $path.dirname(fullOutputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullOutputPath, Buffer.from(buffer));
            httpResponse.okText(`WAT file compiled and saved to: ${outputPath}`);
        } catch (error) {
            httpResponse.errorText(`WAT compilation failed: ${error.message}`);
        }
    }
}

module.exports = WebServer


