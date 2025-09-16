

/*
Do not remove
./js/esitorCsg.js
*/

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { ezport } from './scadCSG.js';
import { Brush } from 'three-bvh-csg';
import { api } from '/js/apiCalls.js';

const exportedCSG = ezport();
const exporter = new STLExporter();

var csgEditor;        // from HTML (custom element with .values, .valuesIndex, .basePath)
var editorCodeEditor; // from HTML (custom element with .values, .valuesIndex)
var openModal;
var closeModal;
var createBuildPlate;
var resizeRenderer;
var animate;
var showView;
let scene;
let currentObjects;

let project; // global instance


// Helper function to recursively traverse the target and apply color

const applyFilter = (item, checkFunction,applyFunction, ...args) => {
   //if(item==undefined||item==null) return;
	
	// Case 1: The item is a single mesh (THREE.Mesh or Brush)
    if (checkFunction(item)) {
        applyFunction(item, ...args);
    }
    // Case 2: The item is an array. Recursively process each element.
    else if (Array.isArray(item)) {
        item.forEach((subItem) => applyFilter(subItem, checkFunction, applyFunction, ...args))
    }
    // Case 3: The item is a generic object. Recursively process its properties.
    else if (item !== null&& item !== undefined && typeof item === 'object') {
        for (const key in item) {
            if (Object.prototype.hasOwnProperty.call(item, key)) {
                applyFilter(item[key], checkFunction, applyFunction, ...args)
            }
        }
    }
    // All other data types (strings, numbers, etc.) are ignored.
}

function isMesh(item) 
{     
	return item && (item instanceof THREE.Mesh || item instanceof Brush)
}

function isJsonMesh(item) {
	if (typeof item === 'object' && item !== null)
	{
		if(item.$jsonMesh!=undefined && item.$jsonMesh!=null) return true;
	}
	return false;
}

const applyToMesh = (item, applyFunction, ...args) => applyFilter(item, isMesh, applyFunction, ...args);


const cloneFilter = (item, checkFunction, applyFunction, ...args) => {
    //if(item==undefined||item==null) return item;
	
	// Case 1: The item is a single mesh (THREE.Mesh or Brush)
    if (checkFunction(item)) {
        return applyFunction(item, ...args);
    }
    // Case 2: The item is an array. Recursively process each element.
    else if (Array.isArray(item)) {
		console.log("array");
		var arr=[];
        item.forEach((subItem) => {
			arr.push(
				cloneFilter(subItem, checkFunction, applyFunction, ...args)
			);
		});
		return arr;
    }
    // Case 3: The item is a generic object. Recursively process its properties.
    else if (item !== null&& item !== undefined && typeof item === 'object') {
		var obj={};
        for (const key in item) {
           if (Object.prototype.hasOwnProperty.call(item, key)) {
				//console.log("key: "+ key)
                obj[key]=cloneFilter(item[key], checkFunction, applyFunction, ...args);
            }
			//obj[key]= cloneFilter(item[key], checkFunction, applyFunction, ...args);
        }
		return obj;
    }
	
    // All other data types (strings, numbers, etc.) are returened.
	return item;
}


// Function to convert a Float32Array to a Base64 string
function floatArrayToBase64(floatArray) {
    // Create a Uint8Array from the Float32Array
    const uint8Array = new Uint8Array(floatArray.buffer);
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binaryString); // Use the built-in btoa() function
}

// Function to convert a Base64 string back to a Float32Array
function base64ToFloatArray(base64String) {
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return new Float32Array(bytes.buffer);
}

/**
 * Converts a Uint16Array to a Base64 string.
 * This is useful for serializing binary data for transmission or storage.
 * @param {Uint16Array} uint16Array The input Uint16Array.
 * @returns {string} The Base64 encoded string.
 */
function uint16ToBase64(uint16Array) {
	console.log("here3")
    // Create a Uint8Array view of the Uint16Array's underlying ArrayBuffer.
    const uint8Array = new Uint8Array(uint16Array.buffer);
	console.log("here4")
    // Convert the Uint8Array to a string of characters.
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
    }
	
    // Encode the binary string to Base64.
    return btoa(binaryString);
}

