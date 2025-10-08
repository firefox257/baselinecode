// ./ux/textCodeUI.js


// --- Constants ---
export const TAB_SPACES = 4;
export const LINE_HEIGHT_EM = 1.5; // Consistent line height for alignment
export const HISTORY_DEBOUNCE_TIME = 300; // Milliseconds to wait before saving history state

// --- Module-level Variables ---
export let stylesInjected = false; // Flag to ensure styles are injected only once

// --- Dynamic Style Injection (Self-executing function for immediate injection) ---
/**
 * Injects necessary CSS styles for the code editor into the document head.
 * Ensures styles are injected only once.
 */
export function injectStyles() {
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
            table-layout: fixed; /* NEW: Crucial for text-overflow and fixed column widths */
            border-bottom: 1px solid #eee; /* Separator from editor content */
            flex-shrink: 0; /* Prevent menu from shrinking */
        }

        /* NEW: Title Bar Styles */
        .code-editor-title-bar {
            background-color: #e9e9e9; /* Slightly darker background for title */
            font-weight: bold;
            color: #333;
            padding: 2px 10px; /* Reduced vertical padding */
            text-align: right; /* Align content to the right for truncation effect */
            vertical-align: middle; /* Center vertically in cell */
            border-bottom: 1px solid #ddd; /* Separator below title */
            box-sizing: border-box; /* Include padding in height */
            height: 24px; /* Reduced fixed height for the title bar row */
            display: table-cell; /* Ensure it behaves like a table cell for vertical alignment */
            overflow: hidden; /* Hide overflowing text */
            white-space: nowrap; /* Prevent text from wrapping */
            text-overflow: ellipsis; /* Show ellipsis for truncated text */
            direction: rtl; /* Truncate from the left */
        }

        .code-editor-title-bar .title-text {
            display: inline-block; /* Essential for direction: ltr to work */
            direction: ltr; /* Ensure text itself reads left-to-right */
            white-space: nowrap; /* Prevent wrapping within the title text */
        }


        .code-editor-menu-bar td {
            border: 1px solid #ddd; /* 1px border for each cell */
            text-align: center; /* Horizontal align center */
            vertical-align: middle; /* Vertical align middle */
            padding: 0; /* Remove default padding from td */
            width: 1%; /* NEW: Make button cells take minimal width when table-layout is fixed */
        }

        /* NEW: Set find input cell width to take up remaining space */
        .code-editor-menu-bar .find-input-cell {
            width: 160px; /* Allocate a fixed width for the cell */
            display: table-cell; /* Ensure it respects table layout */
        }
        .code-editor-menu-bar input.find-input {
            width: 100%; /* Make input fill its cell */
            padding: 2px 5px; /* Add some padding */
            box-sizing: border-box; /* Include padding in width */
            border: 1px solid #ccc;
            outline: none;
            font-size: 14px;
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
        /* REMOVED: Styles for the Find Input field as it's now in a dialog */
        /* REMOVED: code-editor-menu-bar .find-input */

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
            padding: 0; /* Changed from 10px to 0 */
            background-color: #f0f0f0; /* Lighter background for line numbers */
            color: #888; /* Darker text for line numbers */
            user-select: none; /* Prevents selection of line numbers */
            overflow-y: hidden; /* Scroll will be synced with editor's scroll */
            box-sizing: border-box; /* Include padding in element's total width/height */
        }

        .code-editor-line-numbers > div {
            height: ${LINE_HEIGHT_EM}em; /* Match editor line-height for perfect alignment */
            line-height: ${LINE_HEIGHT_EM}em; /* Ensure text within div also matches */
            padding: 0 10px; /* Add padding here for visual spacing */
        }

        /* Styles for the content editable area */
        .code-editor-content {
            flex-grow: 1; /* Takes remaining space */
            padding: 0; /* Changed from 10px to 0 */
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

        /* Add padding to the text content itself */
        .code-editor-content > div {
            padding: 0 10px;
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
        /* Styles for the pages menu */
        .code-editor-menu-bar .pages-menu-title-input {
            width: 100%;
            padding: 2px 5px;
            box-sizing: border-box;
            border: 1px solid #ccc;
            outline: none;
            font-size: 14px;
        }
    `;
    document.head.appendChild(style);
    stylesInjected = true;
}

/**
 * Gets the current line and column (visual, considering tabs) of the caret within an editable div.
 * @param {HTMLElement} editableDiv The contenteditable div.
 * @returns {{line: number, column: number, charIndex: number}} An object containing the current line, column, and absolute character index.
 */
export function getCaretPosition(editableDiv) {
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
export function setCaretPosition(editableDiv, line, column, charIndex = null) {
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
export function scrollCaretIntoView(editableDiv) {
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
        editableDiv.scrollLeft -= (editorRect.left - caretRect.left); // Should be editorRect.left - caretRect.left
    }
}

/**
 * The HTML template for the code editor's DOM structure.
 */
export const editorHtml = `
    <table class="code-editor-menu-bar">
        <tbody>
            <tr class="code-editor-title-bar-row">
                <td class="code-editor-title-bar" colspan="10">
                    <span class="title-text"></span>
                </td>
            </tr>
            <tr>
                <td><button class="undo-btn" title="Undo" disabled>↩️</button></td>
                <td><button class="redo-btn" title="Redo" disabled>↪️</button></td>
                <td><button class="select-all-btn" title="Select All">🅰️</button></td>
                <td><button class="select-bracket-btn" title="Select Bracket Content">🔗</button></td>
                <td><button class="goto-btn" title="Go to Line">#️⃣</button></td>
                <td><button class="find-btn" title="Find Text (Ctrl+F)">&#x1F50D;</button></td>
                <td><button class="pages-btn" title="Pages">📄</button></td>
                <td style="display: none;"><button class="run-btn" title="Run Code">&#x23F5;</button></td>
                <td style="display: none;"><button class="save-btn" title="Save">&#x1F4BE;</button></td>
                <td style="display: none;"><button class="close-btn" title="Close Editor">&#x2715;</button></td>
                <td colspan="4" class="find-input-cell" style="display: none;width:60px;"><input type="text" placeholder="Find..." class="find-input" ></td>
                <td style="display: none;"><button class="find-prev-btn" title="Previous">&#x25C0;</button></td>
                <td style="display: none;"><button class="find-next-btn" title="Next">&#x25B6;</button></td>
                <td style="display: none;"><button class="find-close-btn" title="Close Find">&#x2715;</button></td>
                <td style="display: none;"><button class="pages-prev-btn" title="Previous Page">&#x25C0;</button></td>
                <td style="display: none;" colspan="2"><input type="text" placeholder="Page Title" class="pages-menu-title-input"></td>
                <td style="display: none;" colspan="2"><select class="pages-menu-dropdown"></select></td>
                <td style="display: none;"><button class="pages-next-btn" title="Next Page">&#x25B6;</button></td>
                <td style="display: none;"><button class="pages-close-btn" title="Close Pages Menu">&#x2715;</button></td>
            </tr>
        </tbody>
    </table>
    <div class="code-editor-wrapper">
        <div class="code-editor-line-numbers"></div>
        <div class="code-editor-content" contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off"></div>
    </div>
    <div class="code-editor-beautify-button-container">
        <button class="beautify-btn" title="Beautify Code">&#x2728;</button>
    </div>
    <div class="code-editor-goto-dialog">
        <span>Go to Line:</span>
        <input type="number" min="1" value="1" />
        <div class="code-editor-goto-dialog-buttons">
            <button class="goto-ok">Go</button>
            <button class="cancel">Cancel</button>
        </div>
    </div>
`;
