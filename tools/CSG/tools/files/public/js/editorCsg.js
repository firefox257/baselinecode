

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

// Get the list of functions from the scadCSG module
const exportedCSG = ezport();

// Declare module-level variables
//let settings;
let currentObjects;

const exporter = new STLExporter();

var csgEditor;// keep as reference from html

var editorCodeEditor;//keep as reference from html

var openModal;
var closeModal;


//var setupThreeJs;

var createBuildPlate;
var resizeRenderer;
var animate;

var showView;

let scene;

const meshCache = {};
const codeCache = {};

export async function get(name) {
    const requestedIndex = csgEditor.values.findIndex(p => p.title === name);
    if (requestedIndex === -1) {
        console.error(`Page '${name}' not found.`);
        return null;
    }

    const requestedPage = csgEditor.values[requestedIndex];
    const requestedPageName = requestedPage.title;

    if (meshCache[requestedPageName] && meshCache[requestedPageName].updated) {
        console.log(`✅ Loading cached mesh for page: ${requestedPageName}`);
        return meshCache[requestedPageName].mesh;
    }

    console.log(`🔍 Re-evaluating code for page: ${requestedPageName}`);
    try {
        const script = new Function(
            ...exportedCSG.names, 'get', 'include', 'path',
            `return (async () => { ${requestedPage.content} })();`
        );
        const result = await script(
            ...exportedCSG.funcs, get, include, path
        );

        meshCache[requestedPageName] = { mesh: result, updated: true };
        return result;
    } catch (err) {
        console.error(`❌ CSG Error for page '${requestedPageName}':`, err);
        alert(`CSG Error for page '${requestedPageName}':\n` + err.message);
        return null;
    }
}

export const include = async (name, filepath = null) => {
    let pageData;
    let cacheKey = name;

    if (filepath) {
        const fullPath = path(filepath);
        if (!fullPath) {
            return null;
        }

        cacheKey = `${fullPath}:${name}`;
        if (codeCache[cacheKey] && codeCache[cacheKey].updated) {
            console.log(`✅ Loading cached external code for page: ${name} from file: ${fullPath}`);
            return codeCache[cacheKey].result;
        }

        try {
            const fileContent = await api.readFile(fullPath);
            const projectData = JSON.parse(fileContent);

            if (!projectData.editorCode) {
                throw new Error("File does not contain an 'editorCode' section.");
            }

            pageData = projectData.editorCode.find(p => p.title === name);

            if (!pageData) {
                throw new Error(`Page '${name}' not found in file '${fullPath}'.`);
            }

        } catch (err) {
            console.error(`❌ External include error for page '${name}' from file '${fullPath}':`, err);
            alert(`External Include Error:\n` + err.message);
            return null;
        }

    } else {
        if (codeCache[cacheKey] && codeCache[cacheKey].updated) {
            return codeCache[cacheKey].result;
        }

        pageData = editorCodeEditor.values.find(p => p.title === name);
        if (!pageData) {
            console.error(`Include error: Page '${name}' not found.`);
            return null;
        }
    }

    console.log(`🔍 Compiling included code for page: ${name}`);
    try {
        const script = new Function(
            ...exportedCSG.names, 'get', 'include', 'path',
            `return (async () => { ${pageData.content} })();`
        );
        const result = await script(
            ...exportedCSG.funcs, get, include, path
        );

        codeCache[cacheKey] = { result: result, updated: true };
        return result;
    } catch (err) {
        console.error(`❌ Include error for page '${name}':`, err);
        alert(`Include Error for page '${name}':\n` + err.message);
        return null;
    }
};