/**
 * Converts a Base64 string back into a Uint16Array.
 * @param {string} base64String The Base64 encoded string.
 * @returns {Uint16Array} The reconstructed Uint16Array.
 */
function base64ToUint16(base64String) {
    // Decode the Base64 string back to a binary string.
    const binaryString = atob(base64String);

    // Create a new Uint16Array with the correct length.
    const uint16Array = new Uint16Array(binaryString.length / 2);

    // Populate the Uint16Array from the binary string.
    const view = new DataView(uint16Array.buffer);
    for (let i = 0; i < binaryString.length; i++) {
        view.setUint8(i, binaryString.charCodeAt(i));
    }

    return uint16Array;
}


//
// Class-based project with caches
//
class ScadProject {
    constructor({ csgEditorRef = null, codeEditorRef = null, csgValues = null, codeValues = null, basePath = null } = {}) {
        this.meshCache = {};
        this.codeCache = {};
        this.fileCache = {};
        this._csgEditorRef = csgEditorRef;
        this._codeEditorRef = codeEditorRef;
        this._csgValues = Array.isArray(csgValues) ? csgValues : null;
        this._codeValues = Array.isArray(codeValues) ? codeValues : null;
        this.basePath = basePath || null;
    }

    get csgValues() {
        if (this._csgEditorRef && Array.isArray(this._csgEditorRef.values)) return this._csgEditorRef.values;
        return this._csgValues || [];
    }

    get codeValues() {
        if (this._codeEditorRef && Array.isArray(this._codeEditorRef.values)) return this._eitorCodeEditorRef.values;
        return this._codeValues || [];
    }

    rebindEditors(csgEditorRef, codeEditorRef) {
        this._csgEditorRef = csgEditorRef;
        this._codeEditorRef = codeEditorRef;
    }

    setBasePath(bp) { this.basePath = bp || null; }

    path(filepath) {
        if (!filepath) return null;
        if (filepath.startsWith('/')) return filepath;

        const libraryPath = (typeof settings !== 'undefined' && settings.libraryPath) ? settings.libraryPath : '/csgLib';
        if (filepath.startsWith('$lib/')) return libraryPath + '/' + filepath.substring(5);

        const base = this.basePath ?? (this._csgEditorRef && this._csgEditorRef.basePath) ?? (typeof csgEditor !== 'undefined' ? csgEditor.basePath : null);
        if (!base) { alert("Error: Cannot use relative paths. Load or save a project first."); return null; }

        const parts = base.split('/').filter(Boolean);
        const fileParts = filepath.split('/');
        for (const part of fileParts) {
            if (part === '..') { if (parts.length > 0) parts.pop(); }
            else if (part !== '.' && part !== '') parts.push(part);
        }
        return '/' + parts.join('/');
    }

    async _getOrLoadSubProject(fullPath) {
        if (this.fileCache[fullPath]) return this.fileCache[fullPath];
        try {
            const fileContent = await api.readFile(fullPath);
            const projectData = JSON.parse(fileContent);
            const segs = fullPath.split('/'); segs.pop();
            const subBase = '/' + segs.filter(Boolean).join('/');
            const subProject = new ScadProject({
                csgValues: projectData.csgCode || [],
                codeValues: projectData.editorCode || [],
                basePath: subBase
            });
            this.fileCache[fullPath] = subProject;
            return subProject;
        } catch (err) {
            PrintError(`❌ Failed to load file '${fullPath}':`, err);
            alert(`External Project Load Error:\n` + err.message);
            return null;
        }
    }

    async get(name, filepath = null) {
        if (filepath) {
            const fullPath = this.path(filepath);
            if (!fullPath) return null;
            const subProject = await this._getOrLoadSubProject(fullPath);
            if (!subProject) return null;
            return await subProject.get(name);
        }

        const idx = this.csgValues.findIndex(p => p.title === name);
        if (idx === -1) { PrintError(`Page '${name}' not found.`); return null; }
        const requestedPage = this.csgValues[idx];
        const requestedPageName = requestedPage.title;

        if (this.meshCache[requestedPageName] && this.meshCache[requestedPageName].updated) {
            PrintLog(`✅ Loading cached mesh for page: ${requestedPageName}`);
            return this.meshCache[requestedPageName].mesh;
        }

        PrintLog(`🔍 Re-evaluating code for page: ${requestedPageName}`);
        try {
            const script = new Function(...exportedCSG.names, 'get', 'include', 'path',
                `return (async () => { ${requestedPage.content} })();`
            );
            const result = await script(...exportedCSG.funcs, this.get.bind(this), this.include.bind(this), this.path.bind(this));
            this.meshCache[requestedPageName] = { mesh: result, updated: true };
            return result;
        } catch (err) {
            PrintError(`❌ CSG Error for page '${requestedPageName}':`, err.message, err);
            alert(`CSG Error for page '${requestedPageName}':\n` + err.message);
            return null;
        }
    }

