

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { ezport } from './scadCSG.js';
import { Brush } from 'three-bvh-csg';
import { api } from '/js/apiCalls.js';

// Get the list of functions from the scadCSG module
const exportedCSG = ezport();

// Declare module-level variables
let settings;
let currentObjects;
const meshCache = {};
const codeCache = {};
const exporter = new STLExporter();
let csgEditor;
let editorCodeEditor;
let renderer;
let scene;
let camera;
let controls;
let keyLight;
let ambientLight;
let originLine;
let buildPlateGrid = null;
let buildPlateBox = null;

// --- Three.js Setup Functions ---
function setupThreeJs(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setClearColor(0x1e1e1e);
    renderer.setPixelRatio(window.devicePixelRatio); // Set pixel ratio for high-res displays

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.01,
        2000
    );

    camera.position.set(0, 50, 50);
    camera.lookAt(0, 0, 0);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    keyLight = new THREE.PointLight(0xffffff, 7, 1000, 0.2);
    ambientLight = new THREE.AmbientLight(0xffcc66, 0.5);
    scene.add(keyLight, ambientLight);

    const originLineMaterial = new THREE.LineBasicMaterial({
        color: 0x555555
    });
    const originLineGeometry = new THREE.BufferGeometry().setFromPoints(
        [new THREE.Vector3(0, -100, 0), new THREE.Vector3(0, 500, 0)]
    );
    originLine = new THREE.LineSegments(originLineGeometry, originLineMaterial);
    scene.add(originLine);
}

function createBuildPlate() {
    if (buildPlateGrid) {
        scene.remove(buildPlateGrid);
        buildPlateGrid.geometry.dispose();
        buildPlateGrid = null;
    }
    if (buildPlateBox) {
        scene.remove(buildPlateBox);
        buildPlateBox.geometry.dispose();
        buildPlateBox = null;
    }

    const plateSize = Math.max(settings.plateWidth, settings.plateLength);
    const divisions = Math.floor(plateSize / settings.gridSize);
    buildPlateGrid = new THREE.GridHelper(
        plateSize,
        divisions,
        0x555555,
        0x555555
    );
    buildPlateGrid.position.y = 0;
    scene.add(buildPlateGrid);

    const boxMaterial = new THREE.LineBasicMaterial({ color: 0xcccccc });
    const boxGeometry = new THREE.BufferGeometry();
    const halfWidth = settings.plateWidth / 2;
    const halfLength = settings.plateLength / 2;
    const boxVertices = new Float32Array([
        -halfWidth, 0, -halfLength, halfWidth, 0, -halfLength,
        halfWidth, 0, -halfLength, halfWidth, 0, halfLength,
        halfWidth, 0, halfLength, -halfWidth, 0, halfLength,
        -halfWidth, 0, halfLength, -halfWidth, 0, -halfLength
    ]);
    boxGeometry.setAttribute('position', new THREE.BufferAttribute(boxVertices, 3));
    buildPlateBox = new THREE.LineSegments(boxGeometry, boxMaterial);
    scene.add(buildPlateBox);
}

// **FIX:** Correctly resize the renderer and camera
function resizeRenderer() {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width || canvas.height !== height) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    keyLight.position.copy(camera.position).add(cameraDirection.multiplyScalar(-10));
    renderer.render(scene, camera);
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

