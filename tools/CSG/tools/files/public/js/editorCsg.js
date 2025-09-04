


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
            console.error(`❌ Failed to load file '${fullPath}':`, err);
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
        if (idx === -1) { console.error(`Page '${name}' not found.`); return null; }
        const requestedPage = this.csgValues[idx];
        const requestedPageName = requestedPage.title;

        if (this.meshCache[requestedPageName] && this.meshCache[requestedPageName].updated) {
            console.log(`✅ Loading cached mesh for page: ${requestedPageName}`);
            return this.meshCache[requestedPageName].mesh;
        }

        console.log(`🔍 Re-evaluating code for page: ${requestedPageName}`);
        try {
            const script = new Function(...exportedCSG.names, 'get', 'include', 'path',
                `return (async () => { ${requestedPage.content} })();`
            );
            const result = await script(...exportedCSG.funcs, this.get.bind(this), this.include.bind(this), this.path.bind(this));
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
            const subProject = await this._getOrLoadSubProject(fullPath);
            if (!subProject) return null;
            return await subProject.include(name);
        }

        const cacheKey = name;
        if (this.codeCache[cacheKey] && this.codeCache[cacheKey].updated) return this.codeCache[cacheKey].result;

        const pageData = this.codeValues.find(p => p.title === name);
        if (!pageData) { console.error(`Include error: Page '${name}' not found.`); return null; }

        console.log(`🔍 Compiling included code for page: ${name}`);
        try {
            const script = new Function(...exportedCSG.names, 'get', 'include', 'path',
                `return (async () => { ${pageData.content} })();`
            );
            const result = await script(...exportedCSG.funcs, this.get.bind(this), this.include.bind(this), this.path.bind(this));
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
        alert('In-memory cache cleared. Click "Run" to re-render.');
    }
}

//
// File handling
//
export async function handleLoadFile(event, filePath) {
    try {
        const fileContent = await api.readFile(filePath);
        const projectData = JSON.parse(fileContent);

        const pathSegments = filePath.split('/');
        pathSegments.pop();
        const newBasePath = pathSegments.join('/') + '/';
        csgEditor.basePath = newBasePath;
        project.setBasePath(newBasePath);

        if (projectData.csgCode) { csgEditor.values = projectData.csgCode; csgEditor.setAttribute('active', '0'); }
        if (projectData.editorCode) { editorCodeEditor.values = projectData.editorCode; editorCodeEditor.setAttribute('active', '0'); }

        const objectLoader = new THREE.ObjectLoader();
        if (projectData.meshCache) {
            for (const pageName in projectData.meshCache) {
                const cachedData = projectData.meshCache[pageName];
                let rehydratedMesh = null;
                if (cachedData.mesh) {
                    if (cachedData.mesh.isBrush) { rehydratedMesh = new Brush(objectLoader.parse(cachedData.mesh.mesh)); }
                    else if (cachedData.mesh.geometries || cachedData.mesh.object) { rehydratedMesh = objectLoader.parse(cachedData.mesh); }
                    else if (typeof cachedData.mesh === 'object') {
                        const rehydratedSubmeshes = {};
                        for (const subKey in cachedData.mesh) {
                            const item = cachedData.mesh[subKey];
                            if (item && item.data) {
                                rehydratedSubmeshes[subKey] = {
                                    data: item.data.isBrush ? new Brush(objectLoader.parse(item.data.mesh)) : objectLoader.parse(item.data),
                                    show: item.show
                                };
                            }
                        }
                        rehydratedMesh = rehydratedSubmeshes;
                    }
                }
                project.meshCache[pageName] = { mesh: rehydratedMesh, updated: true };
            }
        }

        if (csgEditor.values[csgEditor.valuesIndex]) runCSGCode();
        alert(`Project loaded successfully from: ${filePath}`);
    } catch (error) {
        alert(`Failed to load project: ${error.message}`);
    }
    closeModal('load-code-modal');
}

export async function handleSaveFile(event, filePath) {
    try {
        if (!csgEditor.basePath) { const pathSegments = filePath.split('/'); pathSegments.pop(); csgEditor.basePath = pathSegments.join('/') + '/'; }
        project.setBasePath(csgEditor.basePath);

        const projectData = { csgCode: csgEditor.values, editorCode: editorCodeEditor.values, meshCache: {} };
        for (const pageName in project.meshCache) {
            const cachedItem = project.meshCache[pageName];
            if (cachedItem.updated && cachedItem.mesh) {
                if (cachedItem.mesh instanceof THREE.Object3D) projectData.meshCache[pageName] = { mesh: cachedItem.mesh.toJSON(), updated: true };
                else if (cachedItem.mesh instanceof Brush) projectData.meshCache[pageName] = { mesh: { isBrush: true, mesh: cachedItem.mesh.mesh.toJSON() }, updated: true };
                else if (typeof cachedItem.mesh === 'object') {
                    const serializedSubmeshes = {};
                    for (const subKey in cachedItem.mesh) {
                        const item = cachedItem.mesh[subKey];
                        if (item && item.data instanceof THREE.Object3D) serializedSubmeshes[subKey] = { data: item.data.toJSON(), show: item.show };
                        else if (item && item.data instanceof Brush) serializedSubmeshes[subKey] = { data: { isBrush: true, mesh: item.data.mesh.toJSON() }, show: item.show };
                    }
                    projectData.meshCache[pageName] = { mesh: serializedSubmeshes, updated: true };
                }
            }
        }

        await api.saveFile(filePath, JSON.stringify(projectData, null, 2));
        alert(`Project saved successfully to: ${filePath}`);
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
    if (!activeMesh) return;

    if (activeMesh instanceof THREE.Object3D || activeMesh instanceof Brush) {
        scene.add(activeMesh); currentObjects.push(activeMesh);
    } else if (typeof activeMesh === 'object') {
        for (const subKey in activeMesh) {
            const item = activeMesh[subKey];
            if (item && item.data && (item.data instanceof THREE.Object3D || item.data instanceof Brush) && item.show) {
                scene.add(item.data);
                currentObjects.push(item.data);
            }
        }
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
(function setupConsolePanel() {
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

        const origLog = console.log.bind(console);
        const origWarn = console.warn.bind(console);
        const origError = console.error.bind(console);

        function formatArgs(args) { try { return Array.from(args).map(a => typeof a === "string" ? a : JSON.stringify(a)).join(' '); } catch { return String(args); } }
        function logToPanel(type, args) { const msg = document.createElement("div"); msg.className = "console-" + type; msg.textContent = formatArgs(args); panelEl.appendChild(msg); panelEl.scrollTop = panelEl.scrollHeight; }

        console.log = function () { logToPanel("log", arguments); origLog(...arguments); };
        console.warn = function () { logToPanel("warn", arguments); origWarn(...arguments); };
        console.error = function () { logToPanel("error", arguments); origError(...arguments); };

        mainContainer.style.height = (window.innerHeight - containerEl.offsetHeight -40) + "px";
        window.addEventListener('resize', () => { mainContainer.style.height = (window.innerHeight - containerEl.offsetHeight) + "px"; resizeRenderer(); });
    }
})();
