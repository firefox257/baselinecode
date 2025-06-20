


/*

This is a module text cod editor.

Add functionality when a closing braket is presentand newline is tyoed to take away one tab in front of the clising braket if there are any tabs.
This way the closing braketa line up.


*/



// code-editor-module.js

(function() { // Using an IIFE for encapsulation

    const TAB_SPACES = 4;
    let lastTypedChar = ''; // New variable to track the last typed character

    // --- Dynamic Style Injection ---
    function injectStyles() {
        const styleId = 'code-editor-styles';
        if (document.getElementById(styleId)) return; // Avoid re-injecting

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .code-editor-container-wrapper { /* New wrapper for editor and its controls */
                position: relative; /* Needed for absolute positioning of the button */
                display: flex;
                flex-direction: column; /* Stack editor and footer vertically */
                width: 100%;
                height: 100%;
            }

            .code-editor-wrapper {
                display: flex;
                flex-grow: 1; /* Allow editor content to take available height */
                font-family: 'Fira Code', 'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
                font-size: 14px;
                line-height: 1.5; /* Ensure consistent line height for alignment */
                overflow: hidden; /* Prevent wrapper scrollbars unless needed */
            }

            .code-editor-line-numbers {
                flex-shrink: 0; /* Don't shrink */
                text-align: right;
                padding: 10px;
                background-color: #f0f0f0; /* Lighter background for line numbers */
                color: #888; /* Darker text for line numbers */
                user-select: none; /* Prevent selection of line numbers */
                overflow-y: hidden; /* Will be synced with editor's scroll */
            }

            .code-editor-line-numbers > div {
                height: 1.5em; /* Match line-height of editor for perfect alignment */
            }

            .code-editor-content {
                flex-grow: 1; /* Take remaining space */
                padding: 10px;
                outline: none; /* Remove default focus outline */
                overflow: auto; /* Enable scrolling */
                counter-reset: line; /* For potential future CSS line numbers */
                background-color: #ffffff; /* White background for editor content */
                color: #000000; /* Black font color for editor content */
                tab-size: ${TAB_SPACES}; /* This is the key CSS property! */
                -moz-tab-size: ${TAB_SPACES}; /* Firefox specific */
                white-space: pre; /* Ensure content does not wrap */
            }

            /* Styling for the beautify button, now positioned absolutely */
            .code-editor-beautify-button-container {
                position: absolute;
                bottom: 10px; /* Distance from bottom */
                right: 10px; /* Distance from right */
                z-index: 10; /* Ensure it's above the editor content */
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
            }

            .code-editor-beautify-button-container button:hover {
                background-color: #0056b3;
            }
        `;
        document.head.appendChild(style);
    }

    // --- Utility Functions ---
    function getCaretPosition(editableDiv) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return { line: 1, column: 1 };

        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(editableDiv);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        const textContent = editableDiv.textContent;
        const currentText = preCaretRange.toString();
        const lines = currentText.split('\n');

        // Adjust column for actual tab characters if they are present
        let column = lines[lines.length - 1].length;
        const lineContentUpToCaret = lines[lines.length - 1];
        // Count actual tab characters before the caret
        const tabCount = (lineContentUpToCaret.match(/\t/g) || []).length;
        // Each tab character takes up 1 char in textContent, but TAB_SPACES in visual width
        column = column - tabCount + (tabCount * TAB_SPACES);

        return {
            line: lines.length,
            column: column
        };
    }

    function setCaretPosition(editableDiv, line, column) {
        let textContent = editableDiv.textContent;
        let charIndex = 0;
        const lines = textContent.split('\n');

        // Convert target column (visual) to character index (actual)
        let currentVisualCol = 0;
        let targetCharIndexInLine = 0;
        for (let i = 0; i < line - 1 && i < lines.length; i++) {
            charIndex += lines[i].length + 1; // +1 for the newline character
        }

        const targetLineContent = lines[Math.min(line - 1, lines.length - 1)];

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
        charIndex += targetCharIndexInLine;

        if (charIndex > textContent.length) {
            charIndex = textContent.length;
        }

        const range = document.createRange();
        const selection = window.getSelection();

        // Handle empty div case
        if (editableDiv.firstChild) {
            // Check if charIndex is within the bounds of the text node
            if (charIndex > editableDiv.firstChild.length) {
                charIndex = editableDiv.firstChild.length; // Cap at max length
            }
            range.setStart(editableDiv.firstChild, charIndex);
            range.setEnd(editableDiv.firstChild, charIndex);
        } else {
            // For an empty div, set caret at the beginning
            range.setStart(editableDiv, 0);
            range.setEnd(editableDiv, 0);
        }

        selection.removeAllRanges();
        selection.addRange(range);
    }

    function scrollCaretIntoView(editableDiv) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        let caretRect;
        try {
            caretRect = range.getBoundingClientRect(); // Get position of the caret
        } catch (e) {
            // Sometimes getBoundingClientRect can fail on collapsed range in contenteditable
            // If it fails, try to get a more stable rect from the parent node of the caret
            const tempRange = document.createRange();
            if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
                tempRange.setStart(range.startContainer, range.startOffset - 1);
                tempRange.setEnd(range.startContainer, range.startOffset);
            } else if (range.startContainer.nodeType === Node.ELEMENT_NODE && range.startContainer.childNodes.length > 0) {
                tempRange.selectNode(range.startContainer.childNodes[Math.max(0, range.startOffset - 1)]);
            } else {
                tempRange.selectNode(editableDiv); // Fallback to editor's rect
            }
            caretRect = tempRange.getBoundingClientRect();
        }


        const editorRect = editableDiv.getBoundingClientRect();

        // Vertical Scrolling
        // Check if caret is below the visible area
        if (caretRect.bottom > editorRect.bottom) {
            editableDiv.scrollTop += (caretRect.bottom - editorRect.bottom);
        }
        // Check if caret is above the visible area
        else if (caretRect.top < editorRect.top) {
            editableDiv.scrollTop -= (editorRect.top - caretRect.top);
        }

        // Horizontal Scrolling
        // Check if caret is to the right of the visible area
        if (caretRect.right > editorRect.right) {
            editableDiv.scrollLeft += (caretRect.right - editorRect.right);
        }
        // Check if caret is to the left of the visible area
        else if (caretRect.left < editorRect.left) {
            editableDiv.scrollLeft -= (editorRect.left - caretRect.left);
        }
    }


    // --- Editor Creation Function ---
    function createCodeEditor(textcodeElement) {
        const initialContent = textcodeElement.textContent.trim();
        const parentContainer = textcodeElement.parentNode;

        // Create a new container to hold both the editor and the button
        const editorContainerWrapper = document.createElement('div');
        editorContainerWrapper.className = 'code-editor-container-wrapper';
        editorContainerWrapper.style.width = '100%';
        editorContainerWrapper.style.height = '100%';


        // Create editor wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'code-editor-wrapper';
        // The wrapper's width and height are now managed by editorContainerWrapper and flex-grow
        wrapper.style.border = '1px solid #ccc'; // Subtle border for light theme

        // Create beautify button container
        const beautifyButtonContainer = document.createElement('div');
        beautifyButtonContainer.className = 'code-editor-beautify-button-container';
        const beautifyButton = document.createElement('button');
        beautifyButton.innerHTML = '&#x2728;'; // Unicode for Sparkles (✨)
        beautifyButton.title = 'Beautify Code'; // Add a title for tooltip
        beautifyButtonContainer.appendChild(beautifyButton);


        // Create line numbers div
        const lineNumbers = document.createElement('div');
        lineNumbers.className = 'code-editor-line-numbers';

        // Create content editable div
        const contentDiv = document.createElement('div');
        contentDiv.className = 'code-editor-content';
        contentDiv.setAttribute('contenteditable', 'true');
        contentDiv.setAttribute('spellcheck', 'false'); // Disable spellcheck
        contentDiv.setAttribute('autocorrect', 'off'); // Disable autocorrect
        contentDiv.setAttribute('autocapitalize', 'off'); // Disable autocapitalize
        contentDiv.textContent = initialContent; // Set initial content

        // Append line numbers and content to the inner wrapper
        wrapper.appendChild(lineNumbers);
        wrapper.appendChild(contentDiv);

        // Append inner wrapper and button container to the new overall wrapper
        editorContainerWrapper.appendChild(wrapper);
        editorContainerWrapper.appendChild(beautifyButtonContainer);


        // Replace the <textcode> tag with the new editor structure
        parentContainer.replaceChild(editorContainerWrapper, textcodeElement);


        // --- Event Listeners and Logic ---

        // Sync scroll
        contentDiv.addEventListener('scroll', () => {
            lineNumbers.scrollTop = contentDiv.scrollTop;
        });

        // Update line numbers
        const updateLineNumbers = () => {
            const lines = contentDiv.textContent.split('\n').length;
            let lineNumberHtml = '';
            for (let i = 1; i <= lines; i++) {
                lineNumberHtml += `<div>${i}</div>`;
            }
            lineNumbers.innerHTML = lineNumberHtml;
        };

        // Initial update
        updateLineNumbers();

        // Handle input for line numbers and indentation
        contentDiv.addEventListener('input', (e) => {
            // Update lastTypedChar for the new functionality
            if (e.inputType === 'insertText') {
                lastTypedChar = e.data;
            } else {
                lastTypedChar = ''; // Reset if not a single character input
            }

            updateLineNumbers();
            scrollCaretIntoView(contentDiv); // Ensure caret is in view on general input
        });

        // Handle keydown events for tab and enter
        contentDiv.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault(); // Prevent default tab behavior (losing focus)
                const selection = window.getSelection();
                const range = selection.getRangeAt(0);

                // Insert an actual tab character
                range.insertNode(document.createTextNode('\t'));
                range.collapse(false); // Collapse range to end of insertion
                scrollCaretIntoView(contentDiv); // Scroll caret into view after tab
                lastTypedChar = '\t'; // Update last typed character
            } else if (e.key === 'Enter') {
                e.preventDefault(); // Prevent default enter (which might insert a <div> or <p>)

                const selection = window.getSelection();
                if (!selection.rangeCount) return;

                const range = selection.getRangeAt(0);
                const currentText = contentDiv.textContent;

                const { line: currentLineNum, column: currentColumn } = getCaretPosition(contentDiv);
                let lines = currentText.split('\n'); // Use 'let' because we might modify it

                // --- NEW LOGIC FOR DE-INDENTING CLOSING BRACKETS ON ENTER ---
                // Check if the last typed character was a closing bracket AND
                // if the current line does *not* contain an opening bracket of the same type.
                // This prevents de-indenting for () or {} on the same line.
                const targetLineIndex = currentLineNum - 1; // 0-indexed
                let shouldDeindentClosingBracket = false;

                if (['}', ']', ')'].includes(lastTypedChar) && targetLineIndex >= 0) {
                    const lineWhereBracketWasTyped = lines[targetLineIndex];
                    let hasOpeningCounterpart = false;

                    switch(lastTypedChar) {
                        case '}':
                            hasOpeningCounterpart = lineWhereBracketWasTyped.includes('{');
                            break;
                        case ']':
                            hasOpeningCounterpart = lineWhereBracketWasTyped.includes('[');
                            break;
                        case ')':
                            hasOpeningCounterpart = lineWhereBracketWasTyped.includes('(');
                            break;
                    }

                    // De-indent only if there isn't an opening counterpart on the same line
                    // OR if the line only contains the closing bracket and nothing else significant
                    // (e.g., if you type '{\n\t| \n}' and then enter after the last '}')
                    const trimmedLine = lineWhereBracketWasTyped.trim();
                    if (!hasOpeningCounterpart || (trimmedLine === lastTypedChar)) {
                        shouldDeindentClosingBracket = true;
                    }
                }

                if (shouldDeindentClosingBracket && lines[targetLineIndex].startsWith('\t')) {
                    lines[targetLineIndex] = lines[targetLineIndex].substring(1);
                }
                // --- END NEW LOGIC ---

                const currentLineContent = lines[currentLineNum - 1] || '';

                // Find the actual character index in the current line for the caret
                let charIndexInLine = 0;
                let visualColCounter = 0;
                for(let i = 0; i < currentLineContent.length; i++) {
                    if (visualColCounter >= currentColumn) {
                        charIndexInLine = i;
                        break;
                    }
                    if (currentLineContent[i] === '\t') {
                        visualColCounter += TAB_SPACES;
                    } else {
                        visualColCounter += 1;
                    }
                    charIndexInLine = i + 1;
                }

                const contentBeforeCaretInLine = currentLineContent.substring(0, charIndexInLine);
                const contentAfterCaretInLine = currentLineContent.substring(charIndexInLine);

                let calculatedIndentLevel = 0;

                // Calculate indentation based on previous lines
                for (let i = 0; i < currentLineNum - 1; i++) {
                    const line = lines[i].trim();
                    calculatedIndentLevel += (line.match(/[{[(]/g) || []).length;
                    calculatedIndentLevel -= (line.match(/[}\])]/g) || []).length;
                    calculatedIndentLevel = Math.max(0, calculatedIndentLevel);
                }

                // Now, consider the current line's content before the caret
                const lineBeforeCaretTrimmed = contentBeforeCaretInLine.trim();
                calculatedIndentLevel += (lineBeforeCaretTrimmed.match(/[{[(]/g) || []).length;
                calculatedIndentLevel -= (lineBeforeCaretTrimmed.match(/[}\])]/g) || []).length;
                calculatedIndentLevel = Math.max(0, calculatedIndentLevel);

                // If the content *after* the caret starts with a closing bracket,
                // de-indent the new line. This handles cases like pressing Enter just before a '}'
                // e.g., `\t|}` should result in `\n\t}`
                if (contentAfterCaretInLine.trim().length > 0 &&
                    (['}', ']', ')'].includes(contentAfterCaretInLine.trim().charAt(0)))
                ) {
                    calculatedIndentLevel = Math.max(0, calculatedIndentLevel - 1);
                }

                const newIndent = '\t'.repeat(calculatedIndentLevel);

                // Construct the new text content for the current line and the new line
                let newCurrentLine = contentBeforeCaretInLine;
                let newLine = newIndent + contentAfterCaretInLine;

                // Update the lines array
                lines[currentLineNum - 1] = newCurrentLine;
                lines.splice(currentLineNum, 0, newLine);

                const newTextContent = lines.join('\n');
                contentDiv.textContent = newTextContent;

                // Calculate new caret position
                // The caret should be at the end of the new indent on the new line
                const newCaretLine = currentLineNum + 1;
                const newCaretColumn = (newIndent.length + contentAfterCaretInLine.length) * TAB_SPACES; // Visual column at end of new line

                setCaretPosition(contentDiv, newCaretLine, newCaretColumn);
                scrollCaretIntoView(contentDiv);
                updateLineNumbers();

                lastTypedChar = '\n'; // Update last typed character to newline
            } else if (['}', ']', ')'].includes(e.key)) {
                // For other keys, just update lastTypedChar
                lastTypedChar = e.key;
            } else {
                lastTypedChar = ''; // Reset for other non-special keys
            }
        });

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

                // Adjust for closing brackets that start a line
                if (trimmedLine.length > 0 && (trimmedLine.startsWith('}') || trimmedLine.startsWith(']') || trimmedLine.startsWith(')'))) {
                    currentIndentLevel = Math.max(0, currentIndentLevel - 1);
                }

                const indent = '\t'.repeat(currentIndentLevel); // Use tab characters for indentation
                beautifiedLines.push(indent + trimmedLine);

                // Adjust for opening brackets
                currentIndentLevel += (trimmedLine.match(/[{[(]/g) || []).length;
                // Adjust for closing brackets (after current line has been indented)
                currentIndentLevel -= (trimmedLine.match(/[}\])]/g) || []).length;
                currentIndentLevel = Math.max(0, currentIndentLevel); // Ensure non-negative
            });

            const originalCaretPos = getCaretPosition(contentDiv);
            contentDiv.textContent = beautifiedLines.join('\n');
            updateLineNumbers();
            // Try to restore caret position, though it might not be perfect after beautification
            setCaretPosition(contentDiv, originalCaretPos.line, originalCaretPos.column);
            scrollCaretIntoView(contentDiv); // Scroll caret into view after beautify
        });

        // This ensures the editor resizes correctly if its parent resizes
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.target === parentContainer || entry.target === editorContainerWrapper || entry.target === contentDiv) {
                    updateLineNumbers();
                    scrollCaretIntoView(contentDiv); // Re-check caret visibility on resize
                }
            }
        });
        resizeObserver.observe(parentContainer);
        resizeObserver.observe(editorContainerWrapper);
        resizeObserver.observe(contentDiv); // Observe contentDiv for changes to its own size
    }

    // --- DOM Observation for <textcode> tags ---
    function observeTextcodeElements() {
        // Initial scan for existing <textcode> elements
        document.querySelectorAll('textcode').forEach(createCodeEditor);

        // Observe the document body for additions to detect dynamically added <textcode>
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.tagName === 'TEXTCODE') {
                            createCodeEditor(node);
                        } else if (node.nodeType === 1) {
                            // Check for <textcode> within added subtrees
                            node.querySelectorAll('textcode').forEach(createCodeEditor);
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
        injectStyles();
        observeTextcodeElements();

        // For demo: Add button to dynamically add new editors
        const addEditorBtn = document.getElementById('addEditor');
        if (addEditorBtn) {
            addEditorBtn.addEventListener('click', () => {
                const dynamicEditorsDiv = document.getElementById('dynamicEditors');
                const newEditorContainer = document.createElement('div');
                newEditorContainer.className = 'editor-container';
                newEditorContainer.style.height = '200px'; // Give dynamic editors a height
                newEditorContainer.style.border = '1px solid #ccc';
                newEditorContainer.style.marginBottom = '10px';

                newEditorContainer.innerHTML = `<textcode>
// New dynamic editor
function dynamicFunc() {
\tconsole.log("This was added dynamically!");
\tif (true) {
\t\tconsole.log("Nested block in dynamic editor.");
\t}
\t// Adding more lines to test vertical scrolling
\t// Line 1
\t// Line 2
\t// Line 3
\t// Line 4
\t// Line 5
\t// Line 6
\t// Line 7
\t// Line 8
\t// Line 9
\t// Line 10
\t// Line 11
\t// Line 12
\t// Line 13
\t// Line 14
\t// Line 15
\t// Line 16
\t// Line 17
\t// Line 18
\t// Line 19
\t// Line 20
\t// Line 21
\t// Line 22
\t// Line 23
\t// Line 24
\t// Line 25
}
                </textcode>`;
                dynamicEditorsDiv.appendChild(newEditorContainer);
            });
        }
    });

})(); // End of IIFE