export async function handleLoadFile(event, filePath) {
    try {
        const fileContent = await api.readFile(filePath);
        const projectData = JSON.parse(fileContent);

        const pathSegments = filePath.split('/');
        pathSegments.pop();
        csgEditor.basePath = pathSegments.join('/') + '/';

        if (projectData.csgCode) {
            csgEditor.values = projectData.csgCode;
            csgEditor.setAttribute('active', '0');
        }
        if (projectData.editorCode) {
            editorCodeEditor.values = projectData.editorCode;
            editorCodeEditor.setAttribute('active', '0');
        }

        const objectLoader = new THREE.ObjectLoader();
        if (projectData.meshCache) {
            for (const pageName in projectData.meshCache) {
                const cachedData = projectData.meshCache[pageName];
                let rehydratedMesh = null;

                if (cachedData.mesh) {
                    if (cachedData.mesh.isBrush) {
                        const mesh = objectLoader.parse(cachedData.mesh.mesh);
                        rehydratedMesh = new Brush(mesh);
                    } else if (cachedData.mesh.geometries || cachedData.mesh.object) {
                        rehydratedMesh = objectLoader.parse(cachedData.mesh);
                    } else if (typeof cachedData.mesh === 'object' && cachedData.mesh !== null) {
                        const rehydratedSubmeshes = {};
                        for (const subKey in cachedData.mesh) {
                            const item = cachedData.mesh[subKey];
                            if (item && item.data) {
                                let subMesh = null;
                                if (item.data.isBrush) {
                                    const mesh = objectLoader.parse(item.data.mesh);
                                    subMesh = new Brush(mesh);
                                } else {
                                    subMesh = objectLoader.parse(item.data);
                                }
                                rehydratedSubmeshes[subKey] = { data: subMesh, show: item.show };
                            }
                        }
                        rehydratedMesh = rehydratedSubmeshes;
                    }
                }
                meshCache[pageName] = { mesh: rehydratedMesh, updated: true };
            }
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
        if (!csgEditor.basePath) {
            const pathSegments = filePath.split('/');
            pathSegments.pop();
            csgEditor.basePath = pathSegments.join('/') + '/';
        }

        const projectData = {
            csgCode: csgEditor.values,
            editorCode: editorCodeEditor.values,
            meshCache: {}
        };

        for (const pageName in meshCache) {
            const cachedItem = meshCache[pageName];
            if (cachedItem.updated && cachedItem.mesh) {
                if (cachedItem.mesh instanceof THREE.Object3D) {
                    projectData.meshCache[pageName] = { mesh: cachedItem.mesh.toJSON(), updated: true };
                } else if (cachedItem.mesh instanceof Brush) {
                    if (cachedItem.mesh.mesh instanceof THREE.Object3D) {
                        projectData.meshCache[pageName] = { mesh: { isBrush: true, mesh: cachedItem.mesh.mesh.toJSON() }, updated: true };
                    }
                } else if (typeof cachedItem.mesh === 'object' && cachedItem.mesh !== null) {
                    const serializedSubmeshes = {};
                    for (const subKey in cachedItem.mesh) {
                        const item = cachedItem.mesh[subKey];
                        if (item && item.data instanceof THREE.Object3D) {
                            serializedSubmeshes[subKey] = { data: item.data.toJSON(), show: item.show };
                        } else if (item && item.data instanceof Brush) {
                            serializedSubmeshes[subKey] = { data: { isBrush: true, mesh: item.data.mesh.toJSON() }, show: item.show };
                        }
                    }
                    projectData.meshCache[pageName] = { mesh: serializedSubmeshes, updated: true };
                }
            }
        }

        const projectDataString = JSON.stringify(projectData, null, 2);
        await api.saveFile(finalPath, projectDataString);
        alert(`Project saved successfully to: ${finalPath}`);
    } catch (error) {
        alert(`Failed to save project: ${error.message}`);
    }
    closeModal('save-code-modal');
}

// --- CSG/Code Logic Functions ---
function path(filepath) {
    if (filepath.startsWith('/')) {
        return filepath;
    }

    const libraryPath = settings.libraryPath || '/csgLib';
    if (filepath.startsWith('$lib/')) {
        return libraryPath + '/' + filepath.substring(5);
    }

    if (!csgEditor.basePath) {
        alert("Error: Cannot use relative paths. Please load or save a project first to establish a base path.");
        return null;
    }

    const currentDirectory = csgEditor.basePath;
    const parts = currentDirectory.split('/').filter(p => p !== '');
    const fileParts = filepath.split('/');

    for (const part of fileParts) {
        if (part === '..') {
            if (parts.length > 0) {
                parts.pop();
            }
        } else if (part !== '.' && part !== '') {
            parts.push(part);
        }
    }

    return '/' + parts.join('/');
}

export async function runEditorScript() {
    const activeIndex = editorCodeEditor.valuesIndex;
    const pageData = editorCodeEditor.values[activeIndex];

    if (!pageData) {
        console.error('No active page data found in editor.');
        return;
    }

    const pageName = pageData.title;
    if (codeCache[pageName] && codeCache[pageName].updated) {
        codeCache[pageName].updated = false;
    }

    await include(pageName);
}

export async function runCSGCode() {
    currentObjects.forEach((obj) => scene.remove(obj));
    currentObjects = [];

    const activeIndex = csgEditor.valuesIndex;
    const pageData = csgEditor.values[activeIndex];

    if (!pageData) {
        console.error('No active page data found in editor.');
        return;
    }

    const pageName = pageData.title;

    const activeMesh = await get(pageName);
    if (activeMesh) {
        if (activeMesh instanceof THREE.Object3D || activeMesh instanceof Brush) {
            scene.add(activeMesh);
            currentObjects.push(activeMesh);
        } else if (typeof activeMesh === 'object' && activeMesh !== null) {
            for (const subKey in activeMesh) {
                const item = activeMesh[subKey];
                if (
                    item && item.data &&
                    (item.data instanceof THREE.Object3D || item.data instanceof Brush) &&
                    item.show === true
                ) {
                    scene.add(item.data);
                    currentObjects.push(item.data);
                }
            }
        }
    }
}

export async function handleSaveStl(event, filePath) {
    try {
        let finalPath = filePath;
        if (!finalPath.toLowerCase().endsWith('.stl')) {
            finalPath += '.stl';
        }
        const stlContent = window.stlToSave;
        if (!stlContent) {
            throw new Error('No STL content to save. Generate a model first.');
        }
        await api.saveFile(finalPath, stlContent, {
            'Content-Type': 'text/plain'
        });
        alert(`STL file saved successfully to: ${finalPath}`);
    } catch (error) {
        alert(`Failed to save STL file: ${error.message}`);
    }
    closeModal('save-stl-modal');
}

export function exportSTL() {
    if (currentObjects.length === 0) {
        alert('No objects to export!');
        return;
    }
    const exportGroup = new THREE.Group();
    currentObjects.forEach((obj) => {
        if (obj.isMesh || obj instanceof Brush) {
            exportGroup.add(obj.clone());
        }
    });
    window.stlToSave = exporter.parse(exportGroup, {
        binary: false
    });
    openModal('save-stl-modal');
}

function saveSettings(domElements) {
    const newWidth = parseFloat(domElements.widthInput.value);
    const newLength = parseFloat(domElements.lengthInput.value);
    const newGridSize = parseFloat(domElements.gridSizeInput.value);
    const newLibraryPath = domElements.libraryPathInput.value;

    if (isNaN(newWidth) || newWidth <= 0 || isNaN(newLength) || newLength <= 0 || isNaN(newGridSize) || newGridSize <= 0) {
        alert('Please enter valid positive numbers for all settings.');
        return;
    }

    settings.plateWidth = newWidth;
    settings.plateLength = newLength;
    settings.gridSize = newGridSize;
    settings.libraryPath = newLibraryPath;

    localStorage.setItem('csg-editor-settings', JSON.stringify(settings));

    createBuildPlate();
    alert('Settings saved successfully!');
}

export function clearAllCache() {
    for (const key in meshCache) {
        if (meshCache.hasOwnProperty(key)) {
            delete meshCache[key];
        }
    }
    for (const key in codeCache) {
        if (codeCache.hasOwnProperty(key)) {
            delete codeCache[key];
        }
    }

    currentObjects.forEach(obj => scene.remove(obj));
    currentObjects = [];

    alert('In-memory cache has been cleared. The model has been removed from the scene. Click "Run" to re-render.');
}

export function initialize(domElements) {
    csgEditor = domElements.csgEditor;
    editorCodeEditor = domElements.editorCodeEditor;
	openModal= domElements.openModal;
	closeModal= domElements.closeModal;
	
	//setupThreeJs = domElements.setupThreeJs;
	createBuildPlate = domElements.createBuildPlate;
	resizeRenderer = domElements.resizeRenderer;
	animate = domElements.animate;
	
	showView=  domElements.showView;
	
    currentObjects = [];

    // Setup Three.js
	scene=domElements.scene;
	
    editorCodeEditor.addEventListener('keydown', function(e) {
        const pageIndex = editorCodeEditor.valuesIndex;
        const pageData = editorCodeEditor.values[pageIndex];
        if (pageData && pageData.title) {
            const pageName = pageData.title;
            if (codeCache[pageName]) {
                codeCache[pageName].updated = false;
                const csgPageIndex = csgEditor.valuesIndex;
                const csgPageData = csgEditor.values[csgPageIndex];
                if (csgPageData && csgPageData.title) {
                    if (meshCache[csgPageData.title]) {
                        meshCache[csgPageData.title].updated = false;
                    }
                }
            }
        }
    });

    csgEditor.addEventListener('keydown', function(e) {
        const pageIndex = csgEditor.valuesIndex;
        const pageData = csgEditor.values[pageIndex];
        if (pageData && pageData.title) {
            const pageName = pageData.title;
            if (meshCache[pageName]) {
                meshCache[pageName].updated = false;
            }
        }
    });

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const {
                codePanel,
                editorCodePanel,
                viewPanel
            } = domElements;
            if (codePanel.style.display === 'block' || editorCodePanel.style.display === 'block') {
                openModal('save-code-modal');
            } else if (viewPanel.style.display === 'block') {
                exportSTL();
            }
        }
    });

    // Initial view and render
    showView('3d');
    createBuildPlate();
    resizeRenderer();
    animate();
    runCSGCode();
}


