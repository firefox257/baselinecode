


// ./ux/saveFile.js

import { api } from '../js/apiCalls.js'; // The API module is now used directly!

// --- Constants ---
const LINE_HEIGHT_EM = 1.5;

// --- Module-level Variables ---
let stylesInjected = false;

// --- Dynamic Style Injection ---
/**
 * Injects necessary CSS styles for the save file dialog into the document head.
 * Ensures styles are injected only once.
 */
function injectStyles() {
    if (stylesInjected) return;

    const style = document.createElement('style');
    style.id = 'save-file-styles';
    style.textContent = `
        .save-file-container {
            position: relative;
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            overflow: hidden;
            border: 1px solid #ccc;
            font-family: 'Fira Code', 'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
            font-size: 14px;
            line-height: ${LINE_HEIGHT_EM};
            background-color: #f8f8f8;
        }
        .save-file-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 8px;
            background-color: #333;
            color: #fff;
            font-weight: bold;
            flex-shrink: 0;
            height: 32px;
            box-sizing: border-box;
        }
        .save-file-header span {
            flex-grow: 1;
        }
        .save-file-close-button {
            background: none;
            border: none;
            color: #fff;
            font-size: 1.2em;
            cursor: pointer;
            padding: 0 4px;
            height: 100%;
            display: flex;
            align-items: center;
        }
        .save-file-close-button:hover {
            background-color: #555;
        }
        .save-file-path-display {
            display: flex;
            align-items: center;
            padding: 2px 5px;
            background-color: #e9e9e9;
            border-bottom: 1px solid #ddd;
            flex-shrink: 0;
            height: 24px;
            box-sizing: border-box;
            font-weight: bold;
        }
        .save-file-current-path {
            flex-grow: 1;
            text-overflow: ellipsis;
            white-space: nowrap;
            overflow: hidden;
            padding-right: 5px;
        }
        .save-file-list-container {
            flex-grow: 1;
            overflow-y: auto;
            background-color: #ffffff;
            border-bottom: 1px solid #ccc;
        }
        .save-file-list-table {
            width: 100%;
            border-collapse: collapse;
        }
        .save-file-list-table th,
        .save-file-list-table td {
            padding: 4px 8px;
            text-align: left;
            border-bottom: 1px solid #eee;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .save-file-list-table th {
            background-color: #f0f0f0;
            font-weight: bold;
            color: #333;
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .save-file-list-table tr:hover {
            background-color: #e0e0e0;
        }
        .save-file-list-table .file-name {
            cursor: pointer;
            color: #007bff;
            text-decoration: none;
        }
        .save-file-list-table .file-name:hover {
            text-decoration: underline;
        }
        .save-file-list-table .file-icon {
            font-size: 1.1em;
            vertical-align: middle;
            margin-right: 5px;
        }
        .save-file-controls {
            padding: 8px;
            flex-shrink: 0;
            background-color: #f0f0f0;
            border-top: 1px solid #ddd;
        }
        .save-file-controls label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        .save-file-input {
            width: 100%;
            padding: 6px;
            box-sizing: border-box;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 1em;
            margin-bottom: 10px;
        }
        .save-file-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
        .save-file-buttons button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1em;
            transition: background-color 0.2s;
            min-width: 80px;
        }
        .save-file-buttons .save-button {
            background-color: #28a745;
            color: white;
        }
        .save-file-buttons .save-button:hover:not(:disabled) {
            background-color: #218838;
        }
        .save-file-buttons .save-button:disabled {
            background-color: #94d3a2;
            cursor: not-allowed;
        }
        .save-file-buttons .cancel-button {
            background-color: #dc3545;
            color: white;
        }
        .save-file-buttons .cancel-button:hover {
            background-color: #c82333;
        }
        .save-file-confirm-dialog {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #fff;
            border: 1px solid #ccc;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            z-index: 1001;
            display: none;
            flex-direction: column;
            gap: 15px;
            min-width: 280px;
            max-width: 90%;
        }
        .save-file-confirm-dialog-buttons {
            display: flex;
            justify-content: center;
            gap: 10px;
        }
    `;
    document.head.appendChild(style);
    stylesInjected = true;
}

/**
 * Shows a confirmation dialog.
 * @param {string} message The confirmation message.
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if canceled.
 */