    async include(name, filepath = null) {
        if (filepath) {
            const fullPath = this.path(filepath);
            if (!fullPath) return null;
            const subProject = await this._getOrLoadSubProject(fullPath);
            if (!subProject) return null;
            return await subProject.include(name);
        }

        const cacheKey = name;
        if (this.codeCache[cacheKey] && this.codeCache[cacheKey].updated) return this.codeCache[cacheKey].result;

        const pageData = this.codeValues.find(p => p.title === name);
        if (!pageData) { PrintError(`Include error: Page '${name}' not found.`); return null; }

        PrintLog(`🔍 Compiling included code for page: ${name}`);
        try {
            const script = new Function(...exportedCSG.names, 'get', 'include', 'path',
                `return (async () => { ${pageData.content} })();`
            );
            const result = await script(...exportedCSG.funcs, this.get.bind(this), this.include.bind(this), this.path.bind(this));
            this.codeCache[cacheKey] = { result, updated: true };
            return result;
        } catch (err) {
            PrintError(`❌ Include error for page '${name}':`, err.message, err);
            alert(`Include Error for page '${name}':\n` + err.message);
            return null;
        }
    }

    // New function to clear a single mesh cache entry
    clearMeshCache(name) {
        if (this.meshCache[name]) {
            delete this.meshCache[name];
            PrintLog(`✅ Cleared mesh cache for: ${name}`);
        }
    }
    
    // New function to clear a single code cache entry
    clearCodeCache(name) {
        if (this.codeCache[name]) {
            delete this.codeCache[name];
            PrintLog(`✅ Cleared code cache for: ${name}`);
        }
    }

    clearAllCache(scene, currentObjects) {
        this.meshCache = {};
        this.codeCache = {};
        this.fileCache = {};
        currentObjects.forEach(obj => scene.remove(obj));
        currentObjects.length = 0;
        alert('In-memory cache cleared. Click "Run" to re-render.');
    }
}


/**
 * Extracts position, normal, index, and material data from a Three.js Mesh.
 * @param {THREE.Mesh} mesh The mesh to extract data from.
 * @returns {object|null} An object containing the extracted data, or null if invalid.
 */
function extractMeshData(mesh) {
    try {
        if (!mesh || !mesh.geometry) {
            console.error("Invalid mesh provided. It must have a geometry.");
            return null;
        }

        const geometry = mesh.geometry;
        const data = {};

        // --- Extract Geometry Data (same as before) ---
        const positionAttribute = geometry.getAttribute('position');
        if (positionAttribute) {
            data.positions = floatArrayToBase64(positionAttribute.array);
        }
		
        const normalAttribute = geometry.getAttribute('normal');
        if (normalAttribute) {
			
            data.normals = floatArrayToBase64(normalAttribute.array);
			
        }
		
        const indexAttribute = geometry.getIndex();
		
        if (indexAttribute) {
            data.indices = uint16ToBase64(indexAttribute.array);
        }
        
        // --- NEW: Extract Material and Group Data ---
        // Handle both single material and array of materials
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        data.materials = materials.map(m => ({
            color: m.color ? '#' + m.color.getHexString() : '#ffffff',
            roughness: m.roughness,
            metalness: m.metalness,
            side: m.side,
            flatShading: m.flatShading,
            type: m.type
        }));

        // Always add the groups array, even if it's empty
        data.groups = geometry.groups && geometry.groups.length > 0 ? geometry.groups : [];

        // --- Extract Transformation Data (same as before) ---
        data.position = [mesh.position.x, mesh.position.y, mesh.position.z];
        data.rotation = [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z];
        data.scale = [mesh.scale.x, mesh.scale.y, mesh.scale.z];
		
        return data;

    } catch (error) {
        console.log("Failed to extract mesh data:", error);
        return null;
    }
}



