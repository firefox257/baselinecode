


// ./ux/filePicker.js

import { api } from '../js/apiCalls.js';
import { 
    injectStyles,
    formatBytes,
    showPopupMessage,
    showConfirmDialog,
    showPromptDialog,
    createPickerDOM
} from './filePickerUI.js';

// --- Module-level Variables ---
// (No need for stylesInjected here, it's in filePickerUI.js)
let currentPath = '/';
let clipboard = { type: null, paths: [] };
let _onFilePickHandler = null;
let _onCancelHandler = null;
let selectedFilePath = null;

// --- Core File Picker Setup Function ---

/**
 * Sets up a file picker instance, handling DOM creation, event listeners,
 * and property emulation.
 * @param {HTMLElement|null} originalElement - The original <filepicker> element if converting, otherwise null.
 * @returns {HTMLElement} The outermost DOM element representing the file picker.
 */
function setupFilePickerInstance(originalElement = null) {
    injectStyles();

    // --- State Variables (Per Instance) ---
    // These need to be instance-specific, so they are re-declared here for each new instance.
    let instanceCurrentPath = '/';
    let instanceClipboard = { type: null, paths: [] };
    let instanceOnFilePickHandler = null;
    let instanceOnCancelHandler = null;
    let instanceSelectedFilePath = null;

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
        if (initialFilePathAttribute) {
            const pathParts = initialFilePathAttribute.split('/');
            pathParts.pop(); // Remove the file name
            instanceCurrentPath = pathParts.join('/') + (pathParts.length > 1 ? '/' : '');
            if (pathParts.length === 1 && pathParts[0] === '') instanceCurrentPath = '/';
        }
    }

    // --- Create DOM Elements and Get References ---
    const pickerContainer = createPickerDOM(originalClass, originalId, instanceCurrentPath);
    const titleTextEl = pickerContainer.querySelector('.file-picker-title-text');
    const createFileButton = pickerContainer.querySelector('.create-file-btn');
    const createDirectoryButton = pickerContainer.querySelector('.create-dir-btn');
    const renameButton = pickerContainer.querySelector('.rename-btn');
    const copyButton = pickerContainer.querySelector('.copy-btn');
    const cutButton = pickerContainer.querySelector('.cut-btn');
    const pasteButton = pickerContainer.querySelector('.paste-btn');
    const deleteButton = pickerContainer.querySelector('.delete-btn');
    const cancelButton = pickerContainer.querySelector('.cancel-btn');
    const usePathButton = pickerContainer.querySelector('.use-path-btn');
    const currentPathSpan = pickerContainer.querySelector('.file-picker-current-path');
    const refreshButton = pickerContainer.querySelector('.file-picker-refresh-button');
    const fileListTable = pickerContainer.querySelector('.file-picker-list-table');
    const fileListTbody = pickerContainer.querySelector('.file-picker-list-table tbody');
    const selectAllCheckbox = pickerContainer.querySelector('.file-picker-select-all-checkbox');

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
    Object.defineProperty(pickerContainer, 'onfilepick', {
        get() { return instanceOnFilePickHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                instanceOnFilePickHandler = newValue;
            } else {
                console.warn("Attempted to set onfilepick to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // Emulate 'oncancel' property
    Object.defineProperty(pickerContainer, 'oncancel', {
        get() { return instanceOnCancelHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                instanceOnCancelHandler = newValue;
            } else {
                console.warn("Attempted to set oncancel to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // Emulate a 'filePath' property
    Object.defineProperty(pickerContainer, 'filePath', {
        get() { return instanceSelectedFilePath; },
        set(newValue) {
            if (typeof newValue === 'string') {
                const normalizedPath = newValue.endsWith('/') ? newValue.slice(0, -1) : newValue;
                const pathParts = normalizedPath.split('/');
                pathParts.pop();
                const dirPath = pathParts.join('/') + (pathParts.length > 1 ? '/' : '');
                
                renderFileList(dirPath || '/').then(() => {
                    const checkbox = fileListTbody.querySelector(`.file-checkbox[data-path="${normalizedPath}"]`);
                    const dirNameEl = fileListTbody.querySelector(`.file-name[data-path="${normalizedPath}"]`);
                    
                    if (checkbox) {
                        checkbox.checked = true;
                        instanceSelectedFilePath = normalizedPath;
                        titleTextEl.textContent = normalizedPath;
                    } else if (dirNameEl) {
                        instanceSelectedFilePath = normalizedPath;
                        titleTextEl.textContent = normalizedPath;
                    } else {
                        console.warn(`File or directory '${newValue}' not found.`);
                        instanceSelectedFilePath = null;
                        titleTextEl.textContent = 'No file selected';
                    }
                    updateButtonStates();
                });
            } else {
                console.warn("Attempted to set filePath to a non-string value:", newValue);
            }
        },
        configurable: true
    });

    Object.defineProperty(pickerContainer, 'dom.buttonText', {
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
        pickerContainer.onfilepick = (e, filePath) => executeAttributeHandler(originalOnFilePickAttribute, pickerContainer, e, filePath);
    }
    if (originalOnCancelAttribute) {
        pickerContainer.oncancel = (e) => executeAttributeHandler(originalOnCancelAttribute, pickerContainer, e);
    }
    if (originalButtonTextAttribute) {
        pickerContainer['dom.buttonText'] = originalButtonTextAttribute;
    }


    // --- Core File Picker Functions ---

    /**
     * Updates button states based on selection and clipboard.
     */
    const updateButtonStates = () => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const hasSelection = selectedCheckboxes.length > 0;
        const isSingleSelection = selectedCheckboxes.length === 1;

        copyButton.disabled = !hasSelection;
        cutButton.disabled = !hasSelection;
        deleteButton.disabled = !hasSelection;
        renameButton.disabled = !isSingleSelection;
        
        pasteButton.disabled = instanceClipboard.type === null || instanceClipboard.paths.length === 0;

        const isSingleItem = selectedCheckboxes.length === 1 || (instanceSelectedFilePath && !instanceSelectedFilePath.endsWith('/..') && !hasSelection);
        const isGoUpDir = instanceSelectedFilePath && instanceSelectedFilePath.endsWith('/..');
        usePathButton.disabled = !isSingleItem || isGoUpDir;
        
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
        instanceCurrentPath = path;
        currentPathSpan.textContent = `Path: ${instanceCurrentPath}`;
        fileListTbody.innerHTML = '';
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;

        instanceSelectedFilePath = null;
        titleTextEl.textContent = 'No file selected';


        try {
            const files = await api.ls(instanceCurrentPath === '/' ? '*' : `${instanceCurrentPath.endsWith('/') ? instanceCurrentPath + '*' : instanceCurrentPath + '/*'}`);
            let fileListHtml = '';
            if (instanceCurrentPath !== '/') {
                const parentPath = instanceCurrentPath.split('/').slice(0, -2).join('/') + '/';
                const upPath = parentPath === '//' ? '/' : parentPath;
                fileListHtml += `
                    <tr class="up-directory-row" data-type="directory">
                        <td>⬆️</td>
                        <td class="file-name up-directory" data-path="${upPath}">..</td>
                        <td></td>
                        <td><input type="checkbox" class="file-checkbox" data-path="${upPath}/.." disabled></td>
                    </tr>
                `;
            }
            files.sort((a, b) => {
                if (a.type === 'directory' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });

            files.forEach(file => {
                const icon = file.type === 'directory' ? '📂' : '📄';
                const size = file.type === 'file' ? formatBytes(file.size) : '';
                const fullPath = instanceCurrentPath === '/' ? `/${file.name}` : `${instanceCurrentPath}${file.name}`;
                const dataType = file.type === 'directory' ? 'data-type="directory"' : 'data-type="file"';

                fileListHtml += `
                    <tr ${dataType}>
                        <td class="file-icon">${icon}</td>
                        <td class="file-name" data-path="${fullPath}">${file.name}</td>
                        <td class="file-size-cell">${size}</td>
                        <td><input type="checkbox" class="file-checkbox" data-path="${fullPath}"></td>
                    </tr>
                `;
            });
            fileListTbody.innerHTML = fileListHtml;
            updateButtonStates();
        } catch (error) {
            console.error("Error rendering file list:", error);
            showPopupMessage(`Error: ${error.message || 'Failed to list files.'}`, true);
            fileListTbody.innerHTML = `<tr><td colspan="4">Error loading files: ${error.message || 'Unknown error'}</td></tr>`;
        }
    };
    
    /**
     * Updates the UI and state based on the current selection.
     */
    const updateSelectionState = (fullPath) => {
        const checkboxes = fileListTbody.querySelectorAll('.file-checkbox');
        checkboxes.forEach(cb => {
            if (cb.dataset.path !== fullPath) {
                cb.checked = false;
            }
        });

        const selectedCheckbox = fileListTbody.querySelector(`.file-checkbox[data-path="${fullPath}"]`);
        
        if (selectedCheckbox && selectedCheckbox.checked) {
            instanceSelectedFilePath = fullPath;
            titleTextEl.textContent = fullPath;
        } else {
            const selectedDirNameEl = fileListTbody.querySelector(`.file-name[data-path="${fullPath}"]`);
            if (selectedDirNameEl) {
                instanceSelectedFilePath = fullPath;
                titleTextEl.textContent = fullPath;
            } else {
                instanceSelectedFilePath = null;
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
        
        if (instanceSelectedFilePath && !paths.includes(instanceSelectedFilePath)) {
            paths.push(instanceSelectedFilePath);
        }
        return paths;
    };
    
    /** Handles renaming a file or directory. */
    const handleRename = async () => {
        const selected = getSelectedPaths();
        if (selected.length !== 1) {
            showPopupMessage("Please select exactly one item to rename.", true);
            return;
        }

        const oldPath = selected[0];
        const oldName = oldPath.split('/').pop();
        const newName = await showPromptDialog(`Rename '${oldName}' to:`, oldName);

        if (newName === null || !newName.trim()) {
            showPopupMessage("Rename cancelled.", true);
            return;
        }

        // Correctly construct the new path based on the parent directory of the old path
        const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
        const newPath = parentDir + newName;
        
        try {
            // Use api.rn for renaming, which requires the new path to be in the same directory.
            await api.rn(oldPath, newPath);
            showPopupMessage(`Renamed '${oldName}' to '${newName}' successfully.`);
            renderFileList(instanceCurrentPath);
        } catch (error) {
            console.error("Error renaming item:", error);
            showPopupMessage(`Failed to rename: ${error.message}`, true);
        }
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

        const fullPath = instanceCurrentPath === '/' ? `/${fileName}` : `${instanceCurrentPath}${fileName}`;
        try {
            await api.saveFile(fullPath, '');
            showPopupMessage(`File '${fileName}' created successfully.`);
            renderFileList(instanceCurrentPath);
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

        const fullPath = instanceCurrentPath === '/' ? `/${dirName}/` : `${instanceCurrentPath}${dirName}/`;
        try {
            await api.mkPath(fullPath);
            showPopupMessage(`Directory '${dirName}' created successfully.`);
            renderFileList(instanceCurrentPath);
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
        instanceClipboard.type = 'copy';
        instanceClipboard.paths = selected;
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
        instanceClipboard.type = 'cut';
        instanceClipboard.paths = selected;
        showPopupMessage(`Cut ${selected.length} item(s) to clipboard.`);
        updateButtonStates();
    };

    /** Performs a paste operation. */
    const handlePaste = async () => {
        if (instanceClipboard.type === null || instanceClipboard.paths.length === 0) {
            showPopupMessage("Clipboard is empty.", true);
            return;
        }

        const destination = instanceCurrentPath.endsWith('/') ? instanceCurrentPath : instanceCurrentPath + '/';
        let successCount = 0;
        let failCount = 0;

        for (const sourcePath of instanceClipboard.paths) {
            const fileName = sourcePath.split('/').pop();
            let newFileName = fileName;

            if (instanceClipboard.type === 'copy') {
                try {
                    const filesInDest = await api.ls(destination);
                    const fileExists = filesInDest.some(f => f.name === newFileName);

                    if (fileExists) {
						
                        let copyIndex = 0;
                        let foundUniqueName = false;
                        while (!foundUniqueName) {
                            const newName = `${newFileName}_copy${copyIndex}`;
                            const nameExists = filesInDest.some(f => f.name === newName);
                            if (!nameExists) {
                                newFileName = newName;
                                foundUniqueName = true;
                            } else {
                                copyIndex++;
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error checking for file existence:", error);
                    // Continue with original filename if we can't check
                }
            }

            try {
                if (instanceClipboard.type === 'copy') {
                    await api.copy(sourcePath, destination + newFileName);
                    showPopupMessage(`Copied ${sourcePath.split('/').pop()} to ${destination + newFileName}`);
                } else if (instanceClipboard.type === 'cut') {
                    await api.mv(sourcePath, destination);
                    showPopupMessage(`Moved ${sourcePath.split('/').pop()} to ${destination}`);
                }
                successCount++;
            } catch (error) {
                console.error(`Error during paste operation for ${sourcePath}:`, error);
                showPopupMessage(`Failed to ${instanceClipboard.type} ${sourcePath.split('/').pop()}: ${error.message}`, true);
                failCount++;
            }
        }

        if (successCount > 0) {
            showPopupMessage(`${successCount} item(s) ${instanceClipboard.type}ed successfully.`);
        }
        if (failCount > 0) {
            showPopupMessage(`${failCount} item(s) failed to ${instanceClipboard.type}.`, true);
        }

        if (instanceClipboard.type === 'cut') {
            instanceClipboard = { type: null, paths: [] };
        }
        renderFileList(instanceCurrentPath);
        updateButtonStates();
    };

    /** Performs a delete operation. */
    const handleDelete = async () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showPopupMessage("No items selected to delete.", true);
            return;
        }

        const message = instanceCurrentPath.startsWith('/trash/')
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
                if (instanceCurrentPath.startsWith('/trash/')) {
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
            showPopupMessage(`${successCount} item(s) ${instanceCurrentPath.startsWith('/trash/') ? 'deleted permanently' : 'moved to trash'} successfully.`);
        }
        if (failCount > 0) {
            showPopupMessage(`${failCount} item(s) failed to delete/move.`, true);
        }

        renderFileList(instanceCurrentPath);
        updateButtonStates();
    };

    // Handle "Use File Path" operation
    const handleUsePath = (e) => {
        if (!instanceSelectedFilePath) {
            showPopupMessage("No file is currently selected.", true);
            return;
        }

        // --- FIX: Prioritize programmatic handler over attribute handler to prevent double trigger ---
        if (instanceOnFilePickHandler) {
            try {
                instanceOnFilePickHandler.call(pickerContainer, e, instanceSelectedFilePath);
            } catch (err) {
                console.error("Error executing programmatic onfilepick handler:", err);
            }
        } else if (originalOnFilePickAttribute) {
            executeAttributeHandler(originalOnFilePickAttribute, pickerContainer, e, instanceSelectedFilePath);
        }
        // --- End of Fix ---

        pickerContainer.dispatchEvent(new CustomEvent('filepick', {
            detail: { filePath: instanceSelectedFilePath },
            bubbles: true,
            composed: true
        }));
    };

    // Handle "Cancel" operation
    const handleCancel = (e) => {
        if (instanceOnCancelHandler) {
            try {
                instanceOnCancelHandler.call(pickerContainer, e);
            } catch (err) {
                console.error("Error executing programmatic oncancel handler:", err);
            }
        }
        if (originalOnCancelAttribute) {
            executeAttributeHandler(originalOnCancelAttribute, pickerContainer, e);
        }

        pickerContainer.dispatchEvent(new CustomEvent('cancel', {
            bubbles: true,
            composed: true
        }));
    };


    // --- Event Listeners ---

    if (initialFilePathAttribute) {
        pickerContainer.filePath = initialFilePathAttribute;
    } else {
        renderFileList(instanceCurrentPath);
    }
    updateButtonStates();

    createFileButton.addEventListener('click', handleCreateFile);
    createDirectoryButton.addEventListener('click', handleCreateDirectory);
    renameButton.addEventListener('click', handleRename);
    copyButton.addEventListener('click', handleCopy);
    cutButton.addEventListener('click', handleCut);
    pasteButton.addEventListener('click', handlePaste);
    deleteButton.addEventListener('click', handleDelete);
    refreshButton.addEventListener('click', () => renderFileList(instanceCurrentPath));
    cancelButton.addEventListener('click', handleCancel);
    usePathButton.addEventListener('click', handleUsePath);

    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const checkboxes = fileListTbody.querySelectorAll('.file-checkbox');
        checkboxes.forEach(cb => {
            if (!cb.disabled) {
                cb.checked = isChecked;
            }
        });

        if (isChecked && checkboxes.length > 0) {
            instanceSelectedFilePath = "Multiple files selected";
            titleTextEl.textContent = instanceSelectedFilePath;
        } else {
            instanceSelectedFilePath = null;
            titleTextEl.textContent = 'No file selected';
        }
        updateButtonStates();
    });

    fileListTbody.addEventListener('click', (e) => {
        const targetRow = e.target.closest('tr');
        if (!targetRow) return;

        const nameCell = targetRow.querySelector('.file-name');
        const checkbox = targetRow.querySelector('.file-checkbox');

        if (targetRow.classList.contains('up-directory-row')) {
            const upPath = nameCell.dataset.path;
            renderFileList(upPath);
            return;
        }

        if (nameCell && !e.target.classList.contains('file-checkbox')) {
            const fullPath = nameCell.dataset.path;
            const isDirectory = targetRow.dataset.type === 'directory';

            if (isDirectory) {
                updateSelectionState(fullPath);
                renderFileList(fullPath + '/');
            } else {
                checkbox.checked = !checkbox.checked;
                updateSelectionState(fullPath);
            }
        }
    });

    fileListTbody.addEventListener('change', (e) => {
        if (e.target.classList.contains('file-checkbox')) {
            const fullPath = e.target.dataset.path;
            const checkedCount = fileListTbody.querySelectorAll('.file-checkbox:checked').length;
            if (e.target.checked) {
                updateSelectionState(fullPath);
            } else {
                if (checkedCount === 0) {
                    instanceSelectedFilePath = null;
                    titleTextEl.textContent = 'No file selected';
                } else {
                    instanceSelectedFilePath = 'Multiple files selected';
                    titleTextEl.textContent = instanceSelectedFilePath;
                }
            }
            updateButtonStates();
        }
    });

    // Handle resizing for responsiveness
    const checkResize = () => {
        const containerWidth = pickerContainer.offsetWidth;
        const sizeCells = fileListTable.querySelectorAll('.file-size-cell');
        
        if (containerWidth < 400) {
            fileListTable.querySelector('thead th:nth-child(3)').style.display = 'none';
            sizeCells.forEach(cell => cell.style.display = 'none');
        } else {
            fileListTable.querySelector('thead th:nth-child(3)').style.display = 'table-cell';
            sizeCells.forEach(cell => cell.style.display = 'table-cell');
        }
    };

    const resizeObserver = new ResizeObserver(checkResize);
    resizeObserver.observe(pickerContainer);

    return pickerContainer;
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
    document.querySelectorAll('filepicker').forEach(filepickerElement => {
        const parentContainer = filepickerElement.parentNode;
        if (parentContainer) {
            const pickerDom = setupFilePickerInstance(filepickerElement);
            parentContainer.replaceChild(pickerDom, filepickerElement);
        } else {
            console.warn("Found <filepicker> element without a parent, cannot convert:", filepickerElement);
        }
    });

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

