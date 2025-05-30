var http = require('http')
var https = require('https')

var $path = require('path')
var fs = require('fs')

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
	'.webm': 'video/webm'
}

function mimetype(url) {
    var i = url.lastIndexOf('.')
    var tag = url.substring(i, url.length)
    if (!_mimetype[tag]) {
        throw new Error('mime tag ' + tag + ' not found')
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

    text(message, code) {
        
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
					file.pipe(this.reaponse)
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
    sslpoet: 443,
    key: './server/key.pem',
    cert: './server/cert.pem',
    additionalMethods: []
}

class WebServer {
    #allowHead = {
        'Access-Control-Allow-Orgin': '*',
        'Access-Control-Allow-Methods':
            'OPTIONS, POST, GET, PUT, PATCH, DELETE',
        'Access-Control-Max-Age': 2592000, //30 days
        'Access-Control-Allow-Headers':
            'Orgin, X-Requested-With, Content-Type, Accept, Athorization'
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

        http.createServer(this.handelweb).listen(options.port)
        https.createServer(httpsoptions, this.handelweb).listen(options.sslport)
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
			
            var url1 = `www${url}`;
			httpResponse.fileResponse(url1);
			
        } catch (err) {
            console.error(err)
            write(req, res, 500, url1 + err)
        } /////
    }
}

module.exports = WebServer