/**
 * Recreates a Three.js Mesh from an object containing geometry and transformation data.
 * @param {object} data An object with geometry, material, group, and transformation data.
 * @returns {THREE.Mesh|null} The new Three.js Mesh, or null if the data is invalid.
 */
function recreateMeshFromData(data) {
    try {
        if (!data || !data.positions) {
            console.error("Invalid data provided. 'positions' array is required.");
            return null;
        }

        const geometry = new THREE.BufferGeometry();
        
        // --- Set Geometry Attributes (same as before) ---
        const positions = base64ToFloatArray(data.positions);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        if (data.normals) {
            const normals = base64ToFloatArray(data.normals);
            geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        }

        if (data.indices) {
            const indices = base64ToUint16(data.indices);
            geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        }

        // --- NEW: Recreate Materials and Set Groups ---
        let materials = [];
        if (data.materials && data.materials.length > 0) {
            materials = data.materials.map(m => {
                const materialProps = {
                    color: new THREE.Color(m.color),
                    roughness: m.roughness,
                    metalness: m.metalness,
                    side: m.side,
                    flatShading: m.flatShading
                };
                if (m.type === 'MeshBasicMaterial') {
                    return new THREE.MeshBasicMaterial(materialProps);
                } else {
                    return new THREE.MeshStandardMaterial(materialProps);
                }
            });

            // Only add groups if the data contains them
            if (data.groups && data.groups.length > 0) {
                data.groups.forEach(group => {
                    geometry.addGroup(group.start, group.count, group.materialIndex);
                });
            }

        } else {
            materials.push(new THREE.MeshStandardMaterial({ color: 0xffcc00 }));
        }

        // Create the new mesh
        const newMesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
        
        // --- Re-apply Transformation Data (same as before) ---
        if (data.position) {
            newMesh.position.set(data.position[0], data.position[1], data.position[2]);
        }
        
        if (data.rotation) {
            newMesh.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
        }
        
        if (data.scale) {
            newMesh.scale.set(data.scale[0], data.scale[1], data.scale[2]);
        }

        return newMesh;

    } catch (error) {
        console.error("Failed to recreate mesh from data:", error);
        return null;
    }
}

//////////////

/**
 * Maps THREE.Curve types to single-letter abbreviations to minimize data size.
 */
const ABBREVIATE_CURVE_TYPES = {
    LineCurve: 'l',
    QuadraticBezierCurve: 'q',
    CubicBezierCurve: 'c',
    ArcCurve: 'a',
    EllipseCurve: 'e'
}

/**
 * Serializes a THREE.Path into a compact array of commands and values,
 * including support for Line, Quadratic, Cubic, Arc, and Ellipse curves.
 * e.g., ['m', 1, 2, 'l', 10, 10, 'a', 5, 5, 3, 0, 1.5, false, ...].
 * @param {THREE.Path} path The THREE.Path object to serialize.
 * @returns {Array<string | number | boolean>} A flat array of commands and coordinates.
 */
