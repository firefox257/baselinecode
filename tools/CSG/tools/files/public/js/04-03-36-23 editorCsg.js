


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

//
// Class-based project with caches
//
class ScadProject {
    /**
     * Construct a project.
     * - For the MAIN project, pass live editor refs so values always reflect UI:
     *     new ScadProject({ csgEditorRef: csgEditor, codeEditorRef: editorCodeEditor, basePath: csgEditor.basePath })
     * - For SUBPROJECTS (loaded from a file), pass static arrays:
     *     new ScadProject({ csgValues: projectData.csgCode, codeValues: projectData.editorCode, basePath: dirOfFile })
     */
    constructor({ csgEditorRef = null, codeEditorRef = null, csgValues = null, codeValues = null, basePath = null } = {}) {
        this.meshCache = {};
        this.codeCache = {};
        this.fileCache = {};   // Cache of nested ScadProjects (keyed by fullPath)
        this._csgEditorRef = csgEditorRef;
        this._codeEditorRef = codeEditorRef;
        this._csgValues = Array.isArray(csgValues) ? csgValues : null;
        this._codeValues = Array.isArray(codeValues) ? codeValues : null;
        this.basePath = basePath || null; // per-project base path
    }

    // Live getters: prefer bound editor refs; otherwise fall back to static arrays
    get csgValues() {
        if (this._csgEditorRef && Array.isArray(this._csgEditorRef.values)) return this._csgEditorRef.values;
        return this._csgValues || [];
    }
    get codeValues() {
        if (this._codeEditorRef && Array.isArray(this._codeEditorRef.values)) return this._codeEditorRef.values;
        return this._codeValues || [];
    }

    // Allow rebinding after file loads or UI swaps
    rebindEditors(csgEditorRef, codeEditorRef) {
        this._csgEditorRef = csgEditorRef;
        this._codeEditorRef = codeEditorRef;
    }
    setBasePath(bp) {
        this.basePath = bp || null;
    }

    // Per-project path resolver (uses this.basePath; falls back to global editor basePath if missing)
    path(filepath) {
        if (!filepath) return null;
        if (filepath.startsWith('/')) return filepath;

        const libraryPath = (typeof settings !== 'undefined' && settings.libraryPath) ? settings.libraryPath : '/csgLib';
        if (filepath.startsWith('$lib/')) {
            return libraryPath + '/' + filepath.substring(5);
        }

        const base = this.basePath ?? (this._csgEditorRef && this._csgEditorRef.basePath) ?? (typeof csgEditor !== 'undefined' ? csgEditor.basePath : null);
        if (!base) {
            alert("Error: Cannot use relative paths. Please load or save a project first to establish a base path.");
            return null;
        }

        const parts = base.split('/').filter(Boolean);
        const fileParts = filepath.split('/');

        for (const part of fileParts) {
            if (part === '..') {
                if (parts.length > 0) parts.pop();
            } else if (part !== '.' && part !== '') {
                parts.push(part);
            }
        }
        return '/' + parts.join('/');
    }

    // Ensure (or create) a subproject for a given file
    async _getOrLoadSubProject(fullPath) {
        let subProject = this.fileCache[fullPath];
        if (subProject) return subProject;

        try {
            const fileContent = await api.readFile(fullPath);
            const projectData = JSON.parse(fileContent);

            // derive basePath = directory of fullPath
            const segs = fullPath.split('/');
            segs.pop();
            const subBase = '/' + segs.filter(Boolean).join('/');

            subProject = new ScadProject({
                csgValues: projectData.csgCode || [],
                codeValues: projectData.editorCode || [],
                basePath: subBase
            });
            this.fileCache[fullPath] = subProject;
            return subProject;
        } catch (err) {
            console.error(`❌ Failed to load file '${fullPath}':`, err);
            alert(`External Project Load Error:\n` + err.message);
            return null;
        }
    }

    async get(name, filepath = null) {
        if (filepath) {
            const fullPath = this.path(filepath);
            if (!fullPath) return null;

            // delegate into subproject
            const subProject = await this._getOrLoadSubProject(fullPath);
            if (!subProject) return null;
            return await subProject.get(name); // subProject context from here on
        }

        // --- Local execution ---
        const idx = this.csgValues.findIndex(p => p.title === name);
        if (idx === -1) {
            console.error(`Page '${name}' not found.`);
            return null;
        }

        const requestedPage = this.csgValues[idx];
        const requestedPageName = requestedPage.title;

        if (this.meshCache[requestedPageName] && this.meshCache[requestedPageName].updated) {
            console.log(`✅ Loading cached mesh for page: ${requestedPageName}`);
            return this.meshCache[requestedPageName].mesh;
        }

        console.log(`🔍 Re-evaluating code for page: ${requestedPageName}`);
        try {
            const script = new Function(
                ...exportedCSG.names, 'get', 'include', 'path',
                `return (async () => { ${requestedPage.content} })();`
            );
            const result = await script(
                ...exportedCSG.funcs,
                this.get.bind(this),            // bound to THIS project
                this.include.bind(this),        // bound to THIS project
                this.path.bind(this)            // per-project path resolver
            );

            this.meshCache[requestedPageName] = { mesh: result, updated: true };
            return result;
        } catch (err) {
            console.error(`❌ CSG Error for page '${requestedPageName}':`, err);
            alert(`CSG Error for page '${requestedPageName}':\n` + err.message);
            return null;
        }
    }

