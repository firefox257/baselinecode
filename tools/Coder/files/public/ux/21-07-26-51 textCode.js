

/*
This is a module text code editor.
file location at ./ux/textCode.js

change the select all icon to something else.

*/

// textCode.js

// --- Constants ---
const TAB_SPACES = 4;
const LINE_HEIGHT_EM = 1.5; // Consistent line height for alignment
const HISTORY_DEBOUNCE_TIME = 300; // Milliseconds to wait before saving history state

// --- Module-level Variables ---
let lastTypedChar = ''; // Tracks the last typed character for smart indentation
let stylesInjected = false; // Flag to ensure styles are injected only once

// --- History Management (Per Instance) ---
// These will be managed within each editor instance to allow multiple editors
// to have their own undo/redo stacks.

// --- Dynamic Style Injection (Self-executing function for immediate injection) ---
/**
 * Injects necessary CSS styles for the code editor into the document head.
 * Ensures styles are injected only once.
 */
function injectStyles() {
    if (stylesInjected) return;

    const style = document.createElement('style');
    style.id = 'code-editor-styles'; // ID to prevent re-injection based on ID or for easy removal
    style.textContent = `
        /* Main container for the editor and its controls */
        .code-editor-container-wrapper {
            position: relative; /* Needed for absolute positioning of the button and menu */
            display: flex;
            flex-direction: column; /* Stack menu, editor, and footer vertically */
            width: 100%;
            height: 100%;
            overflow: hidden; /* Prevent content overflowing the wrapper */
            border: 1px solid #ccc; /* Subtle border for the whole editor */
        }

        /* Top menu bar for undo/redo - NOW A TABLE */
        .code-editor-menu-bar {
            width: 100%; /* Ensure table takes full width */
            border-collapse: collapse; /* For clean borders between cells */
            background-color: #f8f8f8; /* Light background for the menu */
            border-bottom: 1px solid #eee; /* Separator from editor content */
            flex-shrink: 0; /* Prevent menu from shrinking */
        }

        .code-editor-menu-bar td {
            border: 1px solid #ddd; /* 1px border for each cell */
            text-align: center; /* Horizontal align center */
            vertical-align: middle; /* Vertical align middle */
            padding: 0; /* Remove default padding from td */
        }

        .code-editor-menu-bar button {
            background-color: transparent;
            border: none; /* Buttons inside TD don't need their own border */
            color: #555;
            padding: 0 6px; /* Removed vertical padding, kept horizontal */
            margin: 0; /* No margin as TD handles spacing/border */
            cursor: pointer;
            border-radius: 0; /* No border radius for buttons inside bordered TDs */
            font-size: 1em; /* Slightly smaller font for icons */
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s, border-color 0.2s;
            line-height: 1; /* Ensure line height is tight for icons */
            height: 24px; /* Explicit height to control button size precisely */
            box-sizing: border-box; /* Include padding and border in the element's total width and height */
            width: 100%; /* Make button fill its TD */
        }

        .code-editor-menu-bar button:hover:not(:disabled) {
            background-color: #e0e0e0;
            border-color: #ccc;
        }

        .code-editor-menu-bar button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* NEW: Styles for the Find Input field */
        .code-editor-menu-bar .find-input {
            flex-grow: 1; /* Allow it to take available space */
            width: 100%; /* Make input fill its TD */
            padding: 4px 8px;
            border: none; /* Input inside TD doesn't need its own border */
            border-radius: 0; /* No border radius */
            font-size: 0.9em;
            margin: 0; /* No margin */
            box-sizing: border-box; /* Include padding and border in sizing */
            outline: none; /* Remove outline on focus */
            background-color: transparent; /* Blend with TD background */
        }

        /* Wrapper for the line numbers and content area */
        .code-editor-wrapper {
            display: flex;
            flex-grow: 1; /* Allows the editor content to take available height */
            font-family: 'Fira Code', 'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
            font-size: 14px;
            line-height: ${LINE_HEIGHT_EM}; /* Ensure consistent line height for alignment */
            overflow: hidden; /* Prevents wrapper scrollbars unless needed */
        }

        /* Styles for the line number column */
        .code-editor-line-numbers {
            flex-shrink: 0; /* Prevents shrinking of line numbers column */
            text-align: right;
            padding: 10px;
            background-color: #f0f0f0; /* Lighter background for line numbers */
            color: #888; /* Darker text for line numbers */
            user-select: none; /* Prevents selection of line numbers */
            overflow-y: hidden; /* Scroll will be synced with editor's scroll */
            box-sizing: border-box; /* Include padding in element's total width/height */
        }

        .code-editor-line-numbers > div {
            height: ${LINE_HEIGHT_EM}em; /* Match editor line-height for perfect alignment */
            line-height: ${LINE_HEIGHT_EM}em; /* Ensure text within div also matches */
        }

        /* Styles for the content editable area */
        .code-editor-content {
            flex-grow: 1; /* Takes remaining space */
            padding: 10px;
            outline: none; /* Removes default focus outline */
            overflow: auto; /* Enables scrolling for content */
            background-color: #ffffff; /* White background for editor content */
            color: #000000; /* Black font color for editor content */
            tab-size: ${TAB_SPACES}; /* Key CSS property for tab visual width */
            -moz-tab-size: ${TAB_SPACES}; /* Firefox specific property */
            white-space: pre; /* Ensures content does not wrap and respects whitespace */
            word-break: normal; /* Prevents word breaking within lines */
            box-sizing: border-box; /* Include padding in element's total width/height */
        }

        /* Styling for the beautify button, now positioned absolutely */
        .code-editor-beautify-button-container {
            position: absolute;
            bottom: 0px; /* Distance from bottom */
            right: 0px; /* Distance from right */
            z-index: 10; /* Ensures it's above the editor content */
        }

        .code-editor-beautify-button-container button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 5px 10px;
            cursor: pointer;
            border-radius: 3px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2); /* Optional: add a subtle shadow */
            font-size: 1.2em; /* Make symbol a bit larger */
            display: flex; /* For better icon alignment */
            align-items: center;
            justify-content: center;
        }

        .code-editor-beautify-button-container button:hover {
            background-color: #0056b3;
        }

        /* Styles for the Go to Line dialog */
        .code-editor-goto-dialog {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #fff;
            border: 1px solid #ccc;
            padding: 15px;
            border-radius: 5px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
            z-index: 20; /* Ensure it's above everything else */
            display: none; /* Hidden by default */
            flex-direction: column;
            gap: 10px;
            min-width: 200px;
        }

        .code-editor-goto-dialog input[type="number"] {
            width: calc(100% - 12px); /* Adjust for padding */
            padding: 6px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-size: 1em;
            box-sizing: border-box;
        }

        .code-editor-goto-dialog-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 5px;
        }

        .code-editor-goto-dialog-buttons button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        .code-editor-goto-dialog-buttons button.cancel {
            background-color: #6c757d;
        }

        .code-editor-goto-dialog-buttons button:hover {
            background-color: #0056b3;
        }

        .code-editor-goto-dialog-buttons button.cancel:hover {
            background-color: #5a6268;
        }
    `;
    document.head.appendChild(style);
    stylesInjected = true;
}