function serializePath(path) {
    const data = []
    if (path.curves.length === 0) return data

    // The starting point for the path (the first moveTo)
    const startPoint =
        path.curves[0].v1 ||
        new THREE.Vector2(path.curves[0].aX, path.curves[0].aY)
    data.push('m', startPoint.x, startPoint.y)

    path.curves.forEach((curve) => {
        const type = curve.type
        const abbreviation = ABBREVIATE_CURVE_TYPES[type]

        // Ensure the path is continuous; if not, add an explicit moveTo command.
        if (
            curve.v1 &&
            path.currentPoint &&
            curve.v1.distanceTo(path.currentPoint) > 0.0001
        ) {
            data.push('m', curve.v1.x, curve.v1.y)
        }

        if (abbreviation) {
            data.push(abbreviation)

            if (type === 'LineCurve') {
                data.push(curve.v2.x, curve.v2.y)
            } else if (type === 'QuadraticBezierCurve') {
                data.push(curve.v1.x, curve.v1.y, curve.v2.x, curve.v2.y)
            } else if (type === 'CubicBezierCurve') {
                data.push(
                    curve.v1.x,
                    curve.v1.y,
                    curve.v2.x,
                    curve.v2.y,
                    curve.v3.x,
                    curve.v3.y
                )
            } else if (type === 'ArcCurve') {
                data.push(
                    curve.aX,
                    curve.aY,
                    curve.aRadius,
                    curve.aStartAngle,
                    curve.aEndAngle,
                    curve.aClockwise
                )
            } else if (type === 'EllipseCurve') {
                data.push(
                    curve.aX,
                    curve.aY,
                    curve.xRadius,
                    curve.yRadius,
                    curve.aStartAngle,
                    curve.aEndAngle,
                    curve.aClockwise,
                    curve.aRotation
                )
            }
        }
        // Update the current point for the next iteration to check for continuity
        path.currentPoint =
            curve.v2 ||
            curve.v3 ||
            new THREE.Vector2(
                curve.aX + curve.xRadius * Math.cos(curve.aEndAngle),
                curve.aY + curve.yRadius * Math.sin(curve.aEndAngle)
            )
    })

    return data
}

/**
 * Recreates a THREE.Path object from serialized data, now including ArcCurve and EllipseCurve.
 * @param {Array<string | number>} data The array of serialized commands.
 * @returns {THREE.Path} A new THREE.Path object.
 */
function deserializePath(data, fn) {
	
	alert(fn);
	if(!fn) fn =30;
    const path = new THREE.Path()
    let i = 0
    while (i < data.length) {
        const command = data[i]
        i++

        switch (command) {
            case 'm':
                path.moveTo(data[i++], data[i++])
                break
            case 'l':
                path.lineTo(data[i++], data[i++])
                break
            case 'q':
                path.quadraticCurveTo(
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++]
                )
                break
            case 'c':
                path.bezierCurveTo(
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++]
                )
                break
            case 'a':
                // Corrected ArcCurve (a specialized EllipseCurve)
                path.absarc(
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++],
					fn
                )
                break
            case 'e':
                // EllipseCurve
                path.absellipse(
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++],
                    data[i++],
					fn
                )
                break
            default:
                console.error('Unknown command:', command)
                break
        }
    }
    return path
}

/**
 * Serializes a THREE.Shape object into a plain JavaScript object with
 * compact array formats for paths and holes.
 * @param {THREE.Shape} shape The THREE.Shape object to serialize.
 * @returns {object} The serialized shape data.
 */
function serializeShape(shape) {
    const pathsData = serializePath(shape)
    const holesData = shape.holes.map((holePath) => serializePath(holePath))
	const fn=30;
	if(shape.userData&&shape.userData.fn)
	{
		shape.userData.fn
	}

   return {
        paths: pathsData,
        holes: holesData, 
		fn: fn
    }
}

/**
 * Deserializes a plain JavaScript object back into a THREE.Shape.
 * @param {object} data The serialized shape data.
 * @returns {THREE.Shape} A new THREE.Shape object.
 */
function deserializeShape(data) {
    const newShape = new THREE.Shape();
    const fn = data.fn || 30; // Default to 30 if fn is not provided

    // Recreating the main path from the serialized data
    const mainPath = deserializePath(data.paths, fn);
    newShape.curves = mainPath.curves;

    if (data.holes) {
        newShape.holes = data.holes.map((holeData) => deserializePath(holeData, fn));
    }
    
    // Store fn in userData to be accessed later
    newShape.userData = { fn: fn };

    return newShape;
}

////////////////////////