    async include(name, filepath = null) {
        if (filepath) {
            const fullPath = this.path(filepath);
            if (!fullPath) return null;

            // delegate into subproject
            const subProject = await this._getOrLoadSubProject(fullPath);
            if (!subProject) return null;
            return await subProject.include(name); // subProject context from here on
        }

        // --- Local execution ---
        const cacheKey = name;
        if (this.codeCache[cacheKey] && this.codeCache[cacheKey].updated) {
            return this.codeCache[cacheKey].result;
        }

        const pageData = this.codeValues.find(p => p.title === name);
        if (!pageData) {
            console.error(`Include error: Page '${name}' not found.`);
            return null;
        }

        console.log(`🔍 Compiling included code for page: ${name}`);
        try {
            const script = new Function(
                ...exportedCSG.names, 'get', 'include', 'path',
                `return (async () => { ${pageData.content} })();`
            );
            const result = await script(
                ...exportedCSG.funcs,
                this.get.bind(this),            // bound to THIS project
                this.include.bind(this),        // bound to THIS project
                this.path.bind(this)            // per-project path resolver
            );

            this.codeCache[cacheKey] = { result, updated: true };
            return result;
        } catch (err) {
            console.error(`❌ Include error for page '${name}':`, err);
            alert(`Include Error for page '${name}':\n` + err.message);
            return null;
        }
    }

    clearAllCache(scene, currentObjects) {
        this.meshCache = {};
        this.codeCache = {};
        this.fileCache = {};
        currentObjects.forEach(obj => scene.remove(obj));
        currentObjects.length = 0;

        alert('In-memory cache has been cleared. The model has been removed from the scene. Click "Run" to re-render.');
    }
}

let project; // global instance

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
                project.meshCache[pageName] = { mesh: rehydratedMesh, updated: true };
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
            meshCache: {}
        };

        for (const pageName in project.meshCache) {
            const cachedItem = project.meshCache[pageName];
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

//
// Utility (global fallback path if needed elsewhere outside the class)
//
function path(filepath) {
    if (!filepath) return null;
    if (filepath.startsWith('/')) return filepath;

    const libraryPath = (typeof settings !== 'undefined' && settings.libraryPath) ? settings.libraryPath : '/csgLib';
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
            if (parts.length > 0) parts.pop();
        } else if (part !== '.' && part !== '') {
            parts.push(part);
        }
    }
    return '/' + parts.join('/');
}

//
// Execution functions
//
export async function runEditorScript() {
    const activeIndex = editorCodeEditor.valuesIndex;
    const pageData = editorCodeEditor.values[activeIndex];

    if (!pageData) {
        console.error('No active page data found in editor.');
        return;
    }

    const pageName = pageData.title;
    if (project.codeCache[pageName] && project.codeCache[pageName].updated) {
        project.codeCache[pageName].updated = false;
    }

    await project.include(pageName);
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

    const activeMesh = await project.get(pageName);
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

export function clearAllCache() {
    project.clearAllCache(scene, currentObjects);
}

//
// Initialization
//
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

    // MAIN project: bind editors (live values) and starting basePath
    project = new ScadProject({
        csgEditorRef: csgEditor,
        codeEditorRef: editorCodeEditor,
        basePath: csgEditor.basePath || null
    });

    // mark caches dirty on keyboard input
    editorCodeEditor.addEventListener('keydown', function(e) {
        const pageIndex = editorCodeEditor.valuesIndex;
        const pageData = editorCodeEditor.values[pageIndex];
        if (pageData && pageData.title) {
            const pageName = pageData.title;
            if (project.codeCache[pageName]) {
                project.codeCache[pageName].updated = false;
                const csgPageIndex = csgEditor.valuesIndex;
                const csgPageData = csgEditor.values[csgPageIndex];
                if (csgPageData && csgPageData.title) {
                    if (project.meshCache[csgPageData.title]) {
                        project.meshCache[csgPageData.title].updated = false;
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
            if (project.meshCache[pageName]) {
                project.meshCache[pageName].updated = false;
            }
        }
    });

    // Ctrl/Cmd+S save handler
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
}