// --- Caret and Scrolling Utility Functions ---

/**
 * Gets the current line and column (visual, considering tabs) of the caret within an editable div.
 * @param {HTMLElement} editableDiv The contenteditable div.
 * @returns {{line: number, column: number, charIndex: number}} An object containing the current line, column, and absolute character index.
 */
function getCaretPosition(editableDiv) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return { line: 1, column: 1, charIndex: 0 };

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editableDiv);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    const currentText = preCaretRange.toString();
    const lines = currentText.split('\n');

    const line = lines.length;
    let column = 0;
    const currentLineContent = lines[lines.length - 1] || '';

    // Calculate visual column by accounting for tab spaces
    for (let i = 0; i < currentLineContent.length; i++) {
        if (currentLineContent[i] === '\t') {
            column += TAB_SPACES;
        } else {
                column += 1;
            }
        }
    // Calculate character index from the beginning of the editable div
    let charIndex = 0;
    for (let i = 0; i < lines.length - 1; i++) {
        charIndex += lines[i].length + 1; // +1 for the newline character
    }
    charIndex += currentLineContent.length;

    return { line, column, charIndex };
}

/**
 * Sets the caret position within an editable div to a specific line and column (visual).
 * @param {HTMLElement} editableDiv The contenteditable div.
 * @param {number} line The target line number (1-indexed).
 * @param {number} column The target visual column number (1-indexed).
 * @param {number|null} charIndex Optional: The absolute character index to set the caret. If provided, line/column are ignored.
 */
function setCaretPosition(editableDiv, line, column, charIndex = null) {
    const textContent = editableDiv.textContent;
    const lines = textContent.split('\n');
    let targetCharIndex = 0;

    if (charIndex !== null) {
        targetCharIndex = Math.min(charIndex, textContent.length);
    } else {
        // Calculate character index up to the target line
        for (let i = 0; i < line - 1 && i < lines.length; i++) {
            targetCharIndex += lines[i].length + 1; // +1 for the newline character
        }

        // Determine target line content, handling out-of-bounds line numbers
        let targetLineContent = '';
        if (line > lines.length) {
            targetLineContent = lines[lines.length - 1] || '';
            targetCharIndex = textContent.length; // If line is beyond content, go to end of text
        } else {
            targetLineContent = lines[line - 1] || '';
        }

        // Calculate character index within the target line based on visual column
        let currentVisualCol = 0;
        let targetCharIndexInLine = 0;
        for (let i = 0; i < targetLineContent.length; i++) {
            if (currentVisualCol >= column) {
                targetCharIndexInLine = i;
                break;
            }
            if (targetLineContent[i] === '\t') {
                currentVisualCol += TAB_SPACES;
            } else {
                currentVisualCol += 1;
            }
            targetCharIndexInLine = i + 1; // If loop finishes, it means caret is at end of line or beyond
        }
        targetCharIndex += targetCharIndexInLine;
    }

    // Ensure targetCharIndex does not exceed the total text content length
    targetCharIndex = Math.min(targetCharIndex, textContent.length);

    const range = document.createRange();
    const selection = window.getSelection();

    // Iterate through nodes to find the correct text node and offset
    let currentNode = editableDiv.firstChild;
    let charsCounted = 0;

    while (currentNode) {
        if (currentNode.nodeType === Node.TEXT_NODE) {
            const nodeLength = currentNode.length;
            if (targetCharIndex <= charsCounted + nodeLength) {
                range.setStart(currentNode, targetCharIndex - charsCounted);
                range.setEnd(currentNode, targetCharIndex - charsCounted);
                break;
            }
            charsCounted += nodeLength;
        } else if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.textContent !== undefined) {
            // If there are other elements (like spans for highlights), we've removed them
            // so this should primarily be text nodes. Fallback if it's not a text node.
            charsCounted += currentNode.textContent.length;
            if (targetCharIndex <= charsCounted) {
                // If the target is within a non-text node, try to set it at the boundary
                range.setStart(currentNode, Math.max(0, targetCharIndex - (charsCounted - currentNode.textContent.length)));
                range.setEnd(currentNode, Math.max(0, targetCharIndex - (charsCounted - currentNode.textContent.length)));
                break;
            }
        }
        currentNode = currentNode.nextSibling;
    }

    // Fallback if no specific node is found (e.g., empty div or targetCharIndex is 0)
    if (!currentNode && editableDiv.firstChild) {
        range.setStart(editableDiv.firstChild, 0);
        range.setEnd(editableDiv.firstChild, 0);
    } else if (!editableDiv.firstChild) {
        // If div is entirely empty
        range.setStart(editableDiv, 0);
        range.setEnd(editableDiv, 0);
    }

    selection.removeAllRanges();
    selection.addRange(range);
}