//
// File handling
//
export async function handleLoadFile(event, filePath) {
    try {
        const fileContent = await api.readFile(filePath);
        const projectData = JSON.parse(fileContent);

        // compute and set base path
        const pathSegments = filePath.split('/');
        pathSegments.pop();
        const newBasePath = pathSegments.join('/') + '/';
        csgEditor.basePath = newBasePath;
		globalThis.settings.basePath=newBasePath;
        project.setBasePath(newBasePath); // keep the class in sync with UI

        // Load code into editors (project uses LIVE refs, so it sees changes automatically)
        if (projectData.csgCode) {
            csgEditor.values = projectData.csgCode;
            csgEditor.setAttribute('active', '0');
        }
        if (projectData.editorCode) {
            editorCodeEditor.values = projectData.editorCode;
            editorCodeEditor.setAttribute('active', '0');
        }

        // Rehydrate mesh cache if present
        const objectLoader = new THREE.ObjectLoader();
        if (projectData.meshCache) {
			
			project.meshCache = cloneFilter(projectData.meshCache, isJsonMesh,(item)=>{
				if(item.isBrush) {
					//const mesh = objectLoader.parse(item.$jsonMesh.mesh);
                    
					const mesh = recreateMeshFromData(item.$jsonMesh.mesh);
					if(item.$jsonMesh.userData!=undefined)
					{
						mesh.userData = item.$jsonMesh.userData;
					}
					return new Brush(mesh);
				} 
				else if(item.isShape) {
					//const mesh = objectLoader.parse(item.$jsonMesh.mesh);
                    
					return deserializeShape(item.$jsonMesh.shape);
				}  
				else
				{
					//return objectLoader.parse(item.$jsonMesh.mesh);
					const mesh = recreateMeshFromData(item.$jsonMesh.mesh);
					if(item.$jsonMesh.userData!=undefined)
					{
						mesh.userData = item.$jsonMesh.userData;
					}
					return mesh;
				}
			});
        }

        const csgEditorValues = csgEditor.values;
        const activeIndex = csgEditor.valuesIndex;
        if (csgEditorValues && csgEditorValues[activeIndex]) {
            runCSGCode();
        }

        alert(`Project loaded successfully from: ${filePath}`);
    } catch (error) {
        alert(`Failed to load project: ${error.message}`);
    }
    closeModal('load-code-modal');
}


export async function handleSaveFile(event, filePath) {
    try {
        let finalPath = filePath;

        // ensure basePath exists and keep project in sync
        if (!csgEditor.basePath) {
            const pathSegments = filePath.split('/');
            pathSegments.pop();
            csgEditor.basePath = pathSegments.join('/') + '/';
        }
        project.setBasePath(csgEditor.basePath);

        const projectData = {
            csgCode: csgEditor.values,
            editorCode: editorCodeEditor.values,
            meshCache: cloneFilter(project.meshCache, isMesh, (item)=>{
				if(item instanceof THREE.Mesh) {
					return {
						$jsonMesh:{
							//mesh:item.toJSON()
							mesh:extractMeshData(item),
							userData:item.userData
						}
					};
				} 
				else if(item instanceof Brush) {
					return {
						$jsonMesh:{
							isBrush:true,
							//mesh:item.mesh.toJSON()
							mesh:extractMeshData(item.mesh),
							userData:item.userData
						}
					};
				}
				else if(item instanceof THREE.Shape) {
					return {
						$jsonMesh:{
							isShape:true,
							shape:serializeShape(item)
						}
					};
				}
				
			})
        };
		
		
        const projectDataString = JSON.stringify(projectData, null, 2);
        await api.saveFile(finalPath, projectDataString);
        alert(`Project saved successfully to: ${finalPath}`);
    } catch (error) {
        alert(`Failed to save project: ${error.message}`);
    }
    closeModal('save-code-modal');
}

export async function runEditorScript() {
    const pageData = editorCodeEditor.values[editorCodeEditor.valuesIndex];
    if (!pageData) return;
    const pageName = pageData.title;
    if (project.codeCache[pageName]) project.codeCache[pageName].updated = false;
    await project.include(pageName);
}

export async function runCSGCode() {
    currentObjects.forEach(obj => scene.remove(obj));
    currentObjects = [];
	
    const pageData = csgEditor.values[csgEditor.valuesIndex];
    if (!pageData) return;
	
    const activeMesh = await project.get(pageData.title);
	
	var meshes=[];
	applyToMesh(activeMesh,(item)=>{
		meshes.push(item)
	});
	
	meshes.forEach((item)=>{
		if(item.userData.$csgShow==undefined||item.$csgShow)
		{
			scene.add(item);
			currentObjects.push(item);
		}
	});
	
}

