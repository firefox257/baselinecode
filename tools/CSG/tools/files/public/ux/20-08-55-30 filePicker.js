


// ./ux/filePicker.js

import { api } from '../js/apiCalls.js';

// --- Constants ---
const LINE_HEIGHT_EM = 1.5;
const HISTORY_DEBOUNCE_TIME = 300;

// --- Module-level Variables ---
let stylesInjected = false;

// --- Dynamic Style Injection ---
/**
 * Injects necessary CSS styles for the file picker into the document head.
 * Ensures styles are injected only once.
 */
function injectStyles() {
    if (stylesInjected) return;

    const style = document.createElement('style');
    style.id = 'file-picker-styles';
    style.textContent = `
        /* Main container for the file picker */
        .file-picker-container-wrapper {
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

        /* Title Bar Styles to show the full path */
        .file-picker-title-bar {
            background-color: #333; /* Dark background for title */
            color: #fff;
            padding: 4px 8px; /* Padding here */
            font-weight: bold;
            flex-shrink: 0;
            overflow: hidden; /* Ensure text doesn't spill out */
            white-space: nowrap; /* Prevent text wrapping */
            display: flex; /* Always show the title bar */
            align-items: center;
            justify-content: flex-end; /* Align title text to the right */
        }
        .file-picker-title-bar span {
            text-overflow: ellipsis; /* Applies ellipsis to the start of the text */
            overflow: hidden;
            white-space: nowrap;
        }

        /* Menu bar similar to fileManager.js */
        .file-picker-menu-bar {
            width: 100%;
            border-collapse: collapse;
            background-color: #f8f8f8;
            border-bottom: 1px solid #eee;
            flex-shrink: 0;
            display: table; /* To make TD behave correctly */
            table-layout: fixed; /* Distribute columns evenly */
        }

        .file-picker-menu-bar tr {
            display: table-row;
        }

        .file-picker-menu-bar td {
            border: 1px solid #ddd;
            text-align: center;
            vertical-align: middle;
            padding: 0;
            display: table-cell;
        }

        .file-picker-menu-bar button {
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

        .file-picker-menu-bar button:hover:not(:disabled) {
            background-color: #e0e0e0;
            border-color: #ccc;
        }

        .file-picker-menu-bar button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Path display and refresh button */
        .file-picker-path-display {
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
        .file-picker-current-path {
            flex-grow: 1;
            text-overflow: ellipsis;
            white-space: nowrap;
            overflow: hidden;
            padding-right: 5px;
        }
        .file-picker-refresh-button {
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
        .file-picker-refresh-button:hover {
            background-color: #e0e0e0;
        }

        /* File list area */
        .file-picker-list-container {
            flex-grow: 1;
            overflow-y: auto;
            background-color: #ffffff;
            color: #000000;
        }

        .file-picker-list-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }

        .file-picker-list-table th,
        .file-picker-list-table td {
            padding: 4px 8px;
            text-align: left;
            border-bottom: 1px solid #eee;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .file-picker-list-table th {
            background-color: #f0f0f0;
            font-weight: bold;
            color: #333;
            position: sticky;
            top: 0;
            z-index: 1;
        }

        .file-picker-list-table tr:hover {
            background-color: #f5f5f5;
        }

        .file-picker-list-table td:nth-child(1) { width: 30px; text-align: center; } /* Icon */
        .file-picker-list-table td:nth-child(2) { width: auto; } /* Name */
        .file-picker-list-table td:nth-child(3) { width: 80px; text-align: right; } /* Size */
        .file-picker-list-table td:nth-child(4) { width: 40px; text-align: center; } /* Checkbox */

        .file-picker-list-table .file-name,
        .file-picker-list-table .up-directory {
            cursor: pointer;
            color: #007bff;
            text-decoration: none;
        }

        .file-picker-list-table .file-name:hover,
        .file-picker-list-table .up-directory:hover {
            text-decoration: underline;
        }

        .file-picker-list-table .file-icon {
            font-size: 1.1em;
            vertical-align: middle;
        }

        .file-picker-list-table .file-checkbox {
            margin: 0;
            vertical-align: middle;
        }
        
        /* New Wrapper for Modal Dialogs */
        .file-picker-dialog-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5); /* Semi-transparent background */
            display: none; /* Hidden by default */
            align-items: center;
            justify-content: center;
            z-index: 99999999999;
        }

        /* Popup Message Styles */
        .file-picker-popup {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #4CAF50; /* Green for success */
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 99999999999; /* Higher than overlay */
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease-in-out, visibility 0.3s ease-in-out;
        }

        .file-picker-popup.show {
            opacity: 1;
            visibility: visible;
        }

        .file-picker-popup.error {
            background-color: #f44336; /* Red for error */
        }

        /* Confirmation Dialog Styles */
        .file-picker-confirm-dialog {
            background-color: #fff;
            border: 1px solid #ccc;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            z-index: 99999999999; /* Above popup */
            flex-direction: column;
            gap: 15px;
            min-width: 280px;
            max-width: 90%;
        }

        .file-picker-confirm-dialog p {
            margin: 0;
            font-size: 1.1em;
            color: #333;
            text-align: center;
        }

        .file-picker-confirm-dialog-buttons {
            display: flex;
            justify-content: center;
            gap: 10px;
        }

        .file-picker-confirm-dialog-buttons button {
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

        .file-picker-confirm-dialog-buttons button.cancel {
            background-color: #6c757d;
        }

        .file-picker-confirm-dialog-buttons button:hover {
            background-color: #0056b3;
        }

        .file-picker-confirm-dialog-buttons button.cancel:hover {
            background-color: #5a6268;
        }

        /* Prompt Dialog Styles */
        .file-picker-prompt-dialog {
            background-color: #fff;
            border: 1px solid #ccc;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            z-index: 99999999999;
            flex-direction: column;
            gap: 15px;
            min-width: 280px;
            max-width: 90%;
        }

        .file-picker-prompt-dialog p {
            margin: 0;
            font-size: 1.1em;
            color: #333;
            text-align: center;
        }

        .file-picker-prompt-dialog input[type="text"] {
            width: calc(100% - 16px); /* Adjust for padding */
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1em;
            box-sizing: border-box;
        }

        .file-picker-prompt-dialog-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }

        .file-picker-prompt-dialog-buttons button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
            font-size: 1em;
        }

        .file-picker-prompt-dialog-buttons button.cancel {
            background-color: #6c757d;
        }

        .file-picker-prompt-dialog-buttons button:hover {
            background-color: #0056b3;
        }

        .file-picker-prompt-dialog-buttons button.cancel:hover {
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
    let popup = document.getElementById('file-picker-global-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'file-picker-global-popup';
        popup.className = 'file-picker-popup';
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
        let dialog = document.getElementById('file-picker-global-confirm-dialog');
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'file-picker-global-confirm-dialog';
            dialog.className = 'file-picker-confirm-dialog';
            dialog.innerHTML = `
                <p class="file-picker-confirm-message"></p>
                <div class="file-picker-confirm-dialog-buttons">
                    <button class="confirm-ok">OK</button>
                    <button class="cancel">Cancel</button>
                </div>
            `;
        }

        const dialogOverlay = getDialogOverlay(); // Get the single overlay
        dialogOverlay.innerHTML = '';
        dialogOverlay.appendChild(dialog);

        const messageEl = dialog.querySelector('.file-picker-confirm-message');
        const okBtn = dialog.querySelector('.confirm-ok');
        const cancelBtn = dialog.querySelector('.cancel');

        messageEl.textContent = message;
        dialogOverlay.style.display = 'flex';

        const handleOk = () => {
            dialogOverlay.style.display = 'none';
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            resolve(true);
        };
        const handleCancel = () => {
            dialogOverlay.style.display = 'none';
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
        let dialog = document.getElementById('file-picker-global-prompt-dialog');
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'file-picker-global-prompt-dialog';
            dialog.className = 'file-picker-prompt-dialog';
            dialog.innerHTML = `
                <p class="file-picker-prompt-message"></p>
                <input type="text" class="file-picker-prompt-input" />
                <div class="file-picker-prompt-dialog-buttons">
                    <button class="prompt-ok">OK</button>
                    <button class="cancel">Cancel</button>
                </div>
            `;
        }
        
        const dialogOverlay = getDialogOverlay(); // Get the single overlay
        dialogOverlay.innerHTML = '';
        dialogOverlay.appendChild(dialog);

        const messageEl = dialog.querySelector('.file-picker-prompt-message');
        const inputEl = dialog.querySelector('.file-picker-prompt-input');
        const okBtn = dialog.querySelector('.prompt-ok');
        const cancelBtn = dialog.querySelector('.cancel');

        messageEl.textContent = message;
        inputEl.value = defaultValue;
        dialogOverlay.style.display = 'flex';
        inputEl.focus();
        inputEl.select(); // Select the default value

        const cleanup = () => {
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            inputEl.removeEventListener('keydown', handleKeyDown);
            dialogOverlay.style.display = 'none';
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

/**
 * Gets or creates a single, global overlay for all dialogs.
 * This prevents z-index issues and provides a consistent modal experience.
 * @returns {HTMLElement} The dialog overlay element.
 */
function getDialogOverlay() {
    let overlay = document.getElementById('file-picker-dialog-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'file-picker-dialog-overlay';
        overlay.className = 'file-picker-dialog-overlay';
        document.body.appendChild(overlay);
    }
    return overlay;
}


// --- Core File Picker Setup Function ---

/**
 * Sets up a file picker instance, handling DOM creation, event listeners,
 * and property emulation.
 * @param {HTMLElement|null} originalElement - The original <filepicker> element if converting, otherwise null.
 * @returns {HTMLElement} The outermost DOM element representing the file picker.
 */
function setupFilePickerInstance(originalElement = null) {
    injectStyles(); // Ensure styles are present

    // --- State Variables (Per Instance) ---
    let currentPath = '/';
    let clipboard = { type: null, paths: [] }; // { type: 'copy' | 'cut', paths: ['/path/to/file1', ...] }
    let _onFilePickHandler = null; // Internal reference for onFilePick
    let _onCancelHandler = null; // Internal reference for onCancel
    let selectedFilePath = null; // The path of the currently selected file

    // --- Create DOM Elements ---
    const pickerContainerWrapper = document.createElement('div');
    pickerContainerWrapper.className = 'file-picker-container-wrapper';
    pickerContainerWrapper.style.width = '100%';
    pickerContainerWrapper.style.height = '100%';

    // Store original attributes from <filepicker> for emulation
    let originalId = null;
    let originalClass = null;
    let originalOnFilePickAttribute = null;
    let originalOnCancelAttribute = null;
    let originalButtonTextAttribute = null;
    let initialFilePathAttribute = null;


    if (originalElement) {
        originalId = originalElement.id;
        originalClass = originalElement.className;
        originalOnFilePickAttribute = originalElement.getAttribute('onfilepick');
        originalOnCancelAttribute = originalElement.getAttribute('oncancel');
        originalButtonTextAttribute = originalElement.getAttribute('useFileButtonText');
        initialFilePathAttribute = originalElement.getAttribute('file-path');

        // Apply ID and Class attributes to the outermost container
        if (originalId) {
            pickerContainerWrapper.id = originalId;
        }
        if (originalClass) {
            pickerContainerWrapper.className += ` ${originalClass}`; // Append existing classes
        }
    }

    // New: Title Bar
    const titleBarEl = document.createElement('div');
    titleBarEl.className = 'file-picker-title-bar';
    const titleTextEl = document.createElement('span');
    titleBarEl.appendChild(titleTextEl);
    titleTextEl.textContent = 'No file selected'; // Initial text
    
    // Menu Bar
    const menuBar = document.createElement('table');
    menuBar.className = 'file-picker-menu-bar';
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

    // Cancel Button
    const cancelButton = document.createElement('button');
    cancelButton.innerHTML = '✕'; // Multiplication X icon (commonly used for cancel)
    cancelButton.title = 'Cancel';
    const cancelCell = document.createElement('td');
    cancelCell.appendChild(cancelButton);
    menuBarRow.appendChild(cancelCell);
    
    // Use File Path Button (changed to unicode icon)
    const usePathButton = document.createElement('button');
    usePathButton.innerHTML = '✔'; // Check mark unicode icon
    usePathButton.title = 'Use Selected File Path';
    usePathButton.disabled = true; // Initially disabled
    const usePathCell = document.createElement('td');
    usePathCell.appendChild(usePathButton);
    menuBarRow.appendChild(usePathCell);


    menuBarBody.appendChild(menuBarRow);
    menuBar.appendChild(menuBarBody);

    // Path Display
    const pathDisplay = document.createElement('div');
    pathDisplay.className = 'file-picker-path-display';
    const currentPathSpan = document.createElement('span');
    currentPathSpan.className = 'file-picker-current-path';
    currentPathSpan.textContent = `Path: ${currentPath}`;
    const refreshButton = document.createElement('button');
    refreshButton.className = 'file-picker-refresh-button';
    refreshButton.innerHTML = '🔄'; // Refresh icon
    refreshButton.title = 'Refresh';

    pathDisplay.appendChild(currentPathSpan);
    pathDisplay.appendChild(refreshButton);

    // File List Area
    const listContainer = document.createElement('div');
    listContainer.className = 'file-picker-list-container';
    const fileListTable = document.createElement('table');
    fileListTable.className = 'file-picker-list-table';
    fileListTable.innerHTML = `
        <thead>
            <tr>
                <th></th>
                <th>Name</th>
                <th>Size</th>
                <th><input type="checkbox" class="file-picker-select-all-checkbox" title="Select All"></th>
            </tr>
        </thead>
        <tbody>
            </tbody>
    `;
    const fileListTbody = fileListTable.querySelector('tbody');
    const selectAllCheckbox = fileListTable.querySelector('.file-picker-select-all-checkbox');


    listContainer.appendChild(fileListTable);

    // Append elements to construct the file picker DOM
    pickerContainerWrapper.appendChild(titleBarEl); // Add title bar first
    pickerContainerWrapper.appendChild(menuBar);
    pickerContainerWrapper.appendChild(pathDisplay);
    pickerContainerWrapper.appendChild(listContainer);

    /** Executes a string-based event handler from an HTML attribute. */
    const executeAttributeHandler = (handlerCode, scope, ...args) => {
        if (!handlerCode) return;
        try {
            const fn = new Function('event', 'filePath', handlerCode);
            fn.apply(scope, args);
        } catch (err) {
            console.error("Error executing attribute handler:", handlerCode, err);
        }
    };

    // Emulate 'onfilepick' property
    Object.defineProperty(pickerContainerWrapper, 'onfilepick', {
        get() { return _onFilePickHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onFilePickHandler = newValue;
            } else {
                console.warn("Attempted to set onfilepick to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // Emulate 'oncancel' property
    Object.defineProperty(pickerContainerWrapper, 'oncancel', {
        get() { return _onCancelHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onCancelHandler = newValue;
            } else {
                console.warn("Attempted to set oncancel to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // Emulate a 'filePath' property
    Object.defineProperty(pickerContainerWrapper, 'filePath', {
        get() { return selectedFilePath; },
        set(newValue) {
            if (typeof newValue === 'string') {
                // Determine the parent directory and the item name
                const isDirectory = newValue.endsWith('/');
                const normalizedPath = isDirectory ? newValue.slice(0, -1) : newValue;
                const pathParts = normalizedPath.split('/');
                const fileName = pathParts.pop();
                const dirPath = pathParts.join('/') + (pathParts.length > 1 ? '/' : '');

                renderFileList(dirPath || '/').then(() => {
                    let itemToSelect = null;
                    // Find the item in the list after rendering
                    if (isDirectory) {
                        itemToSelect = fileListTbody.querySelector(`.file-name[data-path="${normalizedPath}"]`);
                        if (itemToSelect) {
                            selectedFilePath = normalizedPath;
                            titleTextEl.textContent = normalizedPath;
                            updateButtonStates();
                        }
                    } else {
                        const checkbox = fileListTbody.querySelector(`.file-checkbox[data-path="${normalizedPath}"]`);
                        if (checkbox) {
                            checkbox.checked = true;
                            selectedFilePath = normalizedPath;
                            titleTextEl.textContent = normalizedPath;
                            updateButtonStates();
                        }
                    }
                    if (!itemToSelect) {
                        console.warn(`File or directory '${newValue}' not found.`);
                        selectedFilePath = null;
                        titleTextEl.textContent = 'No file selected';
                        updateButtonStates();
                    }
                });
            } else {
                console.warn("Attempted to set filePath to a non-string value:", newValue);
            }
        },
        configurable: true
    });


    Object.defineProperty(pickerContainerWrapper, 'dom.buttonText', {
        get() { return usePathButton.textContent; },
        set(newValue) {
            if (newValue && typeof newValue === 'string') {
                usePathButton.title = `Use Selected File Path (${newValue})`;
            }
        },
        configurable: true
    });

    // Initialize handlers from attributes if present
    if (originalOnFilePickAttribute) {
        pickerContainerWrapper.onfilepick = (e, filePath) => executeAttributeHandler(originalOnFilePickAttribute, pickerContainerWrapper, e, filePath);
    }
    if (originalOnCancelAttribute) {
        pickerContainerWrapper.oncancel = (e) => executeAttributeHandler(originalOnCancelAttribute, pickerContainerWrapper, e);
    }
    if (originalButtonTextAttribute) {
        pickerContainerWrapper['dom.buttonText'] = originalButtonTextAttribute;
    }


    // --- Core File Picker Functions ---

    /**
     * Updates button states based on selection and clipboard.
     * **FIXED**: The logic for enabling the 'Use File Path' button has been corrected.
     */
    const updateButtonStates = () => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const hasSelection = selectedCheckboxes.length > 0;
        
        copyButton.disabled = !hasSelection;
        cutButton.disabled = !hasSelection;
        deleteButton.disabled = !hasSelection;
        
        pasteButton.disabled = clipboard.type === null || clipboard.paths.length === 0;

        // Use File Path button is ONLY enabled when a single file/directory is selected
        const isSingleItem = selectedCheckboxes.length === 1 || (selectedFilePath && !selectedFilePath.endsWith('/..') && !hasSelection);
        const isGoUpDir = selectedFilePath && selectedFilePath.endsWith('/..');
        usePathButton.disabled = !isSingleItem || isGoUpDir;
        
        // "Select All" checkbox state
        const allCheckboxes = fileListTbody.querySelectorAll('.file-checkbox');
        const allFileCheckboxes = Array.from(allCheckboxes).filter(cb => !cb.closest('.up-directory-row'));
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
        fileListTbody.innerHTML = '';
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;

        // Clear title text and selection state
        selectedFilePath = null;
        titleTextEl.textContent = 'No file selected';


        try {
            const files = await api.ls(currentPath === '/' ? '*' : `${currentPath.endsWith('/') ? currentPath + '*' : currentPath + '/*'}`);

            // Add "Go Up" directory if not at root
            if (currentPath !== '/') {
                const upRow = fileListTbody.insertRow();
                upRow.className = 'up-directory-row';
                const parentPath = currentPath.split('/').slice(0, -2).join('/') + '/';
                const upPath = parentPath === '//' ? '/' : parentPath;
                upRow.innerHTML = `
                    <td>⬆️</td>
                    <td class="file-name up-directory" data-path="${upPath}">..</td>
                    <td></td>
                    <td><input type="checkbox" class="file-checkbox" data-path="${upPath}/.." disabled></td>
                `;
                upRow.querySelector('.file-name').addEventListener('click', () => {
                    renderFileList(upPath);
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
                const fullPath = currentPath === '/' ? `/${file.name}` : `${currentPath}${file.name}`;


                row.innerHTML = `
                    <td class="file-icon">${icon}</td>
                    <td class="file-name" data-path="${fullPath}">${file.name}</td>
                    <td>${size}</td>
                    <td><input type="checkbox" class="file-checkbox" data-path="${fullPath}"></td>
                `;

                const nameCell = row.querySelector('.file-name');
                const checkbox = row.querySelector('.file-checkbox');
                
                row.addEventListener('click', (e) => {
                    if (e.target.type === 'checkbox') {
                        return;
                    }

                    // For files, toggle the checkbox
                    if (file.type === 'file') {
                        checkbox.checked = !checkbox.checked;
                        updateSelectionState(fullPath);
                    } else if (file.type === 'directory') {
                        // For directories, select the directory and then navigate
                        updateSelectionState(fullPath);
                        renderFileList(`${fullPath}/`);
                    }
                });

                // Checkbox change listener
                checkbox.addEventListener('change', () => {
                    updateSelectionState(fullPath);
                });
            });
            updateButtonStates();
        } catch (error) {
            console.error("Error rendering file list:", error);
            showPopupMessage(`Error: ${error.message || 'Failed to list files.'}`, true);
            fileListTbody.innerHTML = `<tr><td colspan="4">Error loading files: ${error.message || 'Unknown error'}</td></tr>`;
        }
    };
    
    /**
     * Updates the UI and state based on the current selection.
     * @param {string} fullPath The full path of the selected file or directory.
     */
    const updateSelectionState = (fullPath) => {
        // Uncheck all other checkboxes to enforce single selection
        const checkboxes = fileListTbody.querySelectorAll('.file-checkbox');
        checkboxes.forEach(cb => {
            if (cb.dataset.path !== fullPath) {
                cb.checked = false;
            }
        });

        const selectedCheckbox = fileListTbody.querySelector(`.file-checkbox[data-path="${fullPath}"]`);
        
        if (selectedCheckbox && selectedCheckbox.checked) {
            selectedFilePath = fullPath;
            titleTextEl.textContent = fullPath;
        } else {
            // Check if the selected path is a directory (by finding its name cell)
            const selectedDirNameEl = fileListTbody.querySelector(`.file-name[data-path="${fullPath}"]`);
            if (selectedDirNameEl) {
                selectedFilePath = fullPath;
                titleTextEl.textContent = fullPath;
            } else {
                selectedFilePath = null;
                titleTextEl.textContent = 'No file selected';
            }
        }
        
        updateButtonStates();
    };


    /** Gets selected file/directory paths. */
    const getSelectedPaths = () => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const paths = Array.from(selectedCheckboxes)
            .map(cb => cb.dataset.path)
            .filter(name => name);
        
        if (selectedFilePath && !paths.includes(selectedFilePath)) {
            // If a directory is selected (no checkbox), include it
            paths.push(selectedFilePath);
        }
        return paths;
    };

    /** Handles creating a new empty file. */
    const handleCreateFile = async () => {
        const fileName = await showPromptDialog('Enter new file name:');
        if (fileName === null) {
            showPopupMessage("File creation cancelled.", true);
            return;
        }
        if (!fileName.trim()) {
            showPopupMessage("File name cannot be empty.", true);
            return;
        }

        const fullPath = currentPath === '/' ? `/${fileName}` : `${currentPath}${fileName}`;
        try {
            await api.saveFile(fullPath, '');
            showPopupMessage(`File '${fileName}' created successfully.`);
            renderFileList(currentPath);
        } catch (error) {
            console.error("Error creating file:", error);
            showPopupMessage(`Failed to create file '${fileName}': ${error.message}`, true);
        }
    };

    /** Handles creating a new directory. */
    const handleCreateDirectory = async () => {
        const dirName = await showPromptDialog('Enter new directory name:');
        if (dirName === null) {
            showPopupMessage("Directory creation cancelled.", true);
            return;
        }
        if (!dirName.trim()) {
            showPopupMessage("Directory name cannot be empty.", true);
            return;
        }

        const fullPath = currentPath === '/' ? `/${dirName}/` : `${currentPath}${dirName}/`;
        try {
            await api.mkPath(fullPath);
            showPopupMessage(`Directory '${dirName}' created successfully.`);
            renderFileList(currentPath);
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
        clipboard.paths = selected;
        showPopupMessage(`Copied ${selected.length} item(s) to clipboard.`);
        updateButtonStates();
    };

    /** Performs a cut operation. */
    const handleCut = () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showPopupMessage("No items selected to cut.", true);
            return;
        }
        clipboard.type = 'cut';
        clipboard.paths = selected;
        showPopupMessage(`Cut ${selected.length} item(s) to clipboard.`);
        updateButtonStates();
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

        if (clipboard.type === 'cut') {
            clipboard = { type: null, paths: [] };
        }
        renderFileList(currentPath);
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
            try {
                if (currentPath.startsWith('/trash/')) {
                    await api.del(name);
                } else {
                    await api.mv(name, '/trash/');
                }
                successCount++;
            } catch (error) {
                console.error(`Error deleting/moving ${name}:`, error);
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

        renderFileList(currentPath);
        updateButtonStates();
    };

    // Handle "Use File Path" operation
    const handleUsePath = (e) => {
        if (!selectedFilePath) {
            showPopupMessage("No file is currently selected.", true);
            return;
        }

        if (_onFilePickHandler) {
            try {
                _onFilePickHandler.call(pickerContainerWrapper, e, selectedFilePath);
            } catch (err) {
                console.error("Error executing programmatic onfilepick handler:", err);
            }
        }
        if (originalOnFilePickAttribute) {
            executeAttributeHandler(originalOnFilePickAttribute, pickerContainerWrapper, e, selectedFilePath);
        }

        pickerContainerWrapper.dispatchEvent(new CustomEvent('filepick', {
            detail: { filePath: selectedFilePath },
            bubbles: true,
            composed: true
        }));
    };

    // Handle "Cancel" operation
    const handleCancel = (e) => {
        if (_onCancelHandler) {
            try {
                _onCancelHandler.call(pickerContainerWrapper, e);
            } catch (err) {
                console.error("Error executing programmatic oncancel handler:", err);
            }
        }
        if (originalOnCancelAttribute) {
            executeAttributeHandler(originalOnCancelAttribute, pickerContainerWrapper, e);
        }

        pickerContainerWrapper.dispatchEvent(new CustomEvent('cancel', {
            bubbles: true,
            composed: true
        }));
    };


    // --- Event Listeners ---

    // Initial render
    if (initialFilePathAttribute) {
        pickerContainerWrapper.filePath = initialFilePathAttribute;
    } else {
        renderFileList(currentPath);
    }
    updateButtonStates();

    // Menu button handlers
    createButton.addEventListener('click', handleCreateFile);
    createDirectoryButton.addEventListener('click', handleCreateDirectory);
    copyButton.addEventListener('click', handleCopy);
    cutButton.addEventListener('click', handleCut);
    pasteButton.addEventListener('click', handlePaste);
    deleteButton.addEventListener('click', handleDelete);
    refreshButton.addEventListener('click', () => renderFileList(currentPath));
    cancelButton.addEventListener('click', handleCancel);
    usePathButton.addEventListener('click', handleUsePath);

    // Select All checkbox
    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const checkboxes = fileListTbody.querySelectorAll('.file-checkbox');
        checkboxes.forEach(cb => {
            if (!cb.disabled) {
                cb.checked = isChecked;
            }
        });

        if (isChecked && checkboxes.length > 0) {
            selectedFilePath = "Multiple files selected";
            titleTextEl.textContent = selectedFilePath;
        } else {
            selectedFilePath = null;
            titleTextEl.textContent = 'No file selected';
        }

        updateButtonStates();
    });

    // Event delegation for individual file checkboxes to also trigger updateSelectionState
    fileListTbody.addEventListener('change', (e) => {
        if (e.target.classList.contains('file-checkbox')) {
            const fullPath = e.target.dataset.path;
            if (e.target.checked) {
                updateSelectionState(fullPath);
            } else {
                const checkedCount = fileListTbody.querySelectorAll('.file-checkbox:checked').length;
                if (checkedCount === 0) {
                    selectedFilePath = null;
                    titleTextEl.textContent = 'No file selected';
                    updateButtonStates();
                }
            }
        }
    });

    return pickerContainerWrapper;
}

// --- Public function to create a new file picker programmatically. ---
/**
 * Public function to create a new file picker programmatically.
 * This now returns an encapsulated element to be used as a modal.
 * @returns {HTMLElement} The outermost DOM element representing the file picker.
 */
export function createfilePicker() {
    const dialogWrapper = document.createElement('div');
    dialogWrapper.className = 'file-picker-dialog-wrapper';
    dialogWrapper.style.position = 'fixed';
    dialogWrapper.style.top = '50%';
    dialogWrapper.style.left = '50%';
    dialogWrapper.style.transform = 'translate(-50%, -50%)';
    dialogWrapper.style.width = '80%';
    dialogWrapper.style.height = '80%';
    dialogWrapper.style.maxWidth = '600px';
    dialogWrapper.style.maxHeight = '800px';
    dialogWrapper.style.zIndex = '99999999999';

    const filePickerInstance = setupFilePickerInstance();
    dialogWrapper.appendChild(filePickerInstance);

    return dialogWrapper;
}


// --- DOM Observation for <filepicker> tags ---

/**
 * Observes the DOM for `<filepicker>` elements, converts them into
 * enhanced file pickers, and handles dynamically added elements.
 */
function observeFilePickerElements() {
    // Initial scan for existing <filepicker> elements on page load
    document.querySelectorAll('filepicker').forEach(filepickerElement => {
        const parentContainer = filepickerElement.parentNode;
        if (parentContainer) {
            const pickerDom = setupFilePickerInstance(filepickerElement);
            parentContainer.replaceChild(pickerDom, filepickerElement);
        } else {
            console.warn("Found <filepicker> element without a parent, cannot convert:", filepickerElement);
        }
    });

    // MutationObserver to detect dynamically added <filepicker> elements
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.tagName === 'FILEPICKER') {
                        const parentContainer = node.parentNode;
                        if (parentContainer) {
                            const pickerDom = setupFilePickerInstance(node);
                            parentContainer.replaceChild(pickerDom, node);
                        }
                    } else if (node.nodeType === 1) {
                        node.querySelectorAll('filepicker').forEach(filepickerElement => {
                            const parentContainer = filepickerElement.parentNode;
                            if (parentContainer) {
                                const pickerDom = setupFilePickerInstance(filepickerElement);
                                parentContainer.replaceChild(pickerDom, filepickerElement);
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

// --- Initialize on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    observeFilePickerElements();
});