/**
 * Scrolls the caret into the visible area of the editor.
 * @param {HTMLElement} editableDiv The contenteditable div.
 */
function scrollCaretIntoView(editableDiv) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    let caretRect;
    try {
        // Attempt to get the caret's precise bounding rectangle
        caretRect = range.getBoundingClientRect();
    } catch (e) {
        // Fallback for cases where getBoundingClientRect might fail on a collapsed range
        const tempRange = document.createRange();
        const startNode = range.startContainer;
        const startOffset = range.startOffset;

        if (startNode.nodeType === Node.TEXT_NODE && startOffset > 0) {
            tempRange.setStart(startNode, startOffset - 1);
            tempRange.setEnd(startNode, startOffset);
        } else if (startNode.nodeType === Node.ELEMENT_NODE && startNode.childNodes.length > 0) {
            const childIndex = Math.max(0, startOffset - 1);
            if (startNode.childNodes[childIndex]) {
                tempRange.selectNode(startNode.childNodes[childIndex]);
            } else {
                tempRange.selectNode(editableDiv);
            }
        } else {
            tempRange.selectNode(editableDiv);
        }
        caretRect = tempRange.getBoundingClientRect();
    }

    const editorRect = editableDiv.getBoundingClientRect();

    // Check if caret is outside the vertical view
    if (caretRect.bottom > editorRect.bottom) {
        editableDiv.scrollTop += (caretRect.bottom - editorRect.bottom);
    } else if (caretRect.top < editorRect.top) {
        editableDiv.scrollTop -= (editorRect.top - caretRect.top);
    }

    // Check if caret is outside the horizontal view
    if (caretRect.right > editorRect.right) {
        editableDiv.scrollLeft += (caretRect.right - editorRect.right);
    } else if (caretRect.left < editorRect.left) {
        editableDiv.scrollLeft -= (editorRect.top - caretRect.left); // Should be editorRect.left - caretRect.left
    }
}


// --- Core Editor Setup Function ---