// New function to clear the cache of the current active file
export function clearCurrentCacheByName() {
    const codePanel = document.getElementById('code-panel');
    const editorCodePanel = document.getElementById('editor-code-panel');

    let currentTitle = null;

    if (codePanel.style.display === 'block' && csgEditor.values[csgEditor.valuesIndex]) {
        currentTitle = csgEditor.values[csgEditor.valuesIndex].title;
        project.clearMeshCache(currentTitle);
    } else if (editorCodePanel.style.display === 'block' && editorCodeEditor.values[editorCodeEditor.valuesIndex]) {
        currentTitle = editorCodeEditor.values[editorCodeEditor.valuesIndex].title;
        project.clearCodeCache(currentTitle);
    }

    if (currentTitle) {
        PrintLog(`Cache for "${currentTitle}" cleared.`);
        alert(`Cache for "${currentTitle}" cleared. Please click "Run" to re-render.`);
    } else {
        PrintWarn('No active file to clear cache for.');
        alert('No active file to clear cache for.');
    }
}

export async function handleSaveStl(event, filePath) {
    try {
        let finalPath = filePath;
        if (!finalPath.toLowerCase().endsWith('.stl')) finalPath += '.stl';
        const stlContent = window.stlToSave;
        if (!stlContent) throw new Error('No STL content to save.');
        await api.saveFile(finalPath, stlContent, { 'Content-Type': 'text/plain' });
        alert(`STL file saved successfully to: ${finalPath}`);
    } catch (error) {
        alert(`Failed to save STL file: ${error.message}`);
    }
    closeModal('save-stl-modal');
}

export function exportSTL() {
    if (!currentObjects.length) { alert('No objects to export!'); return; }
    const exportGroup = new THREE.Group();
    currentObjects.forEach(obj => { if (obj.isMesh || obj instanceof Brush) exportGroup.add(obj.clone()); });
    window.stlToSave = exporter.parse(exportGroup, { binary: false });
    openModal('save-stl-modal');
}

export function clearAllCache() { project.clearAllCache(scene, currentObjects); }

export function initialize(domElements) {
    csgEditor = domElements.csgEditor;
    editorCodeEditor = domElements.editorCodeEditor;
    openModal = domElements.openModal;
    closeModal = domElements.closeModal;
    createBuildPlate = domElements.createBuildPlate;
    resizeRenderer = domElements.resizeRenderer;
    animate = domElements.animate;
    showView = domElements.showView;
    scene = domElements.scene;
    currentObjects = [];

    project = new ScadProject({ csgEditorRef: csgEditor, codeEditorRef: editorCodeEditor, basePath: csgEditor.basePath || null });

    // IMPORTANT: You must add a 'resize' method to your textCode custom element class
    // in `./ux/textCode.js` to complete this fix.
    // The method should look something like this:
    //
    // resize() {
    //     // Get the dimensions of this custom element
    //     const rect = this.getBoundingClientRect();
    //     // Find the content div inside the shadow DOM
    //     const contentDiv = this.shadowRoot.querySelector('.code-editor-content');
    //     if (contentDiv) {
    //         // Get the height of the top menu bar
    //         const menuBarHeight = this.shadowRoot.querySelector('.code-editor-menu-bar').offsetHeight;
    //         // Set the height of the content div to fill the remaining space
    //         contentDiv.style.height = `${rect.height - menuBarHeight}px`;
    //     }
    // }

    editorCodeEditor.addEventListener('keydown', function() {
        const pageData = editorCodeEditor.values[editorCodeEditor.valuesIndex];
        if (pageData && pageData.title) { const pageName = pageData.title; if (project.codeCache[pageName]) project.codeCache[pageName].updated = false; }
    });

    csgEditor.addEventListener('keydown', function() {
        const pageData = csgEditor.values[csgEditor.valuesIndex];
        if (pageData && pageData.title) { const pageName = pageData.title; if (project.meshCache[pageName]) project.meshCache[pageName].updated = false; }
    });

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            openModal('save-code-modal');
        }
    });
    
    // UPDATED: This listener now also tells the editors to resize.
    window.addEventListener('resize', () => {
        mainContainer.style.height = (window.innerHeight - containerEl.offsetHeight) + "px";
        resizeRenderer();
        if (csgEditor && typeof csgEditor.resize === 'function') {
            csgEditor.resize();
        }
        if (editorCodeEditor && typeof editorCodeEditor.resize === 'function') {
            editorCodeEditor.resize();
        }
    });
}




