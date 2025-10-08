// ./js/editorCsg.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { ezport } from './scadCSG.js';
import { Brush } from 'three-bvh-csg';
import { api } from '/js/apiCalls.js';

const exportedCSG = ezport();
const exporter = new STLExporter();

// Local Storage Keys for the last project and console
const LAST_PROJECT_PATH_KEY = 'scad_last_project_path';
const LAST_CSG_PAGE_KEY = 'scad_last_csg_page_index';
const LAST_EDITOR_CODE_PAGE_KEY = 'scad_last_editor_page_index';
const LAST_CONSOLE_HEIGHT_KEY = 'csg-editor-console-height'; 

// New constants for default project content
const DEFAULT_CSG_PAGE_TITLE = 'Main';
const DEFAULT_CSG_CODE_CONTENT = '// CSG code goes here\nconst result = new THREE.Mesh( new THREE.BoxGeometry( 10, 10, 10 ), new THREE.MeshStandardMaterial({ color: 0x007bff }) );\nreturn result;';
const DEFAULT_CODE_PAGE_TITLE = 'Code';
const DEFAULT_CODE_CODE_CONTENT = '// Include helper functions here';

var csgEditor;        
var editorCodeEditor; 
var openModal;
var closeModal;
var createBuildPlate;
var resizeRenderer;
var animate;
var showView;
let scene;
let currentObjects;
let isWireframeMode = false; 
const TOOLBAR_HEIGHT = 35; 
const MIN_CONSOLE_HEIGHT = 30;
const MAX_CONSOLE_HEIGHT_RATIO = 0.8; 

let project; 
let isInitializing = true; 

// ⭐ NEW FUNCTION: Returns a standardized data object for a new, default project.
/**
 * Returns a standardized data object for a new, default project.
 * @returns {object} The default project structure.
 */
function getNewDefaultProjectData() {
    return {
        csgCode: [{ 
            title: DEFAULT_CSG_PAGE_TITLE, 
            content: DEFAULT_CSG_CODE_CONTENT 
        }],
        editorCode: [{ 
            title: DEFAULT_CODE_PAGE_TITLE, 
            content: DEFAULT_CODE_CODE_CONTENT 
        }],
        meshCache: {} // Always empty for a new project
    };
}

// --- START: ScadProject, Mesh/Data Helpers ---

// Helper function to recursively traverse the target and apply color
const applyFilter = (item, checkFunction,applyFunction, ...args) => {
	
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
                obj[key]=cloneFilter(item[key], checkFunction, applyFunction, ...args);
            }
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
 */
function uint16ToBase64(uint16Array) {
    // Create a Uint8Array view of the Uint16Array's underlying ArrayBuffer.
    const uint8Array = new Uint8Array(uint16Array.buffer);
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
        // Initialize internal values to ensure .get() and .include() work immediately
        const defaultData = getNewDefaultProjectData();
        this._csgValues = Array.isArray(csgValues) ? csgValues : defaultData.csgCode;
        this._codeValues = Array.isArray(codeValues) ? codeValues : defaultData.editorCode;
        this.basePath = basePath || null;
    }

    get csgValues() {
        if (this._csgEditorRef && Array.isArray(this._csgEditorRef.values)) return this._csgEditorRef.values;
        return this._csgValues || [];
    }

    get codeValues() {
        if (this._codeEditorRef && Array.isArray(this._codeEditorRef.values)) return this._codeEditorRef.values; 
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
    }
}


/**
 * Extracts position, normal, index, and material data from a Three.js Mesh.
 */