/**
 * Sets up a code editor instance, handling DOM creation, event listeners,
 * and property emulation.
 * @param {string} initialContent - The initial text content for the editor.
 * @param {HTMLElement|null} originalElement - The original <textcode> element if converting, otherwise null.
 * @returns {HTMLElement} The outermost DOM element representing the code editor.
*/
function setupCodeEditorInstance(initialContent, originalElement = null) {
    injectStyles(); // Ensure styles are present

    // --- History Management Variables for this instance ---
    let history = [];
    let historyPointer = -1;
    let redoStack = [];
    let historyTimeout = null; // For debouncing history pushes

    // --- Create DOM Elements ---
    const editorContainerWrapper = document.createElement('div');
    editorContainerWrapper.className = 'code-editor-container-wrapper';
    editorContainerWrapper.style.width = '100%';
    editorContainerWrapper.style.height = '100%';

    // Store original attributes from <textcode> for emulation
    let originalId = null;
    let originalClass = null;
    let originalOnInputAttribute = null;
    let originalOnChangeAttribute = null;

    if (originalElement) {
        originalId = originalElement.id;
        originalClass = originalElement.className;
        originalOnInputAttribute = originalElement.getAttribute('oninput');
        originalOnChangeAttribute = originalElement.getAttribute('onchange');

        // Apply ID and Class attributes to the outermost container
        if (originalId) {
            editorContainerWrapper.id = originalId;
        }
        if (originalClass) {
            editorContainerWrapper.className += ` ${originalClass}`; // Append existing classes
        }
    }

    // Menu Bar - Changed to Table
    const menuBar = document.createElement('table');
    menuBar.className = 'code-editor-menu-bar';
    const menuBarBody = document.createElement('tbody');
    const menuBarRow = document.createElement('tr');

    const undoButton = document.createElement('button');
    undoButton.innerHTML = '&curvearrowleft;'; // Undo icon
    undoButton.title = 'Undo';
    undoButton.disabled = true; // Initially disabled
    const undoCell = document.createElement('td');
    undoCell.appendChild(undoButton);
    menuBarRow.appendChild(undoCell);

    const redoButton = document.createElement('button');
    redoButton.innerHTML = '&curvearrowright;'; // Redo icon
    redoButton.title = 'Redo';
    redoButton.disabled = true; // Initially disabled
    const redoCell = document.createElement('td');
    redoCell.appendChild(redoButton);
    menuBarRow.appendChild(redoCell);

    // Select All Button
    const selectAllButton = document.createElement('button');
    selectAllButton.innerHTML = '&#x25A1;'; // Empty square icon, or choose another like &#x25AE; for a filled square
    selectAllButton.title = 'Select All';
    const selectAllCell = document.createElement('td');
    selectAllCell.appendChild(selectAllButton);
    menuBarRow.appendChild(selectAllCell);

    // Go to Line Button
    const goToLineButton = document.createElement('button');
    goToLineButton.innerHTML = '&#x2318;'; // A common symbol for "command" or "goto" (⌘) or '&#x21E7;' (up arrow with bar) or a simple number: 'Li#'
    goToLineButton.title = 'Go to Line';
    const goToLineCell = document.createElement('td');
    goToLineCell.appendChild(goToLineButton);
    menuBarRow.appendChild(goToLineCell);

    // NEW: Find Input Field
    const findInput = document.createElement('input');
    findInput.type = 'text';
    findInput.className = 'find-input';
    findInput.placeholder = 'Find...';
    findInput.title = 'Enter text to find (Ctrl+F to focus)';
    const findInputCell = document.createElement('td');
    findInputCell.appendChild(findInput);
    menuBarRow.appendChild(findInputCell);

    // Next Find Button
    const nextFindButton = document.createElement('button');
    nextFindButton.innerHTML = '&darr;'; // Down arrow
    nextFindButton.title = 'Find Next (F3)';
    nextFindButton.disabled = true; // Initially disabled
    const nextFindCell = document.createElement('td');
    nextFindCell.appendChild(nextFindButton);
    menuBarRow.appendChild(nextFindCell);

    // Previous Find Button
    const prevFindButton = document.createElement('button');
    prevFindButton.innerHTML = '&uarr;'; // Up arrow
    prevFindButton.title = 'Find Previous (Shift+F3)';
    prevFindButton.disabled = true; // Initially disabled
    const prevFindCell = document.createElement('td');
    prevFindCell.appendChild(prevFindButton);
    menuBarRow.appendChild(prevFindCell);

    menuBarBody.appendChild(menuBarRow);
    menuBar.appendChild(menuBarBody);


    const wrapper = document.createElement('div');
    wrapper.className = 'code-editor-wrapper';

    const beautifyButtonContainer = document.createElement('div');
    beautifyButtonContainer.className = 'code-editor-beautify-button-container';
    const beautifyButton = document.createElement('button');
    beautifyButton.innerHTML = '&#x2728;'; // Sparkles (✨)
    beautifyButton.title = 'Beautify Code';
    beautifyButtonContainer.appendChild(beautifyButton);

    const lineNumbersDiv = document.createElement('div');
    lineNumbersDiv.className = 'code-editor-line-numbers';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'code-editor-content';
    contentDiv.setAttribute('contenteditable', 'true');
    contentDiv.setAttribute('spellcheck', 'false');
    contentDiv.setAttribute('autocorrect', 'off');
    contentDiv.setAttribute('autocapitalize', 'off');
    contentDiv.textContent = initialContent; // Set textContent directly

    // Go to Line Dialog
    const goToLineDialog = document.createElement('div');
    goToLineDialog.className = 'code-editor-goto-dialog';
    goToLineDialog.innerHTML = `
        <span>Go to Line:</span>
        <input type="number" min="1" value="1" />
        <div class="code-editor-goto-dialog-buttons">
            <button class="goto-ok">Go</button>
            <button class="cancel">Cancel</button>
        </div>
    `;
    const goToLineInput = goToLineDialog.querySelector('input[type="number"]');
    const goToLineOkButton = goToLineDialog.querySelector('.goto-ok');
    const goToLineCancelButton = goToLineDialog.querySelector('.cancel');

    // Append elements to construct the editor DOM
    editorContainerWrapper.appendChild(menuBar); // Add menu bar first
    wrapper.appendChild(lineNumbersDiv);
    wrapper.appendChild(contentDiv);
    editorContainerWrapper.appendChild(wrapper);
    editorContainerWrapper.appendChild(beautifyButtonContainer);
    editorContainerWrapper.appendChild(goToLineDialog); // Add the dialog to the wrapper

    // --- Emulate 'value', 'oninput', 'onchange' properties ---

    // Define 'value' property on the wrapper to expose contentDiv's text
    Object.defineProperty(editorContainerWrapper, 'value', {
        get() {
            return contentDiv.textContent;
        },
        set(newValue) {
            if (typeof newValue !== 'string') {
                console.warn("Attempted to set 'value' to a non-string value:", newValue);
                newValue = String(newValue); // Coerce to string
            }
            contentDiv.textContent = newValue;
            updateLineNumbers();
            // Move caret to the end when content is set programmatically
            const lines = newValue.split('\n');
            const lastLineLength = (lines.pop() || '').length;
            setCaretPosition(contentDiv, lines.length + 1, lastLineLength * TAB_SPACES);
            scrollCaretIntoView(contentDiv);
            pushToHistory(true); // Force push to history on programmatic set
        },
        configurable: true // Allows redefining if necessary
    });

    // Internal references for programmatic event handlers (e.g., editor.oninput = fn)
    let _onInputHandler = null;
    let _onChangeHandler = null;

    Object.defineProperty(editorContainerWrapper, 'oninput', {
        get() { return _onInputHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onInputHandler = newValue;
            } else {
                console.warn("Attempted to set oninput to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'onchange', {
        get() { return _onChangeHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onChangeHandler = newValue;
            } else {
                console.warn("Attempted to set onchange to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // --- Helper Functions for Editor Instance ---

    /** Updates the line numbers display based on the content's line count. */
    const updateLineNumbers = () => {
        const lines = contentDiv.textContent.split('\n').length;
        let lineNumberHtml = '';
        for (let i = 1; i <= lines; i++) {
            lineNumberHtml += `<div>${i}</div>`;
        }
        lineNumbersDiv.innerHTML = lineNumberHtml;
    };

    /** Updates the disabled state of undo/redo buttons. */
    const updateUndoRedoButtons = () => {
        undoButton.disabled = historyPointer <= 0;
        redoButton.disabled = redoStack.length === 0;
    };

    /** Pushes the current state (content and caret position) to the history stack.
     * @param {boolean} force - If true, pushes immediately without debouncing.
     */
    const pushToHistory = (force = false) => {
        const currentState = {
            content: contentDiv.textContent,
            caret: getCaretPosition(contentDiv)
        };

        // Check if the current state is identical to the last history state
        if (history.length > 0) {
            const lastState = history[historyPointer];
            if (lastState.content === currentState.content &&
                lastState.caret.line === currentState.caret.line &&
                lastState.caret.column === currentState.caret.column) {
                return; // State hasn't changed, no need to push
            }
        }

        if (historyTimeout) {
            clearTimeout(historyTimeout);
        }

        if (force) {
            // Clear any future redo states when a new change is made
            redoStack = [];
            history = history.slice(0, historyPointer + 1); // Truncate history if we're not at the latest
            history.push(currentState);
            historyPointer = history.length - 1;
            updateUndoRedoButtons();
        } else {
            historyTimeout = setTimeout(() => {
                // Clear any future redo states when a new change is made
                redoStack = [];
                history = history.slice(0, historyPointer + 1); // Truncate history if we're not at the latest
                history.push(currentState);
                historyPointer = history.length - 1;
                updateUndoRedoButtons();
            }, HISTORY_DEBOUNCE_TIME);
        }
    };

    /** Applies a historical state to the editor. */
    const applyHistoryState = (state) => {
        contentDiv.textContent = state.content;
        updateLineNumbers();
        setCaretPosition(contentDiv, state.caret.line, state.caret.column);
        scrollCaretIntoView(contentDiv);
        updateUndoRedoButtons();
    };

    /** Undoes the last change. */
    const undo = () => {
        if (historyPointer > 0) {
            // Push current state to redo stack before moving back
            redoStack.push({
                content: contentDiv.textContent,
                caret: getCaretPosition(contentDiv)
            });
            historyPointer--;
            applyHistoryState(history[historyPointer]);
        }
    };

    /** Redoes the last undone change. */
    const redo = () => {
        if (redoStack.length > 0) {
            const stateToApply = redoStack.pop();
            // Push current state to history before moving forward (for multi-level undo/redo)
            redoStack.unshift({ // Add back to redo stack to preserve order
                content: contentDiv.textContent,
                caret: getCaretPosition(contentDiv)
            });
            historyPointer++; // Increment history pointer to point to the new state
            applyHistoryState(stateToApply);
        }
    }

    /** Selects all text in the contentDiv. */
    const selectAll = () => {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(contentDiv);
        selection.removeAllRanges();
        selection.addRange(range);
    };

    /** Shows the Go to Line dialog. */
    const showGoToLineDialog = () => {
        const currentLine = getCaretPosition(contentDiv).line;
        goToLineInput.value = currentLine; // Pre-fill with current line
        goToLineDialog.style.display = 'flex';
        goToLineInput.focus();
        goToLineInput.select(); // Select the text in the input field
    };

    /** Hides the Go to Line dialog. */
    const hideGoToLineDialog = () => {
        goToLineDialog.style.display = 'none';
    };

    /** Jumps to the specified line number. */
    const goToLine = () => {
        const lineNumber = parseInt(goToLineInput.value, 10);
        const totalLines = contentDiv.textContent.split('\n').length;

        if (isNaN(lineNumber) || lineNumber < 1 || lineNumber > totalLines) {
            // No alert for invalid line number
            goToLineInput.focus();
            goToLineInput.select();
            return;
        }

        setCaretPosition(contentDiv, lineNumber, 1); // Go to the beginning of the line
        scrollCaretIntoView(contentDiv);
        hideGoToLineDialog();
        contentDiv.focus(); // Re-focus the editor content
    };

    /** Updates the disabled state of Next/Previous Find buttons. */
    const updateFindNavButtons = () => {
        const hasQuery = findInput.value.length > 0;
        nextFindButton.disabled = !hasQuery;
        prevFindButton.disabled = !hasQuery;
    };

    /** Finds the next occurrence of the search query. */
    const findNext = () => {
        const query = findInput.value;
        if (!query) return;

        const content = contentDiv.textContent;
        let { charIndex: currentCaretIndex } = getCaretPosition(contentDiv);
        let startIndex = currentCaretIndex;

        // If cursor is exactly at the beginning of a match, skip this match to find the next one
        if (content.substring(startIndex, startIndex + query.length) === query) {
            startIndex += query.length;
        }

        let foundIndex = content.indexOf(query, startIndex);

        if (foundIndex === -1) { // Wrap around
            foundIndex = content.indexOf(query, 0);
        }

        if (foundIndex !== -1) {
            setCaretPosition(contentDiv, null, null, foundIndex);
            scrollCaretIntoView(contentDiv);
        }
        // No visual feedback for "not found" as per "simple" requirement
    };

    /** Finds the previous occurrence of the search query. */
    const findPrevious = () => {
        const query = findInput.value;
        if (!query) return;

        const content = contentDiv.textContent;
        let { charIndex: currentCaretIndex } = getCaretPosition(contentDiv);
        let endIndex = currentCaretIndex;

        // If cursor is exactly at the beginning of a match, search from before it
        if (content.substring(currentCaretIndex, currentCaretIndex + query.length) === query) {
            endIndex = currentCaretIndex - 1;
        } else {
            // If not at a match, search backward from just before the cursor
            endIndex = currentCaretIndex - 1;
        }

        let foundIndex = content.lastIndexOf(query, endIndex);

        if (foundIndex === -1) { // Wrap around from end
            foundIndex = content.lastIndexOf(query, content.length);
        }

        if (foundIndex !== -1) {
            setCaretPosition(contentDiv, null, null, foundIndex);
            scrollCaretIntoView(contentDiv);
        }
        // No visual feedback for "not found" as per "simple" requirement
    };

    /** Executes a string-based event handler from an HTML attribute. */
    const executeAttributeHandler = (handlerCode, scope, ...args) => {
        if (!handlerCode) return;
        try {
            // Using new Function is safer than eval as it creates a new scope.
            // Arguments are passed explicitly.
            const fn = new Function('event', 'value', handlerCode);
            fn.apply(scope, args);
        } catch (err) {
                console.error("Error executing attribute handler:", handlerCode, err);
            }
        };

    // --- Event Listeners ---

    // Initial state push to history
    pushToHistory(true);
    updateUndoRedoButtons(); // Ensure buttons are correct initially
    updateFindNavButtons(); // Ensure find buttons are correct initially

    // Undo/Redo button click handlers
    undoButton.addEventListener('click', undo);
    redoButton.addEventListener('click', redo);

    // Select All button click handler
    selectAllButton.addEventListener('click', selectAll);

    // Go to Line button click handler
    goToLineButton.addEventListener('click', showGoToLineDialog);
    goToLineOkButton.addEventListener('click', goToLine);
    goToLineCancelButton.addEventListener('click', hideGoToLineDialog);

    // NEW: Find input and button handlers
    findInput.addEventListener('input', updateFindNavButtons); // Enable/disable buttons based on input value
    findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            findNext(); // Pressing Enter in find box finds next
        }
    });

    nextFindButton.addEventListener('click', findNext);
    prevFindButton.addEventListener('click', findPrevious);

    // Allow Enter key to trigger "Go" in the dialog
    goToLineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent default form submission
            goToLine();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideGoToLineDialog();
            contentDiv.focus(); // Re-focus the editor
        }
    });

    // Sync scrolling between content and line numbers
    contentDiv.addEventListener('scroll', () => {
        lineNumbersDiv.scrollTop = contentDiv.scrollTop;
    });

    // Handle input events: update line numbers, scroll caret, trigger custom events
    contentDiv.addEventListener('input', (e) => {
        updateLineNumbers();
        scrollCaretIntoView(contentDiv);
        pushToHistory(); // Debounced history push

        // Update lastTypedChar for smart indentation logic
        if (e.inputType === 'insertText') {
            lastTypedChar = e.data;
        } else {
            lastTypedChar = ''; // Reset for other input types (e.g., delete, paste)
        }

        // Call dynamically set oninput handler (e.g., editor.oninput = fn)
        if (_onInputHandler) {
            try {
                _onInputHandler.call(editorContainerWrapper, e, editorContainerWrapper.value);
            } catch (err) {
                console.error("Error executing programmatic oninput handler:", err);
            }
        }
        // Call original oninput handler from HTML attribute
        executeAttributeHandler(originalOnInputAttribute, editorContainerWrapper, e, editorContainerWrapper.value);

        // Dispatch a custom 'input' event on the outermost container for consistency
        editorContainerWrapper.dispatchEvent(new CustomEvent('input', {
            detail: { value: editorContainerWrapper.value },
            bubbles: true, // Allow event to bubble up
            composed: true // Allow event to cross shadow DOM boundaries (if applicable)
        }));
    });

    // Handle blur event: trigger custom 'change' event
    contentDiv.addEventListener('blur', () => {
        pushToHistory(true); // Force push on blur to ensure last state is saved

        // Call dynamically set onchange handler (e.g., editor.onchange = fn)
        if (_onChangeHandler) {
            try {
                _onChangeHandler.call(editorContainerWrapper, editorContainerWrapper.value);
            } catch (err) {
                console.error("Error executing programmatic onchange handler:", err);
            }
        }
        // Call original onchange handler from HTML attribute
        executeAttributeHandler(originalOnChangeAttribute, editorContainerWrapper, editorContainerWrapper.value);

        // Dispatch a custom 'change' event on the outermost container
        editorContainerWrapper.dispatchEvent(new CustomEvent('change', {
            detail: { value: editorContainerWrapper.value },
            bubbles: true,
            composed: true
        }));
    });

    // Handle special keydown events: Tab, Enter, and bracket typing, and Find shortcuts
    contentDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault(); // Prevent focus loss

            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            range.insertNode(document.createTextNode('\t')); // Insert actual tab character
            range.collapse(false); // Collapse range to end of insertion
            scrollCaretIntoView(contentDiv);
            lastTypedChar = '\t'; // Update last typed character
            pushToHistory(); // Push after explicit tab insertion
        } else if (e.key === 'Enter') {
            e.preventDefault(); // Prevent default browser new line behavior

            const originalCaret = getCaretPosition(contentDiv);
            const currentText = contentDiv.textContent;
            let lines = currentText.split('\n');
            const targetLineIndex = originalCaret.line - 1; // 0-indexed current line

            // --- Smart De-indentation for Closing Brackets ---
            let shouldDeindentClosingBracket = false;
            // Check if the last typed char was a closing bracket AND it's the last significant char on the line
            // AND the line doesn't also contain its opening counterpart before the caret
            if (['}', ']', ')'].includes(lastTypedChar) && targetLineIndex >= 0) {
                const lineContentWhereBracketWasTyped = lines[targetLineIndex];
                // Trimmed line to check if bracket is effectively at the start/only char
                const trimmedLine = lineContentWhereBracketWasTyped.trim();

                let hasOpeningCounterpart = false;
                switch(lastTypedChar) {
                    case '}': hasOpeningCounterpart = lineContentWhereBracketWasTyped.includes('{'); break;
                    case ']': hasOpeningCounterpart = lineContentWhereBracketWasTyped.includes('['); break;
                    case ')': hasOpeningCounterpart = lineContentWhereBracketWasTyped.includes('('); break;
                }

                // De-indent if bracket is the main content of the line OR
                // if it's the last typed char and no opening counterpart *before* it on the same line
                if (trimmedLine === lastTypedChar ||
                   (!hasOpeningCounterpart && lineContentWhereBracketWasTyped.endsWith(lastTypedChar))
                ) {
                    shouldDeindentClosingBracket = true;
                }
            }

            if (shouldDeindentClosingBracket && lines[targetLineIndex] && lines[targetLineIndex].startsWith('\t')) {
                lines[targetLineIndex] = lines[targetLineIndex].substring(1); // Remove one tab
            }
            // --- End Smart De-indentation ---

            const currentLineContent = lines[targetLineIndex] || '';

            // Find character index within the current line based on visual caret column
            let charIndexInLine = 0;
            let visualColCounter = 0;
            for(let i = 0; i < currentLineContent.length; i++) {
                if (visualColCounter >= originalCaret.column) {
                    charIndexInLine = i;
                    break;
                }
                if (currentLineContent[i] === '\t') {
                    visualColCounter += TAB_SPACES;
                } else {
                    visualColCounter += 1;
                }
                charIndexInLine = i + 1; // If loop finishes, caret is at end or beyond
            }

            const contentBeforeCaretInLine = currentLineContent.substring(0, charIndexInLine);
            const contentAfterCaretInLine = currentLineContent.substring(charIndexInLine);

            let calculatedIndentLevel = 0;

            // Calculate base indentation from the current line's leading tabs
            const leadingTabsMatch = contentBeforeCaretInLine.match(/^\t*/);
            const leadingTabs = leadingTabsMatch ? leadingTabsMatch[0].length : 0;
            calculatedIndentLevel = leadingTabs;


            // Adjust indentation for opening brackets on the current line before caret
            const bracketOpenings = (contentBeforeCaretInLine.match(/[{[(]/g) || []).length;
            const bracketClosings = (contentBeforeCaretInLine.match(/[}\])]/g) || []).length;
            calculatedIndentLevel += (bracketOpenings - bracketClosings);

            // Handle special case: if Enter is pressed *before* a closing bracket
            // e.g., `if (true) {\n\t|}`  -> pressing Enter here should de-indent new line
            const trimmedContentAfterCaret = contentAfterCaretInLine.trim();
            if (trimmedContentAfterCaret.length > 0 && ['}', ']', ')'].includes(trimmedContentAfterCaret.charAt(0))) {
                calculatedIndentLevel = Math.max(0, calculatedIndentLevel - 1);
            }

            const newIndent = '\t'.repeat(Math.max(0, calculatedIndentLevel)); // Ensure non-negative indent

            // Update lines array with split content and new line
            lines[targetLineIndex] = contentBeforeCaretInLine;
            lines.splice(originalCaret.line, 0, newIndent + contentAfterCaretInLine);

            contentDiv.textContent = lines.join('\n'); // Update DOM

            // Set caret to the beginning of the new line's indentation
            const newCaretLine = originalCaret.line + 1;
            const newCaretColumn = newIndent.length * TAB_SPACES;
            setCaretPosition(contentDiv, newCaretLine, newCaretColumn);

            scrollCaretIntoView(contentDiv);
            updateLineNumbers();
            lastTypedChar = '\n'; // Mark last typed as newline for subsequent logic

            // Manually trigger input event as contentDiv.textContent was directly modified
            contentDiv.dispatchEvent(new Event('input', { bubbles: true }));
            pushToHistory(true); // Force push on Enter
        } else if (['}', ']', ')'].includes(e.key)) {
            // Track the last typed character for smart de-indentation on Enter
            lastTypedChar = e.key;
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') { // Ctrl+F or Cmd+F
            e.preventDefault();
            findInput.focus(); // Focus the new find input
            findInput.select(); // Select existing text if any
        } else if (e.key === 'F3') { // F3 for find next
            e.preventDefault();
            findNext();
        } else if (e.shiftKey && e.key === 'F3') { // Shift+F3 for find previous
            e.preventDefault();
            findPrevious();
        }
        else {
            lastTypedChar = ''; // Reset for other keys
        }
    });

    // Beautify button click handler
    beautifyButton.addEventListener('click', () => {
        const lines = contentDiv.textContent.split('\n');
        let beautifiedLines = [];
        let currentIndentLevel = 0; // In terms of tab characters

        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.length === 0) {
                beautifiedLines.push('');
                return;
            }

            // De-indent if the line starts with a closing bracket
            if (trimmedLine.length > 0 && (trimmedLine.startsWith('}') || trimmedLine.startsWith(']') || trimmedLine.startsWith(')'))) {
                currentIndentLevel = Math.max(0, currentIndentLevel - 1);
            }

            const indent = '\t'.repeat(currentIndentLevel);
            beautifiedLines.push(indent + trimmedLine);

            // Increase indent for opening brackets
            currentIndentLevel += (trimmedLine.match(/[{[(]/g) || []).length;
            // Decrease indent for closing brackets (already handled for current line)
            currentIndentLevel -= (trimmedLine.match(/[}\])]/g) || []).length;

            currentIndentLevel = Math.max(0, currentIndentLevel); // Ensure non-negative
        });

        const originalCaretPos = getCaretPosition(contentDiv);
        contentDiv.textContent = beautifiedLines.join('\n');
        updateLineNumbers();
        // Attempt to restore caret position; may not be perfect after formatting
        setCaretPosition(contentDiv, originalCaretPos.line, originalCaretPos.column);
        scrollCaretIntoView(contentDiv);

        // Manually trigger input event after beautify
        contentDiv.dispatchEvent(new Event('input', { bubbles: true }));
        pushToHistory(true); // Force push after beautify
    });

    // ResizeObserver to update line numbers and caret visibility if container size changes
    const resizeObserver = new ResizeObserver(entries => {
        // No need to loop, as we observe specific elements and update globally
        updateLineNumbers();
        scrollCaretIntoView(contentDiv);
    });
    resizeObserver.observe(editorContainerWrapper); // Observe the root of the editor
    resizeObserver.observe(contentDiv); // Observe the content area for its scrollable size

    return editorContainerWrapper;
}