//
// --- Console panel setup ---
//


(() => {
    const panel = document.getElementById("console-panel");
    const container = document.getElementById("console-container");
    const resizer = document.getElementById("console-resizer");

    if (!panel || !container || !resizer) {
        document.addEventListener('DOMContentLoaded', () => { _initConsolePanel(); });
    } else { _initConsolePanel(); }

    function _initConsolePanel() {
        const panelEl = document.getElementById("console-panel");
        const containerEl = document.getElementById("console-container");
        const resizerEl = document.getElementById("console-resizer");
        const mainContainer = document.getElementById("main-container");

        let isResizingNow = false;
        let startY = 0;
        let startHeight = 0;

        function startResize(y) { isResizingNow = true; startY = y; startHeight = containerEl.offsetHeight; document.body.style.cursor = "ns-resize"; }
        
        // UPDATED: This function now also resizes the editors.
        function moveResize(y) {
            if (!isResizingNow) return;
            const dy = startY - y;
            const newHeight = Math.max(50, startHeight + dy);
            containerEl.style.height = newHeight + "px";
            mainContainer.style.height = (window.innerHeight - newHeight-40) + "px";
            
            // NEW: Call the resize methods on your custom elements
            if (csgEditor && typeof csgEditor.resize === 'function') {
                csgEditor.resize();
            }
            if (editorCodeEditor && typeof editorCodeEditor.resize === 'function') {
                editorCodeEditor.resize();
            }

            resizeRenderer();
        }
        function stopResize() { isResizingNow = false; document.body.style.cursor = ""; }

        resizerEl.addEventListener("mousedown", (e) => { startResize(e.clientY); document.addEventListener("mousemove", onMouseMove); document.addEventListener("mouseup", onMouseUp); e.preventDefault(); });
        function onMouseMove(e) { moveResize(e.clientY); }
        function onMouseUp() { stopResize(); document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); }

        resizerEl.addEventListener("touchstart", (e) => { if (e.touches.length > 0) startResize(e.touches[0].clientY); document.addEventListener("touchmove", onTouchMove, { passive: false }); document.addEventListener("touchend", onTouchEnd); });
        function onTouchMove(e) { if (e.touches.length > 0) moveResize(e.touches[0].clientY); e.preventDefault(); }
        function onTouchEnd() { stopResize(); document.removeEventListener("touchmove", onTouchMove); document.removeEventListener("touchend", onTouchEnd); }

        //const origLog = console.log.bind(console);
        //const origWarn = console.warn.bind(console);
        //const origError = console.error.bind(console);

        function formatArgs(args) { try { return Array.from(args).map(a => typeof a === "string" ? a : JSON.stringify(a)).join(' '); } catch { return String(args); } }
        function logToPanel(type, args, stack = null) {
            const msg = document.createElement("div");
            msg.className = "console-" + type;
            msg.textContent = formatArgs(args);
            panelEl.appendChild(msg);

            if (stack) {
                const stackEl = document.createElement("div");
                stackEl.className = "console-stack";
                stackEl.textContent = "Stack Trace:\n" + stack;
                panelEl.appendChild(stackEl);
            }
            panelEl.scrollTop = panelEl.scrollHeight;
        }
		
        
		globalThis.PrintLog = function () { logToPanel("log", arguments); console.log(...arguments); };
		globalThis.PrintWarn = function () { logToPanel("warn", arguments); console.warn(...arguments); };
		globalThis.PrintError = function () {
            let stack = null;
            const args = Array.from(arguments);
            for (const arg of args) {
                if (arg instanceof Error && arg.stack) {
                    stack = arg.stack;
                    break;
                }
            }
            logToPanel("error", args, stack);
            console.log(arguments[0].message, ...arguments);
        };

        mainContainer.style.height = (window.innerHeight - containerEl.offsetHeight -40) + "px";
        window.addEventListener('resize', () => { mainContainer.style.height = (window.innerHeight - containerEl.offsetHeight) + "px"; resizeRenderer(); });
    }
	
})();