function showConfirmDialog(message) {
    return new Promise(resolve => {
        let dialog = document.getElementById('save-file-global-confirm-dialog');
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'save-file-global-confirm-dialog';
            dialog.className = 'save-file-confirm-dialog';
            dialog.innerHTML = `
                <p class="save-file-confirm-message"></p>
                <div class="save-file-confirm-dialog-buttons">
                    <button class="confirm-ok">OK</button>
                    <button class="cancel">Cancel</button>
                </div>
            `;
            document.body.appendChild(dialog);
        }

        const messageEl = dialog.querySelector('.save-file-confirm-message');
        const okBtn = dialog.querySelector('.confirm-ok');
        const cancelBtn = dialog.querySelector('.cancel');

        messageEl.textContent = message;
        dialog.style.display = 'flex';

        const handleOk = () => {
            dialog.style.display = 'none';
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            resolve(true);
        };
        const handleCancel = () => {
            dialog.style.display = 'none';
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            resolve(false);
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

/**
 * Shows a temporary popup message.
 * @param {string} message The message to display.
 * @param {boolean} isError True if it's an error message, false for success.
 */
function showPopupMessage(message, isError = false) {
    let popup = document.getElementById('file-manager-global-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'file-manager-global-popup';
        popup.className = 'file-manager-popup';
        document.body.appendChild(popup);
    }
    
    popup.textContent = message;
    popup.classList.remove('error', 'show');
    if (isError) {
        popup.classList.add('error');
    }
    popup.classList.add('show');

    setTimeout(() => {
        popup.classList.remove('show');
    }, 3000);
}

// --- Core Save File Setup Function ---
/**
 * Sets up a save file instance, handling DOM creation and event listeners.
 * @param {HTMLElement|null} originalElement - The original <savefile> element if converting, otherwise null.
 * @returns {HTMLElement} The outermost DOM element representing the save file dialog.
 */
function setupSaveFileInstance(originalElement = null) {
    injectStyles();

    // --- State Variables (Per Instance) ---
    let currentPath = '/';
    let _onSaveHandler = null;
    let _onSaveStreamingHandler = null;
    let _onCancelHandler = null;
    let _contents = ''; // Placeholder for the data to be saved
    let _stream = null; // Placeholder for a stream of data

    const saveFileContainer = document.createElement('div');
    saveFileContainer.className = 'save-file-container';
    saveFileContainer.style.width = '100%';
    saveFileContainer.style.height = '100%';

    let originalId = null;
    let originalClass = null;
    let originalOnSaveAttribute = null;
    let originalOnSaveStreamingAttribute = null;
    let originalOnCancelAttribute = null;
    
    if (originalElement) {
        originalId = originalElement.id;
        originalClass = originalElement.className;
        originalOnSaveAttribute = originalElement.getAttribute('onsave');
        originalOnSaveStreamingAttribute = originalElement.getAttribute('onsavestreaming');
        originalOnCancelAttribute = originalElement.getAttribute('oncancel');

        if (originalId) saveFileContainer.id = originalId;
        if (originalClass) saveFileContainer.className += ` ${originalClass}`;
    }

    const header = document.createElement('div');
    header.className = 'save-file-header';
    header.innerHTML = `
        <span>Save File</span>
        <button class="save-file-close-button" title="Close">✕</button>
    `;
    const closeButton = header.querySelector('.save-file-close-button');
    
    const pathDisplay = document.createElement('div');
    pathDisplay.className = 'save-file-path-display';
    const currentPathSpan = document.createElement('span');
    currentPathSpan.className = 'save-file-current-path';
    currentPathSpan.textContent = `Path: ${currentPath}`;
    pathDisplay.appendChild(currentPathSpan);

    const listContainer = document.createElement('div');
    listContainer.className = 'save-file-list-container';
    const fileListTable = document.createElement('table');
    fileListTable.className = 'save-file-list-table';
    fileListTable.innerHTML = `
        <thead>
            <tr>
                <th>Name</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const fileListTbody = fileListTable.querySelector('tbody');
    listContainer.appendChild(fileListTable);

    const controls = document.createElement('div');
    controls.className = 'save-file-controls';
    controls.innerHTML = `
        <label for="save-file-input">File Name:</label>
        <input type="text" class="save-file-input" id="save-file-input" placeholder="Enter file name...">
        <div class="save-file-buttons">
            <button class="save-button" disabled>Save</button>
            <button class="cancel-button">Cancel</button>
        </div>
    `;

    const fileNameInput = controls.querySelector('.save-file-input');
    const saveButton = controls.querySelector('.save-button');
    const cancelButton = controls.querySelector('.cancel-button');

    saveFileContainer.appendChild(header);
    saveFileContainer.appendChild(pathDisplay);
    saveFileContainer.appendChild(listContainer);
    saveFileContainer.appendChild(controls);

    /** Executes a string-based event handler from an HTML attribute. */
    const executeAttributeHandler = (handlerCode, scope, ...args) => {
        if (!handlerCode) return;
        try {
            const fn = new Function('event', handlerCode);
            fn.apply(scope, args);
        } catch (err) {
            console.error("Error executing attribute handler:", handlerCode, err);
        }
    };

    Object.defineProperty(saveFileContainer, 'onsave', {
        get() { return _onSaveHandler; },
        set(newValue) {
            _onSaveHandler = (typeof newValue === 'function' || newValue === null) ? newValue : null;
        },
        configurable: true
    });

    Object.defineProperty(saveFileContainer, 'onsavestreaming', {
        get() { return _onSaveStreamingHandler; },
        set(newValue) {
            _onSaveStreamingHandler = (typeof newValue === 'function' || newValue === null) ? newValue : null;
        },
        configurable: true
    });

    Object.defineProperty(saveFileContainer, 'oncancel', {
        get() { return _onCancelHandler; },
        set(newValue) {
            _onCancelHandler = (typeof newValue === 'function' || newValue === null) ? newValue : null;
        },
        configurable: true
    });
    
    Object.defineProperty(saveFileContainer, 'contents', {
        get() { return _contents; },
        set(newValue) { _contents = newValue; },
        configurable: true
    });

    Object.defineProperty(saveFileContainer, 'stream', {
        get() { return _stream; },
        set(newValue) { _stream = newValue; },
        configurable: true
    });

    if (originalOnSaveAttribute) {
        saveFileContainer.onsave = (e) => executeAttributeHandler(originalOnSaveAttribute, saveFileContainer, e);
    }
    if (originalOnSaveStreamingAttribute) {
        saveFileContainer.onsavestreaming = (e) => executeAttributeHandler(originalOnSaveStreamingAttribute, saveFileContainer, e);
    }
    if (originalOnCancelAttribute) {
        saveFileContainer.oncancel = (e) => executeAttributeHandler(originalOnCancelAttribute, saveFileContainer, e);
    }

    /**
     * Renders the file list for the current path.
     * @param {string} path The path to list.
     */
    const renderFileList = async (path) => {
        currentPath = path;
        currentPathSpan.textContent = `Path: ${currentPath}`;
        fileListTbody.innerHTML = '';

        try {
            const files = await api.ls(currentPath === '/' ? '*' : `${currentPath.endsWith('/') ? currentPath + '*' : currentPath + '/*'}`);

            if (currentPath !== '/') {
                const upRow = fileListTbody.insertRow();
                upRow.className = 'up-directory-row';
                upRow.innerHTML = `
                    <td class="file-name"><span class="file-icon">⬆️</span> ..</td>
                `;
                upRow.querySelector('.file-name').addEventListener('click', () => {
                    const parentPath = currentPath.split('/').slice(0, -2).join('/') + '/';
                    renderFileList(parentPath === '//' ? '/' : parentPath);
                });
            }

            files.sort((a, b) => {
                if (a.type === 'directory' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });

            files.forEach(file => {
                if (file.type === 'directory' || file.type === 'file') {
                    const row = fileListTbody.insertRow();
                    const icon = file.type === 'directory' ? '📂' : '📄';

                    row.innerHTML = `
                        <td class="file-name"><span class="file-icon">${icon}</span> ${file.name}</td>
                    `;

                    const nameCell = row.querySelector('.file-name');

                    if (file.type === 'file') {
                        nameCell.addEventListener('click', () => {
                            fileNameInput.value = file.name;
                            updateButtonStates();
                        });
                    } else if (file.type === 'directory') {
                         nameCell.addEventListener('click', () => {
                             const newPath = currentPath === '/' ? `/${file.name}/` : `${currentPath}${file.name}/`;
                             renderFileList(newPath);
                         });
                    }
                }
            });
        } catch (error) {
            console.error("Error rendering file list:", error);
            showPopupMessage(`Error: ${error.message || 'Failed to list files.'}`, true);
            fileListTbody.innerHTML = `<tr><td>Error loading files: ${error.message || 'Unknown error'}</td></tr>`;
        }
    };

    /** Updates button states based on input. */
    const updateButtonStates = () => {
        const fileName = fileNameInput.value.trim();
        saveButton.disabled = !fileName;
    };

    /** Handles the save operation. */
    const handleSave = async () => {
        const fileName = fileNameInput.value.trim();
        if (!fileName) {
            showPopupMessage("Please enter a file name.", true);
            return;
        }

        const filePath = currentPath === '/' ? `/${fileName}` : `${currentPath}${fileName}`;

        try {
            const existingFiles = await api.ls(filePath);
            if (existingFiles && existingFiles.length > 0) {
                const confirmOverwrite = await showConfirmDialog(`File '${fileName}' already exists. Do you want to overwrite it?`);
                if (!confirmOverwrite) {
                    showPopupMessage("Save cancelled.", true);
                    return;
                }
            }
        } catch (error) {
            // This is ok, it just means the file doesn't exist.
        }

        try {
            // --- FIXED SECTION: Pass headers with the correct Content-Type ---
            let headers = {};
            if (_contents instanceof Blob || _contents instanceof File) {
                // If the contents is a Blob or File, extract its MIME type
                headers['Content-Type'] = _contents.type;
            }

            if (_stream) {
                await api.saveFile(filePath, _stream, headers);
                showPopupMessage(`File '${fileName}' saved via streaming.`);
            } else {
				alert(_contents);
                await api.saveFile(filePath, _contents, headers);
                showPopupMessage(`File '${fileName}' saved successfully.`);
            }
            // --- END OF FIXED SECTION ---

            // Dispatch a custom 'save' event after the API call is successful
            const saveEvent = new CustomEvent('save', {
                detail: { fileName: filePath, contents: _contents, stream: _stream },
                bubbles: true,
                composed: true
            });
            saveFileContainer.dispatchEvent(saveEvent);

            // Call the user-provided handler if it exists
            if (_onSaveHandler) {
                _onSaveHandler.call(saveFileContainer, saveEvent);
            }
        } catch (error) {
            console.error("Error during file save:", error);
            showPopupMessage(`Error: ${error.message || 'Failed to save file.'}`, true);
        }
    };

    /** Handles the cancel operation. */
    const handleCancel = (e) => {
        if (_onCancelHandler) {
            try {
                _onCancelHandler.call(saveFileContainer, e);
            } catch (err) {
                console.error("Error executing oncancel handler:", err);
            }
        } else if (originalOnCancelAttribute) {
            executeAttributeHandler(originalOnCancelAttribute, saveFileContainer, e);
        }

        saveFileContainer.dispatchEvent(new CustomEvent('cancel', {
            bubbles: true,
            composed: true
        }));
    };
    
    renderFileList(currentPath);
    updateButtonStates();

    fileNameInput.addEventListener('input', updateButtonStates);
    saveButton.addEventListener('click', handleSave);
    cancelButton.addEventListener('click', handleCancel);
    closeButton.addEventListener('click', handleCancel);

    return saveFileContainer;
}

/**
 * Public function to create a new save file dialog programmatically.
 * @returns {HTMLElement} The DOM element representing the save file dialog.
 */
export function createSaveFile() {
    return setupSaveFileInstance();
}

/**
 * Observes the DOM for `<savefile>` elements, converts them, and handles
 * dynamically added elements.
 */
function observeSaveFileElements() {
    document.querySelectorAll('savefile').forEach(saveFileElement => {
        const parentContainer = saveFileElement.parentNode;
        if (parentContainer) {
            const saveFileDom = setupSaveFileInstance(saveFileElement);
            parentContainer.replaceChild(saveFileDom, saveFileElement);
        }
    });

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.tagName === 'SAVEFILE') {
                        const parentContainer = node.parentNode;
                        if (parentContainer) {
                            const saveFileDom = setupSaveFileInstance(node);
                            parentContainer.replaceChild(saveFileDom, node);
                        }
                    } else if (node.nodeType === 1) {
                        node.querySelectorAll('savefile').forEach(saveFileElement => {
                            const parentContainer = saveFileElement.parentNode;
                            if (parentContainer) {
                                const saveFileDom = setupSaveFileInstance(saveFileElement);
                                parentContainer.replaceChild(saveFileDom, saveFileElement);
                            }
                        });
                    }
                });
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

document.addEventListener('DOMContentLoaded', () => {
    observeSaveFileElements();
});