/**
 * Public function to create a new code editor programmatically.
 * @param {string} initialContent - The initial text content for the editor.
 * @returns {HTMLElement} The DOM element representing the code editor.
 */
export function createTexCode(initialContent = '') {
    return setupCodeEditorInstance(initialContent);
}

// --- DOM Observation for <textcode> tags ---

/**
 * Observes the DOM for `<textcode>` elements, converts them into
 * enhanced code editors, and handles dynamically added elements.
 */
function observeTextcodeElements() {
    // Initial scan for existing <textcode> elements on page load
    document.querySelectorAll('textcode').forEach(textcodeElement => {
        const initialContent = textcodeElement.textContent.trim();
        const parentContainer = textcodeElement.parentNode;
        if (parentContainer) {
            const editorDom = setupCodeEditorInstance(initialContent, textcodeElement);
            parentContainer.replaceChild(editorDom, textcodeElement);
        } else {
            console.warn("Found <textcode> element without a parent, cannot convert:", textcodeElement);
        }
    });

    // MutationObserver to detect dynamically added <textcode> elements
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    // Check if the added node itself is a <textcode>
                    if (node.nodeType === 1 && node.tagName === 'TEXTCODE') {
                        const initialContent = node.textContent.trim();
                        const parentContainer = node.parentNode;
                        if (parentContainer) {
                            const editorDom = setupCodeEditorInstance(initialContent, node);
                            parentContainer.replaceChild(editorDom, node);
                        }
                    } else if (node.nodeType === 1) {
                        // Check for <textcode> elements within added subtrees
                        node.querySelectorAll('textcode').forEach(textcodeElement => {
                            const initialContent = textcodeElement.textContent.trim();
                            const parentContainer = textcodeElement.parentNode;
                            if (parentContainer) {
                                const editorDom = setupCodeEditorInstance(initialContent, textcodeElement);
                                parentContainer.replaceChild(editorDom, textcodeElement);
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
    observeTextcodeElements();
});



