// ./ux/fileManager.js

import { api } from '../js/apiCalls.js'; // Assuming apiCalls.js is in the same directory

// --- Constants ---
const LINE_HEIGHT_EM = 1.5; // Consistent line height for alignment
const HISTORY_DEBOUNCE_TIME = 300; // Milliseconds to wait before saving history state

// --- Module-level Variables ---
let stylesInjected = false; // Flag to ensure styles are injected only once

// --- Dynamic Style Injection ---
/**
 * Injects necessary CSS styles for the file manager into the document head.
 * Ensures styles are injected only once.
 */
function injectStyles() {
    if (stylesInjected) return;

    const style = document.createElement('style');
    style.id = 'file-manager-styles';
    style.textContent = `
        /* Main container for the file manager */
        .file-manager-container-wrapper {
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
        }

        /* Corrected: Title Bar Styles to show the end of the title, with ellipsis at the start */
        .file-manager-title-bar {
            background-color: #333; /* Dark background for title */
            color: #fff;
            padding: 4px 8px; /* Padding here */
            font-weight: bold;
            flex-shrink: 0;
            overflow: hidden; /* Ensure text doesn't spill out */
            white-space: nowrap; /* Prevent text wrapping */
            display: none; /* Hidden by default if no title is set. Will be set to 'flex' by JS. */

            /* Essential for showing the end of the title with truncation at the start */
            text-overflow: ellipsis; /* This applies the ellipsis to the container */
            direction: rtl; /* Sets the base writing direction to Right-To-Left for the container */
        }
        .file-manager-title-bar span {
            /* This span holds the actual text and its direction is reset */
            display: inline-block; /* Or block, but inline-block is robust */
            direction: ltr; /* Resets text direction to Left-To-Right within the span */
            white-space: nowrap; /* Keep text on a single line */
            /* No overflow or text-overflow here, as the parent handles truncation */
        }


        /* Menu bar similar to textCode.js */
        .file-manager-menu-bar {
            width: 100%;
            border-collapse: collapse;
            background-color: #f8f8f8;
            border-bottom: 1px solid #eee;
            flex-shrink: 0;
            display: table; /* To make TD behave correctly */
            table-layout: fixed; /* Distribute columns evenly */
        }

        .file-manager-menu-bar tr {
            display: table-row;
        }

        .file-manager-menu-bar td {
            border: 1px solid #ddd;
            text-align: center;
            vertical-align: middle;
            padding: 0;
            display: table-cell;
        }

        .file-manager-menu-bar button {
            background-color: transparent;
            border: none;
            color: #555;
            padding: 0 6px;
            margin: 0;
            cursor: pointer;
            border-radius: 0;
            font-size: 1em;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s, border-color 0.2s;
            line-height: 1;
            height: 24px;
            box-sizing: border-box;
            width: 100%;
        }

        .file-manager-menu-bar button:hover:not(:disabled) {
            background-color: #e0e0e0;
            border-color: #ccc;
        }

        .file-manager-menu-bar button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Path display and refresh button */
        .file-manager-path-display {
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
        .file-manager-current-path {
            flex-grow: 1;
            text-overflow: ellipsis;
            white-space: nowrap;
            overflow: hidden;
            padding-right: 5px;
        }
        .file-manager-refresh-button {
            background-color: transparent;
            border: none;
            color: #555;
            cursor: pointer;
            font-size: 1em;
            padding: 0 5px;
            height: 100%;
            display: flex;
            align-items: center;
        }
        .file-manager-refresh-button:hover {
            background-color: #e0e0e0;
        }

        /* File list area */
        .file-manager-list-container {
            flex-grow: 1;
            overflow-y: auto;
            background-color: #ffffff;
            color: #000000;
        }

        .file-manager-list-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }

        .file-manager-list-table th,
        .file-manager-list-table td {
            padding: 4px 8px;
            text-align: left;
            border-bottom: 1px solid #eee;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .file-manager-list-table th {
            background-color: #f0f0f0;
            font-weight: bold;
            color: #333;
            position: sticky;
            top: 0;
            z-index: 1;
        }

        .file-manager-list-table tr:hover {
            background-color: #f5f5f5;
        }

        .file-manager-list-table td:nth-child(1) { width: 30px; text-align: center; } /* Icon */
        .file-manager-list-table td:nth-child(2) { width: auto; } /* Name */
        .file-manager-list-table td:nth-child(3) { width: 80px; text-align: right; } /* Size */
        .file-manager-list-table td:nth-child(4) { width: 40px; text-align: center; } /* Checkbox */

        .file-manager-list-table .file-name,
        .file-manager-list-table .up-directory {
            cursor: pointer;
            color: #007bff;
            text-decoration: none;
        }

        .file-manager-list-table .file-name:hover,
        .file-manager-list-table .up-directory:hover {
            text-decoration: underline;
        }

        .file-manager-list-table .file-icon {
            font-size: 1.1em;
            vertical-align: middle;
        }

        .file-manager-list-table .file-checkbox {
            margin: 0;
            vertical-align: middle;
        }

        /* Popup Message Styles */
        .file-manager-popup {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #4CAF50; /* Green for success */
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 1000;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease-in-out, visibility 0.3s ease-in-out;
        }

        .file-manager-popup.show {
            opacity: 1;
            visibility: visible;
        }

        .file-manager-popup.error {
            background-color: #f44336; /* Red for error */
        }

        /* Confirmation Dialog Styles */
        .file-manager-confirm-dialog {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #fff;
            border: 1px solid #ccc;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            z-index: 1001; /* Above popup */
            display: none; /* Hidden by default */
            flex-direction: column;
            gap: 15px;
            min-width: 280px;
            max-width: 90%;
        }

        .file-manager-confirm-dialog p {
            margin: 0;
            font-size: 1.1em;
            color: #333;
            text-align: center;
        }

        .file-manager-confirm-dialog-buttons {
            display: flex;
            justify-content: center;
            gap: 10px;
        }

        .file-manager-confirm-dialog-buttons button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
            font-size: 1em;
            min-width: 80px;
        }

        .file-manager-confirm-dialog-buttons button.cancel {
            background-color: #6c757d;
        }

        .file-manager-confirm-dialog-buttons button:hover {
            background-color: #0056b3;
        }

        .file-manager-confirm-dialog-buttons button.cancel:hover {
            background-color: #5a6268;
        }

        /* Prompt Dialog Styles */
        .file-manager-prompt-dialog {
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

        .file-manager-prompt-dialog p {
            margin: 0;
            font-size: 1.1em;
            color: #333;
            text-align: center;
        }

        .file-manager-prompt-dialog input[type="text"] {
            width: calc(100% - 16px); /* Adjust for padding */
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1em;
            box-sizing: border-box;
        }

        .file-manager-prompt-dialog-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }

        .file-manager-prompt-dialog-buttons button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
            font-size: 1em;
        }

        .file-manager-prompt-dialog-buttons button.cancel {
            background-color: #6c757d;
        }

        .file-manager-prompt-dialog-buttons button:hover {
            background-color: #0056b3;
        }

        .file-manager-prompt-dialog-buttons button.cancel:hover {
            background-color: #5a6268;
        }
    `;
    document.head.appendChild(style);
    stylesInjected = true;
}