// --- UI Management and File Handling ---
function showView(id) {
    const dom = {
        codePanel: document.getElementById('code-panel'),
        viewPanel: document.getElementById('view-panel'),
        settingsPanel: document.getElementById('settings-panel'),
        editorCodePanel: document.getElementById('editor-code-panel'),
        btn3D: document.getElementById('btn-3d'),
        btnCode: document.getElementById('btn-code'),
        btnEditorCode: document.getElementById('btn-editor-code'),
        btnSettings: document.getElementById('btn-settings')
    };

    dom.codePanel.style.display = 'none';
    dom.viewPanel.style.display = 'none';
    dom.settingsPanel.style.display = 'none';
    dom.editorCodePanel.style.display = 'none';
    
    dom.btn3D.style.backgroundColor = '#3498db';
    dom.btnCode.style.backgroundColor = '#3498db';
    dom.btnEditorCode.style.backgroundColor = '#3498db';
    dom.btnSettings.style.backgroundColor = '#3498db';

    if (id === '3d') {
        dom.viewPanel.style.display = 'block';
        dom.btn3D.style.backgroundColor = '#e74c3c';
    } else if (id === 'code') {
        dom.codePanel.style.display = 'block';
        dom.btnCode.style.backgroundColor = '#e74c3c';
    } else if (id === 'editor-code') {
        dom.editorCodePanel.style.display = 'block';
        dom.btnEditorCode.style.backgroundColor = '#e74c3c';
    } else if (id === 'settings') {
        dom.settingsPanel.style.display = 'block';
        dom.btnSettings.style.backgroundColor = '#e74c3c';
    }
}

export function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

export function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

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
        await api.saveFile(finalPath, stlContent, { 'Content-Type': 'text/plain' });
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
    window.stlToSave = exporter.parse(exportGroup, { binary: false });
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

function clearAllCache() {
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

// --- Main Initialization Function ---
export function initialize(domElements) {
    csgEditor = domElements.csgEditor;
    editorCodeEditor = domElements.editorCodeEditor;
    currentObjects = [];

    // Setup Three.js
    setupThreeJs(domElements.canvas);

    // Initial settings load
    settings = { plateWidth: 220, plateLength: 220, gridSize: 10, libraryPath: '/csgLib' };
    const savedSettings = localStorage.getItem('csg-editor-settings');
    if (savedSettings) {
        settings = JSON.parse(savedSettings);
    }
    domElements.widthInput.value = settings.plateWidth;
    domElements.lengthInput.value = settings.plateLength;
    domElements.gridSizeInput.value = settings.gridSize;
    domElements.libraryPathInput.value = settings.libraryPath;

    // Load code from local storage
    const savedCsgCode = localStorage.getItem('csg-editor-code');
    if (savedCsgCode) {
        try {
            const loadedValues = JSON.parse(savedCsgCode);
            csgEditor.values = loadedValues;
            csgEditor.setAttribute('active', '0');
        } catch (e) {
            csgEditor.value = savedCsgCode;
            for (const key in meshCache) {
                delete meshCache[key];
            }
        }
    }
    
    const savedEditorCode = localStorage.getItem('csg-editor-functions');
    if (savedEditorCode) {
        try {
            const loadedValues = JSON.parse(savedEditorCode);
            editorCodeEditor.values = loadedValues;
            editorCodeEditor.setAttribute('active', '0');
        } catch (e) {
            editorCodeEditor.value = savedEditorCode;
            for (const key in codeCache) {
                delete codeCache[key];
            }
        }
    }

    // Set up event listeners
    window.addEventListener('resize', resizeRenderer);
    domElements.btn3D.addEventListener('click', () => showView('3d'));
    domElements.btnCode.addEventListener('click', () => showView('code'));
    domElements.btnEditorCode.addEventListener('click', () => showView('editor-code'));
    domElements.btnSettings.addEventListener('click', () => showView('settings'));
    domElements.btnLoad.addEventListener('click', () => openModal('load-code-modal'));
    
    domElements.btnSave.addEventListener('click', () => {
        const { codePanel, editorCodePanel, viewPanel, settingsPanel } = domElements;
        if (codePanel.style.display === 'block' || editorCodePanel.style.display === 'block') {
            openModal('save-code-modal');
        } else if (viewPanel.style.display === 'block') {
            exportSTL();
        } else if (settingsPanel.style.display === 'block') {
            saveSettings(domElements);
        }
    });

    domElements.saveSettingsBtn.addEventListener('click', () => saveSettings(domElements));
    domElements.clearCacheBtn.addEventListener('click', clearAllCache);
    
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
            const { codePanel, editorCodePanel, viewPanel } = domElements;
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