function extractMeshData(mesh) {
    try {
        if (!mesh || !mesh.geometry) {
            console.error("Invalid mesh provided. It must have a geometry.");
            return null;
        }

        const geometry = mesh.geometry;
        const data = {};

        // --- Extract Geometry Data ---
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

        // --- Extract Transformation Data ---
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
 */
function recreateMeshFromData(data) {
    try {
        if (!data || !data.positions) {
            console.error("Invalid data provided. 'positions' array is required.");
            return null;
        }

        const geometry = new THREE.BufferGeometry();
        
        // --- Set Geometry Attributes ---
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

        // --- Recreate Materials and Set Groups ---
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
        
        // --- Re-apply Transformation Data ---
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

// ... (Shape serialization/deserialization functions omitted for brevity but are in the original file)

// --- END: ScadProject, Mesh/Data Helpers ---


//
// Core UI and Persistence Helpers
//

/**
 * Updates the height of the main content container and resizes editors/renderer.
 */
function updateMainContainerHeight(consoleHeight) {
    const mainContainer = document.getElementById('main-container');
    // Total viewport height minus toolbar height (35px) minus console height
    mainContainer.style.height = `calc(100vh - ${TOOLBAR_HEIGHT}px - ${consoleHeight}px)`;
    
    resizeRenderer(); // Re-render Three.js canvas to fit new dimensions
    
    // Resize custom textcode elements to fill the new main-container height
    if (csgEditor && typeof csgEditor.resize === 'function') {
        csgEditor.resize();
    }
    if (editorCodeEditor && typeof editorCodeEditor.resize === 'function') {
        editorCodeEditor.resize();
    }
}

/**
 * Saves the active page index for the given editor to localStorage.
 */
function saveActivePageIndex(editorRef, key) {
    if (editorRef && editorRef.valuesIndex !== undefined) {
        try {
            localStorage.setItem(key, editorRef.valuesIndex.toString());
        } catch (e) {
            PrintWarn(`Failed to save active page index for ${key}:`, e);
        }
    }
}

/**
 * Attempts to restore the active page index for the given editor.
 */
function restoreActivePageIndex(editorRef, key) {
    const savedIndex = localStorage.getItem(key);
    if (savedIndex !== null) {
        const index = parseInt(savedIndex, 10);
        // Ensure the index is valid for the current project pages
        if (!isNaN(index) && index >= 0 && index < editorRef.values.length) {
			editorRef.valuesIndex=index;
        } else {
            // If the saved index is out of bounds for the loaded file, clear it
            localStorage.removeItem(key);
        }
    }
}

// ⭐ MODIFIED FUNCTION: Resets the project state to defaults (new file)
/**
 * Resets the project state to defaults (new file) and removes the path from storage.
 * @param {string | null} path - The path of the failed file, or null if loading default.
 */
function resetProjectToDefault(path) {
    if (path) {
        PrintWarn(`⚠️ Hard failure. Clearing saved path and resetting to default project.`);
    } else {
        PrintLog("Initializing default project content.");
    }
    
    const defaultData = getNewDefaultProjectData(); // Get the canonical defaults

    // 1. Clear Local Storage Keys
    localStorage.removeItem(LAST_PROJECT_PATH_KEY);
    localStorage.removeItem(LAST_CSG_PAGE_KEY);
    localStorage.removeItem(LAST_EDITOR_CODE_PAGE_KEY);

    // 2. Clear caches and 3D scene (resets the internal state of the ScadProject instance)
    if (project) {
        project.clearAllCache(scene, currentObjects);
        project.setBasePath(null);
        // CRITICAL: Reset the internal, non-editor-bound values of the project instance
        project._csgValues = defaultData.csgCode;
        project._codeValues = defaultData.editorCode;
    }

    // 3. Reset Editor Content (resets the UI state)
    csgEditor.values = defaultData.csgCode;
    csgEditor.valuesIndex = 0; // Set active page to the new default
    csgEditor.basePath = null;
    
    editorCodeEditor.values = defaultData.editorCode;
    editorCodeEditor.valuesIndex = 0;
    
    // Ensure `isInitializing` is cleared *after* running the default code
    isInitializing = true; 
    
    // 4. Run the default code
    runCSGCode().then(() => {
        isInitializing = false; 
        PrintLog("Default project loaded and rendered.");
    });
}

// ⭐ MODIFIED FUNCTION: Simplified autoLoadLastProject
/**
 * Checks browser storage for a saved file path and loads the project automatically.
 */
async function autoLoadLastProject() {
    isInitializing = true; 
    const lastPath = localStorage.getItem(LAST_PROJECT_PATH_KEY);
    
    if (lastPath) {
        PrintLog(`Attempting to auto-load last project from: ${lastPath}`);
        
        try {
            const success = await handleLoadFile(null, lastPath); 
            
            if (success) {
                PrintLog(`✅ Project successfully loaded (or reset to default if file was empty).`); 
                return; 
            }
            // If handleLoadFile returns false, it means a hard error occurred (re-thrown).
        } catch (error) {
            // Catches hard errors (404, JSON parse error, API failure, etc.)
            PrintError(`❌ Auto-load failed for path: ${lastPath}.`, error);
        }
    } 
    
    // Fallback: If no path found OR loading failed with a hard error
    PrintLog("No previous project path found or load failed. Forcing default project initialization.");
    resetProjectToDefault(null);
}


//
// File handling
//

// ⭐ MODIFIED FUNCTION: Saves path and page indexes on successful load.
export async function handleLoadFile(event, filePath) {
    let fileContent;
    let projectData;
    
    try {
        // STEP 1: Check file size/content
        const fileStats = await api.ls(filePath);
        const defaultDataJson = JSON.stringify(getNewDefaultProjectData());
        let fileWasEmpty = false;
        
        if (fileStats && fileStats.size !== undefined && fileStats.size === 0) {
            // Case A: File exists but is empty (size 0)
            PrintWarn(`⚠️ File at path '${filePath}' has a size of 0 bytes. Treating as new project.`);
            fileContent = defaultDataJson;
            fileWasEmpty = true;
        } else {
            // Case B: Read the file content normally
            fileContent = await api.readFile(filePath);
        }

        // STEP 2: Final content check for Case B (or if api.ls failed/was skipped)
        if (!fileWasEmpty && (!fileContent || fileContent.trim().length === 0)) {
            PrintWarn(`⚠️ File content read as empty. Treating as new project.`);
            fileContent = defaultDataJson;
        }

        // STEP 3: Parse the content (either from file or the default object)
        projectData = JSON.parse(fileContent);

        // compute and set base path
        const pathSegments = filePath.split('/');
        pathSegments.pop();
        const newBasePath = pathSegments.join('/') + '/';
        csgEditor.basePath = newBasePath;
		globalThis.settings.basePath = newBasePath;
        project.setBasePath(newBasePath); 

        // 1. Load code into editors (updates .values property)
        if (projectData.csgCode) {
            csgEditor.values = projectData.csgCode;
            // CRITICAL: Update internal project state as well
            project._csgValues = projectData.csgCode; 
        }
        if (projectData.editorCode) {
            editorCodeEditor.values = projectData.editorCode;
            // CRITICAL: Update internal project state as well
            project._codeValues = projectData.editorCode;
        }
        
        // 2. Restore the active page indexes (CRITICAL: Needs to happen before runCSGCode)
        restoreActivePageIndex(csgEditor, LAST_CSG_PAGE_KEY);
        restoreActivePageIndex(editorCodeEditor, LAST_EDITOR_CODE_PAGE_KEY);


        // Rehydrate mesh cache if present
        if (projectData.meshCache) {
			
			project.meshCache = cloneFilter(projectData.meshCache, isJsonMesh,(item)=>{
				if(item.isBrush) {
					// Use new deserialization
					const mesh = recreateMeshFromData(item.$jsonMesh.mesh);
					if(item.$jsonMesh.userData!=undefined)
					{
						mesh.userData = item.$jsonMesh.userData;
					}
					return new Brush(mesh);
				} 
				else if(item.isShape) {
					// Use shape deserialization (omitted here, but exists)
					// return deserializeShape(item.$jsonMesh.shape); 
					return null; // Placeholder for deserializeShape
				}  
				else
				{
					// Use new deserialization
					const mesh = recreateMeshFromData(item.$jsonMesh.mesh);
					if(item.$jsonMesh.userData!=undefined)
					{
						mesh.userData = item.$jsonMesh.userData;
					}
					return mesh;
				}
			});
        }

        // Defer the code execution and clear the flag afterward.
        setTimeout(() => {
            const csgEditorValues = csgEditor.values;
            const activeIndex = csgEditor.valuesIndex; 
            if (csgEditorValues && csgEditorValues[activeIndex]) {
                runCSGCode();
            }
            isInitializing = false; 
        }, 50);

        // ⭐ NEW: Save the path and current active page index to localStorage
        try {
            localStorage.setItem(LAST_PROJECT_PATH_KEY, filePath);
            saveActivePageIndex(csgEditor, LAST_CSG_PAGE_KEY);
            saveActivePageIndex(editorCodeEditor, LAST_EDITOR_CODE_PAGE_KEY);
            PrintLog(`Saved last project path and page index on load: ${filePath}`);
        } catch (e) {
            PrintWarn("Failed to save persistence data after load:", e);
        }

        closeModal('load-code-modal');
        return true; // Signal successful load

    } catch (error) {
        // This catches genuine errors like JSON syntax errors or API access failures.
        alert(`Failed to load project: ${error.message}.`);
        closeModal('load-code-modal'); 
        throw error; // Re-throw the hard error
    }
}


// ⭐ MODIFIED FUNCTION: Only closes the modal on success, and ensures page index is saved.
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
            // Use new mesh serialization via cloneFilter (logic omitted for brevity)
            meshCache: cloneFilter(project.meshCache, isMesh, (item)=>{
				if(item instanceof THREE.Mesh) {
					return {
						$jsonMesh:{
							mesh:extractMeshData(item), // uses new Base64 encoding
							userData:item.userData
						}
					};
				} 
				else if(item instanceof Brush) {
					return {
						$jsonMesh:{
							isBrush:true,
							mesh:extractMeshData(item.mesh), // uses new Base64 encoding
							userData:item.userData
						}
					};
				}
				else if(item instanceof THREE.Shape) {
					return {
						$jsonMesh:{
							isShape:true,
							// shape:serializeShape(item) // Placeholder
                            shape: null
						}
					};
				}
				
			})
        };
		
		
        const projectDataString = JSON.stringify(projectData, null, 2);
        await api.saveFile(finalPath, projectDataString);
        
        // Save the project path and page index to browser storage
        try {
            localStorage.setItem(LAST_PROJECT_PATH_KEY, finalPath);
            // ⭐ CRITICAL STEP: Also save the current active page index on successful save
            saveActivePageIndex(csgEditor, LAST_CSG_PAGE_KEY);
            saveActivePageIndex(editorCodeEditor, LAST_EDITOR_CODE_PAGE_KEY);
            PrintLog(`Saved last project path and page index: ${finalPath}`);
            
        } catch (e) {
            PrintWarn("Failed to save path to localStorage:", e);
        }

        alert(`Project saved successfully to: ${finalPath}`);
        // ⭐ Only close the modal on SUCCESS
        closeModal('save-code-modal'); 

    } catch (error) {
        alert(`Failed to save project: ${error.message}`);
        // ⭐ DO NOT close the modal on FAILURE
    }
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
	
    const pageData = csgEditor.values[csgEditor.valuesIndex]; // Uses current/restored index
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
    
    // Reset wireframe mode after re-rendering
    isWireframeMode = false;
    const btn = document.getElementById('btn-wireframe');
    if (btn) btn.style.backgroundColor = '#3498db';
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

// New function to toggle the wireframe view
export function toggleWireframe() {
    isWireframeMode = !isWireframeMode;
    applyToMesh(currentObjects, (item) => {
        if (isWireframeMode) {
            if (!item.userData.originalMaterial) {
                item.userData.originalMaterial = item.material;
            }
            item.material = new THREE.MeshBasicMaterial({
                color: 0xcccccc,
                wireframe: true,
                transparent: true,
                opacity: 0.5
            });
        } else {
            if (item.userData.originalMaterial) {
                item.material = item.userData.originalMaterial;
            }
        }
    });

    const btn = document.getElementById('btn-wireframe');
    if (isWireframeMode) {
        btn.style.backgroundColor = '#e74c3c';
    } else {
        btn.style.backgroundColor = '#3498db';
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

export function clearAllCache() { project.clearAllCache(scene, currentObjects); alert('In-memory cache cleared. Click "Run" to re-render.'); }


/**
 * Initializes the console panel loggers, including global functions
 * for logging and sets up the window resize listener.
 */
function initConsolePanelLoggers() {
    const panelEl = document.getElementById("console-panel");

    // Standard log formatting function
    function formatArgs(args) { 
        try { 
            return Array.from(args).map(a => {
                if (typeof a === "string") return a;
                if (a instanceof Error) return a.message;
                return JSON.stringify(a, null, 2); 
            }).join(' '); 
        } catch { return String(args); } 
    }

    // Core function to display log in the panel
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
    
    // Define global Print functions
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
        console.error(...arguments); // Use console.error for actual errors
    };
}


// MODIFIED: Initialize now adds 'pagechange' and console resize listeners
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

    // Initialization of ScadProject uses the default data
    const defaultData = getNewDefaultProjectData();
    project = new ScadProject({ 
        csgEditorRef: csgEditor, 
        codeEditorRef: editorCodeEditor, 
        csgValues: defaultData.csgCode, // Ensure internal project state has defaults from the start
        codeValues: defaultData.editorCode,
        basePath: csgEditor.basePath || null 
    });

    // Initialize the console logging globals
    initConsolePanelLoggers();
    
    // --- Console Resizing Logic ---
    const consoleContainer = document.getElementById('console-container');
    const consoleResizer = document.getElementById('console-resizer');
    
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    
    const startResize = (y) => {
        isResizing = true;
        startY = y;
        startHeight = consoleContainer.offsetHeight;
        document.body.style.userSelect = 'none'; // Prevent text selection during drag
        document.body.style.cursor = 'ns-resize'; // Change cursor globally
    };

    const resize = (y) => {
        if (!isResizing) return;
        
        const newHeight = Math.max(MIN_CONSOLE_HEIGHT, startHeight + (startY - y));
        const maxHeight = window.innerHeight * MAX_CONSOLE_HEIGHT_RATIO;
        
        if (newHeight >= MIN_CONSOLE_HEIGHT && newHeight <= maxHeight) {
            consoleContainer.style.height = `${newHeight}px`;
            updateMainContainerHeight(newHeight); // Update main container and editors
        }
    };

    const stopResize = () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        // Save the new height to localStorage for persistence
        localStorage.setItem(LAST_CONSOLE_HEIGHT_KEY, consoleContainer.offsetHeight);
    };

    // Attach mouse event listeners
    consoleResizer.addEventListener('mousedown', (e) => { 
        e.preventDefault();
        document.addEventListener('mousemove', onMouseMove, false);
        document.addEventListener('mouseup', onMouseUp, false);
        startResize(e.clientY);
    }, false);
    
    function onMouseMove(e) { resize(e.clientY); }
    function onMouseUp() { 
        stopResize(); 
        document.removeEventListener('mousemove', onMouseMove, false);
        document.removeEventListener('mouseup', onMouseUp, false);
    }
    
    // Attach touch event listeners
    consoleResizer.addEventListener('touchstart', (e) => { 
        e.preventDefault(); 
        if (e.touches.length === 1) {
             document.addEventListener('touchmove', onTouchMove, { passive: false });
             document.addEventListener('touchend', onTouchEnd, false);
             startResize(e.touches[0].clientY);
        }
    }, false);
    
    function onTouchMove(e) { 
        if (e.touches.length > 0) resize(e.touches[0].clientY); 
        e.preventDefault(); 
    }
    
    function onTouchEnd() { 
        stopResize(); 
        document.removeEventListener('touchmove', onTouchMove, { passive: false });
        document.removeEventListener('touchend', onTouchEnd, false);
    }
    
    // Initial load of console height from localStorage
    const savedHeight = localStorage.getItem(LAST_CONSOLE_HEIGHT_KEY);
    if (savedHeight) {
        const parsedHeight = parseFloat(savedHeight);
        const maxHeight = window.innerHeight * MAX_CONSOLE_HEIGHT_RATIO;
        if (parsedHeight >= MIN_CONSOLE_HEIGHT && parsedHeight <= maxHeight) {
            consoleContainer.style.height = `${parsedHeight}px`;
        }
    }
    
    // Call this once on load to correctly size the main container and editors
    updateMainContainerHeight(consoleContainer.offsetHeight);
    // --- End Console Resizing Logic ---


    editorCodeEditor.addEventListener('keydown', function() {
        const pageData = editorCodeEditor.values[editorCodeEditor.valuesIndex];
        if (pageData && pageData.title) { const pageName = pageData.title; if (project.codeCache[pageName]) project.codeCache[pageName].updated = false; }
    });

    csgEditor.addEventListener('keydown', function() {
        const pageData = csgEditor.values[csgEditor.valuesIndex];
        if (pageData && pageData.title) { const pageName = pageData.title; if (project.meshCache[pageName]) project.meshCache[pageName].updated = false; }
    });
    
    // Guard the page change events
    csgEditor.addEventListener('pagechange', function() {
        if (isInitializing) { 
            PrintLog("Page change event ignored during initialization.");
            return;
        }
        // Save the active page index when the user manually changes the page
        saveActivePageIndex(csgEditor, LAST_CSG_PAGE_KEY);
    });

    // Guard the page change events
    editorCodeEditor.addEventListener('pagechange', function() {
        if (isInitializing) { 
            PrintLog("Page change event ignored during initialization.");
            return;
        }
        // Save the active page index when the user manually changes the page
        saveActivePageIndex(editorCodeEditor, LAST_EDITOR_CODE_PAGE_KEY);
    });

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            openModal('save-code-modal');
        }
    });
    
    // Global resize listener just calls the height update and renderer resize
    window.addEventListener('resize', () => {
        updateMainContainerHeight(consoleContainer.offsetHeight);
    });
    
    // Attempt to load the last project from storage on startup
    autoLoadLastProject();
}


//
// --- Console panel setup ---
//

(() => {
    // Console setup logic is now primarily in initConsolePanelLoggers and initialize.
})();