// --- Helper Functions ---

/**
 * Formats file size into a human-readable string.
 * @param {number} bytes The size in bytes.
 * @returns {string} Human-readable size.
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
    popup.classList.remove('error', 'show'); // Reset classes
    if (isError) {
        popup.classList.add('error');
    }
    popup.classList.add('show');

    setTimeout(() => {
        popup.classList.remove('show');
    }, 3000); // Hide after 3 seconds
}

/**
 * Shows a confirmation dialog.
 * @param {string} message The confirmation message.
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if canceled.
 */
function showConfirmDialog(message) {
    return new Promise(resolve => {
        let dialog = document.getElementById('file-manager-global-confirm-dialog');
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'file-manager-global-confirm-dialog';
            dialog.className = 'file-manager-confirm-dialog';
            dialog.innerHTML = `
                <p class="file-manager-confirm-message"></p>
                <div class="file-manager-confirm-dialog-buttons">
                    <button class="confirm-ok">OK</button>
                    <button class="cancel">Cancel</button>
                </div>
            `;
            document.body.appendChild(dialog);
        }

        const messageEl = dialog.querySelector('.file-manager-confirm-message');
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
 * Shows a prompt dialog for text input.
 * @param {string} message The prompt message.
 * @param {string} defaultValue The default value for the input.
 * @returns {Promise<string|null>} Resolves to the input string if OK, null if canceled.
 */
function showPromptDialog(message, defaultValue = '') {
    return new Promise(resolve => {
        let dialog = document.getElementById('file-manager-global-prompt-dialog');
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'file-manager-global-prompt-dialog';
            dialog.className = 'file-manager-prompt-dialog';
            dialog.innerHTML = `
                <p class="file-manager-prompt-message"></p>
                <input type="text" class="file-manager-prompt-input" />
                <div class="file-manager-prompt-dialog-buttons">
                    <button class="prompt-ok">OK</button>
                    <button class="cancel">Cancel</button>
                </div>
            `;
            document.body.appendChild(dialog);
        }

        const messageEl = dialog.querySelector('.file-manager-prompt-message');
        const inputEl = dialog.querySelector('.file-manager-prompt-input');
        const okBtn = dialog.querySelector('.prompt-ok');
        const cancelBtn = dialog.querySelector('.cancel');

        messageEl.textContent = message;
        inputEl.value = defaultValue;
        dialog.style.display = 'flex';
        inputEl.focus();
        inputEl.select(); // Select the default value

        const cleanup = () => {
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            inputEl.removeEventListener('keydown', handleKeyDown);
            dialog.style.display = 'none';
        };

        const handleOk = () => {
            cleanup();
            resolve(inputEl.value);
        };
        const handleCancel = () => {
            cleanup();
            resolve(null);
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        inputEl.addEventListener('keydown', handleKeyDown);
    });
}


// --- Core File Manager Setup Function ---

/**
 * Sets up a file manager instance, handling DOM creation, event listeners,
 * and property emulation.
 * @param {HTMLElement|null} originalElement - The original <filemanager> element if converting, otherwise null.
 * @returns {HTMLElement} The outermost DOM element representing the file manager.
 */
function setupFileManagerInstance(originalElement = null) {
    injectStyles(); // Ensure styles are present

    // --- State Variables (Per Instance) ---
    let currentPath = '/';
    let clipboard = { type: null, paths: [] }; // { type: 'copy' | 'cut', paths: ['/path/to/file1', ...] }
    let _onOpenHandler = null; // Internal reference for onopen
    let _onCloseHandler = null; // Internal reference for onclose
    let _title = undefined; // Internal reference for the new 'title' property

    // --- Create DOM Elements ---
    const managerContainerWrapper = document.createElement('div');
    managerContainerWrapper.className = 'file-manager-container-wrapper';
    managerContainerWrapper.style.width = '100%';
    managerContainerWrapper.style.height = '100%';

    // Store original attributes from <filemanager> for emulation
    let originalId = null;
    let originalClass = null;
    let originalOnOpenAttribute = null;
    let originalOnCloseAttribute = null;
    let originalTitleAttribute = null; // Store original title attribute

    if (originalElement) {
        originalId = originalElement.id;
        originalClass = originalElement.className;
        originalOnOpenAttribute = originalElement.getAttribute('onopen');
        originalOnCloseAttribute = originalElement.getAttribute('onclose');
        originalTitleAttribute = originalElement.getAttribute('title'); // Get title attribute

        // Apply ID and Class attributes to the outermost container
        if (originalId) {
            managerContainerWrapper.id = originalId;
        }
        if (originalClass) {
            managerContainerWrapper.className += ` ${originalClass}`; // Append existing classes
        }
    }

    // New: Title Bar
    const titleBarEl = document.createElement('div');
    titleBarEl.className = 'file-manager-title-bar';
    const titleTextEl = document.createElement('span');
    titleBarEl.appendChild(titleTextEl);
    // Initially hide the title bar; visibility will be controlled by the 'title' setter
    titleBarEl.style.display = 'none'; // This will be overridden by the flex display when shown by JS.

    // Menu Bar
    const menuBar = document.createElement('table');
    menuBar.className = 'file-manager-menu-bar';
    const menuBarBody = document.createElement('tbody');
    const menuBarRow = document.createElement('tr');

    // Create File Button
    const createButton = document.createElement('button');
    createButton.innerHTML = '➕📄'; // Plus Sign and Page with Curl
    createButton.title = 'Create New File';
    const createCell = document.createElement('td');
    createCell.appendChild(createButton);
    menuBarRow.appendChild(createCell);

    // Create Directory Button
    const createDirectoryButton = document.createElement('button');
    createDirectoryButton.innerHTML = '➕📁'; // Plus Sign and Folder
    createDirectoryButton.title = 'Create New Directory';
    const createDirectoryCell = document.createElement('td');
    createDirectoryCell.appendChild(createDirectoryButton);
    menuBarRow.appendChild(createDirectoryCell);

    const copyButton = document.createElement('button');
    copyButton.innerHTML = '📋'; // Clipboard icon
    copyButton.title = 'Copy Selected';
    copyButton.disabled = true; // Initially disabled
    const copyCell = document.createElement('td');
    copyCell.appendChild(copyButton);
    menuBarRow.appendChild(copyCell);

    const cutButton = document.createElement('button');
    cutButton.innerHTML = '✂️'; // Scissors icon
    cutButton.title = 'Cut Selected';
    cutButton.disabled = true; // Initially disabled
    const cutCell = document.createElement('td');
    cutCell.appendChild(cutButton);
    menuBarRow.appendChild(cutCell);

    const pasteButton = document.createElement('button');
    pasteButton.innerHTML = '📌'; // Pushpin icon (commonly used for paste)
    pasteButton.title = 'Paste';
    pasteButton.disabled = true; // Initially disabled, will be updated by updateButtonStates
    const pasteCell = document.createElement('td');
    pasteCell.appendChild(pasteButton);
    menuBarRow.appendChild(pasteCell);

    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '🗑️'; // Trash can icon
    deleteButton.title = 'Delete Selected';
    deleteButton.disabled = true; // Initially disabled
    const deleteCell = document.createElement('td');
    deleteCell.appendChild(deleteButton);
    menuBarRow.appendChild(deleteCell);

    // Close Button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕'; // Multiplication X icon (commonly used for close)
    closeButton.title = 'Close File Manager';
    const closeCell = document.createElement('td');
    closeCell.appendChild(closeButton);
    menuBarRow.appendChild(closeCell);
    // Initially hide or show based on initial onclose attribute
    closeCell.style.display = originalOnCloseAttribute ? '' : 'none';


    menuBarBody.appendChild(menuBarRow);
    menuBar.appendChild(menuBarBody);

    // Path Display
    const pathDisplay = document.createElement('div');
    pathDisplay.className = 'file-manager-path-display';
    const currentPathSpan = document.createElement('span');
    currentPathSpan.className = 'file-manager-current-path';
    currentPathSpan.textContent = `Path: ${currentPath}`;
    const refreshButton = document.createElement('button');
    refreshButton.className = 'file-manager-refresh-button';
    refreshButton.innerHTML = '🔄'; // Refresh icon
    refreshButton.title = 'Refresh';

    pathDisplay.appendChild(currentPathSpan);
    pathDisplay.appendChild(refreshButton);

    // File List Area
    const listContainer = document.createElement('div');
    listContainer.className = 'file-manager-list-container';
    const fileListTable = document.createElement('table');
    fileListTable.className = 'file-manager-list-table';
    fileListTable.innerHTML = `
        <thead>
            <tr>
                <th></th>
                <th>Name</th>
                <th>Size</th>
                <th><input type="checkbox" class="file-manager-select-all-checkbox" title="Select All"></th>
            </tr>
        </thead>
        <tbody>
            </tbody>
    `;
    const fileListTbody = fileListTable.querySelector('tbody');
    const selectAllCheckbox = fileListTable.querySelector('.file-manager-select-all-checkbox');


    listContainer.appendChild(fileListTable);

    // Append elements to construct the file manager DOM
    managerContainerWrapper.appendChild(titleBarEl); // Add title bar first
    managerContainerWrapper.appendChild(menuBar);
    managerContainerWrapper.appendChild(pathDisplay);
    managerContainerWrapper.appendChild(listContainer);

    /** Executes a string-based event handler from an HTML attribute. */
    const executeAttributeHandler = (handlerCode, scope, ...args) => {
        if (!handlerCode) return;
        try {
            const fn = new Function('event', 'fileInfo', handlerCode);
            fn.apply(scope, args);
        } catch (err) {
            console.error("Error executing attribute handler:", handlerCode, err);
        }
    };

    // --- Emulate 'onopen' property ---
    Object.defineProperty(managerContainerWrapper, 'onopen', {
        get() { return _onOpenHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onOpenHandler = newValue;
            } else {
                console.warn("Attempted to set onopen to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // Emulate 'onclose' property
    Object.defineProperty(managerContainerWrapper, 'onclose', {
        get() { return _onCloseHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onCloseHandler = newValue;
                // Update visibility of the close button based on whether a handler is set
                closeCell.style.display = newValue ? '' : 'none';
            } else {
                console.warn("Attempted to set onclose to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // New: Emulate 'title' property
    Object.defineProperty(managerContainerWrapper, 'title', {
        get() { return _title; },
        set(newValue) {
            _title = newValue;
            if (newValue && String(newValue).trim() !== '') {
                titleTextEl.textContent = newValue;
                // The CSS sets display:flex, so we just control overall visibility
                titleBarEl.style.display = 'flex'; // Show the title bar
            } else {
                titleTextEl.textContent = '';
                titleBarEl.style.display = 'none'; // Hide the title bar
            }
        },
        configurable: true
    });


    // Initialize onopen/onclose/title handlers from attributes if present
    if (originalOnOpenAttribute) {
        managerContainerWrapper.onopen = (e, fileInfo) => executeAttributeHandler(originalOnOpenAttribute, managerContainerWrapper, e, fileInfo);
    }
    if (originalOnCloseAttribute) {
        managerContainerWrapper.onclose = (e) => executeAttributeHandler(originalOnCloseAttribute, managerContainerWrapper, e);
    }
    if (originalTitleAttribute !== null) { // Check for null as an empty string is a valid title
        managerContainerWrapper.title = originalTitleAttribute;
    }


    // --- Core File Manager Functions ---

    /** Updates button states based on selection and clipboard. */
    const updateButtonStates = () => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const hasSelection = selectedCheckboxes.length > 0;

        copyButton.disabled = !hasSelection;
        cutButton.disabled = !hasSelection;
        deleteButton.disabled = !hasSelection;
        // Paste button is enabled if clipboard has items, regardless of current selection
        pasteButton.disabled = clipboard.type === null || clipboard.paths.length === 0;

        // "Select All" checkbox state
        const allCheckboxes = fileListTbody.querySelectorAll('.file-checkbox');
        const allFileCheckboxes = Array.from(allCheckboxes).filter(cb => !cb.closest('.up-directory-row')); // Exclude ".." checkbox
        selectAllCheckbox.checked = allFileCheckboxes.length > 0 && selectedCheckboxes.length === allFileCheckboxes.length;
        selectAllCheckbox.indeterminate = selectedCheckboxes.length > 0 && selectedCheckboxes.length < allFileCheckboxes.length;
    };

    /**
     * Renders the file list for the current path.
     * @param {string} path The path to list.
     */
    const renderFileList = async (path) => {
        currentPath = path;
        currentPathSpan.textContent = `Path: ${currentPath}`;
        fileListTbody.innerHTML = ''; // Clear existing list
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;


        try {
            const files = await api.ls(currentPath === '/' ? '*' : `${currentPath.endsWith('/') ? currentPath + '*' : currentPath + '/*'}`);

            // Add "Go Up" directory if not at root
            if (currentPath !== '/') {
                const upRow = fileListTbody.insertRow();
                upRow.className = 'up-directory-row';
                upRow.innerHTML = `
                    <td>⬆️</td>
                    <td class="file-name up-directory">..</td>
                    <td></td>
                    <td><input type="checkbox" class="file-checkbox" disabled></td>
                `;
                upRow.querySelector('.file-name').addEventListener('click', () => {
                    const parentPath = currentPath.split('/').slice(0, -2).join('/') + '/';
                    renderFileList(parentPath === '//' ? '/' : parentPath); // Handle root case
                });
            }

            // Sort directories first, then files, both alphabetically
            files.sort((a, b) => {
                if (a.type === 'directory' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });


            files.forEach(file => {
                const row = fileListTbody.insertRow();
                const icon = file.type === 'directory' ? '📂' : '📄';
                const size = file.type === 'file' ? formatBytes(file.size) : '';

                row.innerHTML = `
                    <td class="file-icon">${icon}</td>
                    <td class="file-name">${file.name}</td>
                    <td>${size}</td>
                    <td><input type="checkbox" class="file-checkbox" data-path="${file.name}"></td>
                `;

                const nameCell = row.querySelector('.file-name');
                const checkbox = row.querySelector('.file-checkbox');

                if (file.type === 'directory') {
                    nameCell.addEventListener('click', () => {
                        const newPath = currentPath === '/' ? `/${file.name}/` : `${currentPath}${file.name}/`;
                        renderFileList(newPath);
                    });
                } else {
                    nameCell.addEventListener('click', async (e) => {
                        const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}${file.name}`;
                        // Call dynamically set onopen handler
                        if (_onOpenHandler) {
                            try {
                                // Add full path to file info for convenience
                                const fileInfoWithFullPath = { ...file, fullPath: filePath };
                                await _onOpenHandler.call(managerContainerWrapper, e, fileInfoWithFullPath);
                            } catch (err) {
                                console.error("Error executing programmatic onopen handler:", err);
                            }
                        }
                        // Call original onopen handler from HTML attribute (if not already handled by programmatic one)
                        if (!_onOpenHandler && originalOnOpenAttribute) { // Only call if no programmatic handler set
                             executeAttributeHandler(originalOnOpenAttribute, managerContainerWrapper, e, { ...file, fullPath: filePath });
                        }

                        // Dispatch a custom 'open' event on the outermost container
                        managerContainerWrapper.dispatchEvent(new CustomEvent('open', {
                            detail: { fileInfo: { ...file, fullPath: filePath } },
                            bubbles: true,
                            composed: true
                        }));
                    });
                }

                checkbox.addEventListener('change', updateButtonStates);
            });
            updateButtonStates(); // Update after rendering new list
        } catch (error) {
            console.error("Error rendering file list:", error);
            showPopupMessage(`Error: ${error.message || 'Failed to list files.'}`, true);
            fileListTbody.innerHTML = `<tr><td colspan="4">Error loading files: ${error.message || 'Unknown error'}</td></tr>`;
        }
    };

    /** Gets selected file/directory paths. */
    const getSelectedPaths = () => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        return Array.from(selectedCheckboxes)
            .map(cb => cb.dataset.path)
            .filter(name => name); // Filter out any empty names
    };

    /** Handles creating a new empty file. */
    const handleCreateFile = async () => {
        const fileName = await showPromptDialog('Enter new file name:');
        if (fileName === null) { // User cancelled
            showPopupMessage("File creation cancelled.", true);
            return;
        }
        if (!fileName.trim()) {
            showPopupMessage("File name cannot be empty.", true);
            return;
        }

        const fullPath = currentPath === '/' ? `/${fileName}` : `${currentPath}${fileName}`;
        try {
            await api.saveFile(fullPath, ''); // Save an empty string
            showPopupMessage(`File '${fileName}' created successfully.`);
            renderFileList(currentPath); // Refresh the list
        } catch (error) {
            console.error("Error creating file:", error);
            showPopupMessage(`Failed to create file '${fileName}': ${error.message}`, true);
        }
    };

    /** Handles creating a new directory. */
    const handleCreateDirectory = async () => {
        const dirName = await showPromptDialog('Enter new directory name:');
        if (dirName === null) { // User cancelled
            showPopupMessage("Directory creation cancelled.", true);
            return;
        }
        if (!dirName.trim()) {
            showPopupMessage("Directory name cannot be empty.", true);
            return;
        }

        // Ensure the directory path ends with a slash for mkPath
        const fullPath = currentPath === '/' ? `/${dirName}/` : `${currentPath}${dirName}/`;
        try {
            await api.mkPath(fullPath);
            showPopupMessage(`Directory '${dirName}' created successfully.`);
            renderFileList(currentPath); // Refresh the list
        } catch (error) {
            console.error("Error creating directory:", error);
            showPopupMessage(`Failed to create directory '${dirName}': ${error.message}`, true);
        }
    };


    /** Performs a copy operation. */
    const handleCopy = () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showPopupMessage("No items selected to copy.", true);
            return;
        }
        clipboard.type = 'copy';
        clipboard.paths = selected.map(name => currentPath === '/' ? `/${name}` : `${currentPath}${name}`);
        showPopupMessage(`Copied ${selected.length} item(s) to clipboard.`);
        updateButtonStates(); // Update to enable paste
    };

    /** Performs a cut operation. */
    const handleCut = () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showPopupMessage("No items selected to cut.", true);
            return;
        }
        clipboard.type = 'cut';
        clipboard.paths = selected.map(name => currentPath === '/' ? `/${name}` : `${currentPath}${name}`);
        showPopupMessage(`Cut ${selected.length} item(s) to clipboard.`);
        updateButtonStates(); // Update to enable paste
    };

    /** Performs a paste operation. */
    const handlePaste = async () => {
        if (clipboard.type === null || clipboard.paths.length === 0) {
            showPopupMessage("Clipboard is empty.", true);
            return;
        }

        const destination = currentPath.endsWith('/') ? currentPath : currentPath + '/';
        let successCount = 0;
        let failCount = 0;

        for (const sourcePath of clipboard.paths) {
            try {
                if (clipboard.type === 'copy') {
                    await api.copy(sourcePath, destination);
                    showPopupMessage(`Copied ${sourcePath.split('/').pop()} to ${destination}`);
                } else if (clipboard.type === 'cut') {
                    await api.mv(sourcePath, destination);
                    showPopupMessage(`Moved ${sourcePath.split('/').pop()} to ${destination}`);
                }
                successCount++;
            } catch (error) {
                console.error(`Error during paste operation for ${sourcePath}:`, error);
                showPopupMessage(`Failed to ${clipboard.type} ${sourcePath.split('/').pop()}: ${error.message}`, true);
                failCount++;
            }
        }

        if (successCount > 0) {
            showPopupMessage(`${successCount} item(s) ${clipboard.type}ed successfully.`);
        }
        if (failCount > 0) {
            showPopupMessage(`${failCount} item(s) failed to ${clipboard.type}.`, true);
        }

        // Clear clipboard after cut, not after copy
        if (clipboard.type === 'cut') {
            clipboard = { type: null, paths: [] };
        }
        renderFileList(currentPath); // Refresh the view
        updateButtonStates();
    };

    /** Performs a delete operation. */
    const handleDelete = async () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showPopupMessage("No items selected to delete.", true);
            return;
        }

        const message = currentPath.startsWith('/trash/')
            ? `Are you sure you want to permanently delete ${selected.length} selected item(s)? This action cannot be undone.`
            : `Are you sure you want to move ${selected.length} selected item(s) to /trash?`;

        const confirm = await showConfirmDialog(message);
        if (!confirm) {
            showPopupMessage("Deletion cancelled.", true);
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const name of selected) {
            const fullPath = currentPath === '/' ? `/${name}` : `${currentPath}${name}`;
            try {
                // If in /trash, delete permanently, otherwise move to trash
                if (currentPath.startsWith('/trash/')) {
                    await api.del(fullPath);
                } else {
                    await api.mv(fullPath, '/trash/');
                }
                successCount++;
            } catch (error) {
                console.error(`Error deleting/moving ${fullPath}:`, error);
                showPopupMessage(`Failed to delete/move ${name}: ${error.message}`, true);
                failCount++;
            }
            }

        if (successCount > 0) {
            showPopupMessage(`${successCount} item(s) ${currentPath.startsWith('/trash/') ? 'deleted permanently' : 'moved to trash'} successfully.`);
        }
        if (failCount > 0) {
            showPopupMessage(`${failCount} item(s) failed to delete/move.`, true);
        }

        renderFileList(currentPath); // Refresh the view
        updateButtonStates();
    };

    // Handle Close operation
    const handleClose = (e) => {
        // Call dynamically set onclose handler
        if (_onCloseHandler) {
            try {
                _onCloseHandler.call(managerContainerWrapper, e);
            } catch (err) {
                console.error("Error executing programmatic onclose handler:", err);
            }
        }
        // Call original onclose handler from HTML attribute (if not already handled by programmatic one)
        if (!_onCloseHandler && originalOnCloseAttribute) { // Only call if no programmatic handler set
            executeAttributeHandler(originalOnCloseAttribute, managerContainerWrapper, e);
        }

        // Dispatch a custom 'close' event on the outermost container
        managerContainerWrapper.dispatchEvent(new CustomEvent('close', {
            bubbles: true,
            composed: true
        }));
    };


    // --- Event Listeners ---

    // Initial render
    renderFileList(currentPath);
    updateButtonStates(); // Set initial button states

    // Menu button handlers
    createButton.addEventListener('click', handleCreateFile);
    createDirectoryButton.addEventListener('click', handleCreateDirectory);
    copyButton.addEventListener('click', handleCopy);
    cutButton.addEventListener('click', handleCut);
    pasteButton.addEventListener('click', handlePaste);
    deleteButton.addEventListener('click', handleDelete);
    refreshButton.addEventListener('click', () => renderFileList(currentPath));
    closeButton.addEventListener('click', handleClose);


    // Select All checkbox
    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const checkboxes = fileListTbody.querySelectorAll('.file-checkbox');
        checkboxes.forEach(cb => {
            if (!cb.disabled) { // Don't change disabled checkboxes (like ".." up directory)
                cb.checked = isChecked;
            }
        });
        updateButtonStates();
    });

    // Event delegation for individual file checkboxes to also trigger updateButtonStates
    fileListTbody.addEventListener('change', (e) => {
        if (e.target.classList.contains('file-checkbox')) {
            updateButtonStates();
        }
    });


    return managerContainerWrapper;
}

/**
 * Public function to create a new file manager programmatically.
 * @returns {HTMLElement} The DOM element representing the file manager.
 */
export function createFileManager() {
    return setupFileManagerInstance();
}

// --- DOM Observation for <filemanager> tags ---

/**
 * Observes the DOM for `<filemanager>` elements, converts them into
 * enhanced file managers, and handles dynamically added elements.
 */
function observeFileManagerElements() {
    // Initial scan for existing <filemanager> elements on page load
    document.querySelectorAll('filemanager').forEach(filemanagerElement => {
        const parentContainer = filemanagerElement.parentNode;
        if (parentContainer) {
            const managerDom = setupFileManagerInstance(filemanagerElement);
            parentContainer.replaceChild(managerDom, filemanagerElement);
        } else {
            console.warn("Found <filemanager> element without a parent, cannot convert:", filemanagerElement);
        }
    });

    // MutationObserver to detect dynamically added <filemanager> elements
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    // Check if the added node itself is a <filemanager>
                    if (node.nodeType === 1 && node.tagName === 'FILEMANAGER') {
                        const parentContainer = node.parentNode;
                        if (parentContainer) {
                            const managerDom = setupFileManagerInstance(node);
                            parentContainer.replaceChild(managerDom, node);
                        }
                    } else if (node.nodeType === 1) {
                        // Check for <filemanager> elements within added subtrees
                        node.querySelectorAll('filemanager').forEach(filemanagerElement => {
                            const parentContainer = filemanagerElement.parentNode;
                            if (parentContainer) {
                                const managerDom = setupFileManagerInstance(filemanagerElement);
                                parentContainer.replaceChild(managerDom, filemanagerElement);
                            }
                        });
                    }
                });
            }
        });
    });

    // Start observing the document body for child list changes (additions/removals)
    // and subtree changes (important for deeply nested additions)
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// --- Initialize on DOMContentLoaded ---
// Ensures the DOM is fully loaded before trying to find and replace elements
document.addEventListener('DOMContentLoaded', () => {
    observeFileManagerElements();
});




