


// ./ux/textCode.js

import {
    TAB_SPACES,
    HISTORY_DEBOUNCE_TIME,
    injectStyles,
    getCaretPosition,
    setCaretPosition,
    scrollCaretIntoView,
    editorHtml
} from './textCodeUI.js';

// --- Module-level Variables ---
let lastTypedChar = ''; // Tracks the last typed character for smart indentation

// --- Core Editor Setup Function ---

/**
 * Sets up a code editor instance, handling DOM creation, event listeners,
 * and property emulation.
 * @param {string|Array<Object>} initialContent - The initial text content or an array of page objects.
 * @param {HTMLElement|null} originalElement - The original <textcode> element if converting, otherwise null.
 * @returns {HTMLElement} The outermost DOM element representing the code editor.
*/
function setupCodeEditorInstance(initialContent, originalElement = null) {
    injectStyles(); // Ensure styles are present

    // --- Pages and History Management ---
    let pages = [];
    let currentPageIndex = 0;

    const createNewPage = (content = '', title = 'Untitled') => ({
        title,
        content,
        history: [],
        historyPointer: -1,
        redoStack: []
    });

    if (Array.isArray(initialContent)) {
        pages = initialContent.map(page => ({
            title: page.title,
            content: page.content,
            history: [],
            historyPointer: -1,
            redoStack: []
        }));
    } else {
        pages.push(createNewPage(initialContent, originalElement?.title || 'Untitled'));
    }

    let historyTimeout = null; // For debouncing history pushes

    // --- Store original attributes for emulation ---
    const originalId = originalElement ? originalElement.id : null;
    const originalClass = originalElement ? originalElement.className : null;
    const originalTitle = originalElement ? originalElement.getAttribute('title') : null;
    const originalOnInputAttribute = originalElement ? originalElement.getAttribute('oninput') : null;
    const originalOnChangeAttribute = originalElement ? originalElement.getAttribute('onchange') : null;
    const originalOnSaveAttribute = originalElement ? originalElement.getAttribute('onsave') : null;
    const originalOnCloseAttribute = originalElement ? originalElement.getAttribute('onclose') : null;
    const originalOnRunAttribute = originalElement ? originalElement.getAttribute('onrun') : null;

    // --- Build UI with String Literals ---
    const editorContainerWrapper = document.createElement('div');
    editorContainerWrapper.className = `code-editor-container-wrapper ${originalClass || ''}`;
    if (originalId) {
        editorContainerWrapper.id = originalId;
    }
    if (originalTitle) {
        editorContainerWrapper.setAttribute('title', originalTitle);
    }
    editorContainerWrapper.innerHTML = editorHtml;

    // --- Get References to DOM Elements ---
    const menuBar = editorContainerWrapper.querySelector('.code-editor-menu-bar');
    const undoButton = editorContainerWrapper.querySelector('.undo-btn');
    const redoButton = editorContainerWrapper.querySelector('.redo-btn');
    const selectAllButton = editorContainerWrapper.querySelector('.select-all-btn');
    const goToLineButton = editorContainerWrapper.querySelector('.goto-btn');
    const findButton = editorContainerWrapper.querySelector('.find-btn');
    const pagesButton = editorContainerWrapper.querySelector('.pages-btn');
    const runButton = editorContainerWrapper.querySelector('.run-btn');
    const saveButton = editorContainerWrapper.querySelector('.save-btn');
    const closeButton = editorContainerWrapper.querySelector('.close-btn');
    const findInput = editorContainerWrapper.querySelector('.find-input');
    const findInputCell = editorContainerWrapper.querySelector('.find-input-cell');
    const prevFindButton = editorContainerWrapper.querySelector('.find-prev-btn');
    const prevFindCell = prevFindButton.parentElement;
    const nextFindButton = editorContainerWrapper.querySelector('.find-next-btn');
    const nextFindCell = nextFindButton.parentElement;
    const findCloseButton = editorContainerWrapper.querySelector('.find-close-btn');
    const findCloseCell = findCloseButton.parentElement;
    const lineNumbersDiv = editorContainerWrapper.querySelector('.code-editor-line-numbers');
    const contentDiv = editorContainerWrapper.querySelector('.code-editor-content');
    const beautifyButton = editorContainerWrapper.querySelector('.beautify-btn');
    const goToLineDialog = editorContainerWrapper.querySelector('.code-editor-goto-dialog');
    const goToLineInput = goToLineDialog.querySelector('input[type="number"]');
    const goToLineOkButton = goToLineDialog.querySelector('.goto-ok');
    const goToLineCancelButton = goToLineDialog.querySelector('.cancel');
    const titleBarRow = editorContainerWrapper.querySelector('.code-editor-title-bar-row');
    const titleTextSpan = editorContainerWrapper.querySelector('.code-editor-title-bar .title-text');
    const pagesPrevButton = editorContainerWrapper.querySelector('.pages-prev-btn');
    const pagesNextButton = editorContainerWrapper.querySelector('.pages-next-btn');
    const pagesMenuTitleInput = editorContainerWrapper.querySelector('.pages-menu-title-input');
    const pagesMenuDropdown = editorContainerWrapper.querySelector('.pages-menu-dropdown');
    const pagesCloseButton = editorContainerWrapper.querySelector('.pages-close-btn');

    const pagesPrevCell = pagesPrevButton.parentElement;
    const pagesNextCell = pagesNextButton.parentElement;
    const pagesTitleCell = pagesMenuTitleInput.parentElement;
    const pagesDropdownCell = pagesMenuDropdown.parentElement;
    const pagesCloseCell = pagesCloseButton.parentElement;

    // Set initial content and title based on pages
    contentDiv.textContent = pages[currentPageIndex].content;
    titleTextSpan.textContent = pages[currentPageIndex].title;

    // Update UI based on original attributes
    if (originalTitle) {
        titleBarRow.style.display = '';
        titleTextSpan.textContent = originalTitle;
    } else {
        titleBarRow.style.display = 'none';
    }

    // --- INTERCEPT AND WRAP addEventListener/removeEventListener ---
    const originalAddEventListener = editorContainerWrapper.addEventListener;
    const originalRemoveEventListener = editorContainerWrapper.removeEventListener;

    const eventListenerCount = {
        run: 0,
        save: 0,
        close: 0
    };

    const updateButtonVisibility = (type) => {
        const button = {
            run: runButton.parentElement,
            save: saveButton.parentElement,
            close: closeButton.parentElement
        }[type];

        if (button) {
            button.style.display = (eventListenerCount[type] > 0) ? 'table-cell' : 'none';
        }
    };
    
    editorContainerWrapper.__addEventListener = originalAddEventListener.bind(editorContainerWrapper);
    editorContainerWrapper.__removeEventListener = originalRemoveEventListener.bind(editorContainerWrapper);
    
    editorContainerWrapper.addEventListener = function(type, listener, options) {
        if (eventListenerCount.hasOwnProperty(type)) {
            eventListenerCount[type]++;
            updateButtonVisibility(type);
        }
        this.__addEventListener(type, listener, options);
    };

    editorContainerWrapper.removeEventListener = function(type, listener, options) {
        if (eventListenerCount.hasOwnProperty(type)) {
            eventListenerCount[type]--;
            updateButtonVisibility(type);
        }
        this.__removeEventListener(type, listener, options);
    };
    // --- END INTERCEPT ---
    
    // Set initial button visibility based on original attributes
    if (originalOnRunAttribute) {
        eventListenerCount.run++;
    }
    if (originalOnSaveAttribute) {
        eventListenerCount.save++;
    }
    if (originalOnCloseAttribute) {
        eventListenerCount.close++;
    }
    updateButtonVisibility('run');
    updateButtonVisibility('save');
    updateButtonVisibility('close');


    // --- Emulate 'value', 'oninput', 'onchange', 'onsave', 'onclose', 'onrun', 'values', and 'valuesIndex' properties ---
    Object.defineProperty(editorContainerWrapper, 'value', {
        get() {
            return pages[currentPageIndex].content;
        },
        set(newValue) {
            if (typeof newValue !== 'string') {
                console.warn("Attempted to set 'value' to a non-string value:", newValue);
                newValue = String(newValue); // Coerce to string
            }
            pages[currentPageIndex].content = newValue;
            contentDiv.textContent = newValue;
            updateLineNumbers();
            const lines = newValue.split('\n');
            const lastLineLength = (lines.pop() || '').length;
            setCaretPosition(contentDiv, lines.length + 1, lastLineLength * TAB_SPACES);
            scrollCaretIntoView(contentDiv);
            pushToHistory(true);
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'values', {
        get() {
            return pages.map(page => ({ title: page.title, content: page.content }));
        },
        set(newValues) {
            if (Array.isArray(newValues)) {
                // Map the new values to page objects, and importantly, reset history
                pages = newValues.map(page => ({
                    title: page.title,
                    content: page.content,
                    history: [],
                    historyPointer: -1,
                    redoStack: []
                }));

                // Reset the current page index to the first page
                currentPageIndex = 0;

                // Update the UI with the first page's content and title
                const firstPage = pages[currentPageIndex];
                contentDiv.textContent = firstPage.content;
                titleTextSpan.textContent = firstPage.title;
                pagesMenuTitleInput.value = firstPage.title;

                // Initialize history for the new first page
                pushToHistory(true);

                // Update UI elements that depend on the pages array and current page
                updatePageMenuDropdown();
                updateLineNumbers();
                updateUndoRedoButtons();
                setCaretPosition(contentDiv, 1, 1);
                scrollCaretIntoView(contentDiv);

            } else {
                console.warn("Attempted to set 'values' to a non-array value:", newValues);
            }
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'valuesIndex', {
        get() {
            return currentPageIndex;
        },
        set(newIndex) {
            if (newIndex >= 0 && newIndex < pages.length) {
                switchPage(newIndex);
            } else {
                console.warn(`Attempted to set 'valuesIndex' to an invalid index: ${newIndex}`);
            }
        },
        configurable: true
    });

    let _onInputHandler = null;
    let _onChangeHandler = null;
    let _onSaveHandler = null;
    let _onCloseHandler = null;
    let _onRunHandler = null;

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

    Object.defineProperty(editorContainerWrapper, 'onsave', {
        get() { return _onSaveHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onSaveHandler = newValue;
                eventListenerCount.save++;
                updateButtonVisibility('save');
            } else {
                console.warn("Attempted to set onsave to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'onclose', {
        get() { return _onCloseHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onCloseHandler = newValue;
                eventListenerCount.close++;
                updateButtonVisibility('close');
            } else {
                console.warn("Attempted to set onclose to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'onrun', {
        get() { return _onRunHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onRunHandler = newValue;
                eventListenerCount.run++;
                updateButtonVisibility('run');
            } else {
                console.warn("Attempted to set onrun to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // --- Helper Functions for Editor Instance ---
    const updateLineNumbers = () => {
        const lines = contentDiv.textContent.split('\n').length;
        let lineNumberHtml = '';
        for (let i = 1; i <= lines; i++) {
            lineNumberHtml += `<div>${i}</div>`;
        }
        lineNumbersDiv.innerHTML = lineNumberHtml;
    };

    const updateUndoRedoButtons = () => {
        const currentPage = pages[currentPageIndex];
        undoButton.disabled = currentPage.historyPointer <= 0;
        redoButton.disabled = currentPage.redoStack.length === 0;
    };

    const updatePageMenuDropdown = () => {
        pagesMenuDropdown.innerHTML = pages.map((p, i) => `<option value="${i}" ${i === currentPageIndex ? 'selected' : ''}>${p.title}</option>`).join('');
    };

    const switchPage = (index) => {
        if (index < 0 || index >= pages.length) return;

        // Save the current page's content
        pages[currentPageIndex].content = contentDiv.textContent;

        // Switch to the new page
        currentPageIndex = index;
        const newPage = pages[currentPageIndex];

        // Restore the new page's content, history pointer, and redo stack
        const stateToRestore = newPage.history[newPage.historyPointer] || {
            content: newPage.content,
            caret: {
                line: 1,
                column: 1,
                charIndex: 0
            }
        };

        contentDiv.textContent = stateToRestore.content;
        titleTextSpan.textContent = newPage.title;
        pagesMenuTitleInput.value = newPage.title;

        // Apply caret position
        setCaretPosition(contentDiv, stateToRestore.caret.line, stateToRestore.caret.column);

        // If the new page has no history, initialize it
        if (newPage.history.length === 0) {
            pushToHistory(true);
        }

        updateLineNumbers();
        updateUndoRedoButtons();
        updatePageMenuDropdown();
        scrollCaretIntoView(contentDiv);
    };

    const pushToHistory = (force = false) => {
        const currentPage = pages[currentPageIndex];
        const currentState = {
            content: contentDiv.textContent,
            caret: getCaretPosition(contentDiv)
        };
        // Check if the content has actually changed since the last history state
        if (currentPage.history.length > 0) {
            const lastState = currentPage.history[currentPage.historyPointer];
            if (lastState.content === currentState.content &&
                lastState.caret.line === currentState.caret.line &&
                lastState.caret.column === currentState.caret.column) {
                return;
            }
        }
        if (historyTimeout) {
            clearTimeout(historyTimeout);
        }
        if (force) {
            currentPage.redoStack = [];
            currentPage.history = currentPage.history.slice(0, currentPage.historyPointer + 1);
            currentPage.history.push(currentState);
            currentPage.historyPointer = currentPage.history.length - 1;
            updateUndoRedoButtons();
        } else {
            historyTimeout = setTimeout(() => {
                currentPage.redoStack = [];
                currentPage.history = currentPage.history.slice(0, currentPage.historyPointer + 1);
                currentPage.history.push(currentState);
                currentPage.historyPointer = currentPage.history.length - 1;
                updateUndoRedoButtons();
            }, HISTORY_DEBOUNCE_TIME);
        }
    };

    const applyHistoryState = (state) => {
        contentDiv.textContent = state.content;
        updateLineNumbers();
        setCaretPosition(contentDiv, state.caret.line, state.caret.column);
        scrollCaretIntoView(contentDiv);
        updateUndoRedoButtons();
    };

    const undo = () => {
        const currentPage = pages[currentPageIndex];
        if (currentPage.historyPointer > 0) {
            currentPage.redoStack.push({
                content: contentDiv.textContent,
                caret: getCaretPosition(contentDiv)
            });
            currentPage.historyPointer--;
            applyHistoryState(currentPage.history[currentPage.historyPointer]);
        }
    };

    const redo = () => {
        const currentPage = pages[currentPageIndex];
        if (currentPage.redoStack.length > 0) {
            const stateToApply = currentPage.redoStack.pop();
            currentPage.history.push({
                content: contentDiv.textContent,
                caret: getCaretPosition(contentDiv)
            });
            currentPage.historyPointer = currentPage.history.length - 1;
            applyHistoryState(stateToApply);
        }
    };

    const selectAll = () => {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(contentDiv);
        selection.removeAllRanges();
        selection.addRange(range);
    };

    const showGoToLineDialog = () => {
        const currentLine = getCaretPosition(contentDiv).line;
        goToLineInput.value = currentLine;
        goToLineDialog.style.display = 'flex';
        goToLineInput.focus();
        goToLineInput.select();
    };

    const hideGoToLineDialog = () => {
        goToLineDialog.style.display = 'none';
    };

    const goToLine = () => {
        const lineNumber = parseInt(goToLineInput.value, 10);
        const totalLines = contentDiv.textContent.split('\n').length;
        if (isNaN(lineNumber) || lineNumber < 1 || lineNumber > totalLines) {
            goToLineInput.focus();
            goToLineInput.select();
            return;
        }
        setCaretPosition(contentDiv, lineNumber, 1);
        scrollCaretIntoView(contentDiv);
        hideGoToLineDialog();
        contentDiv.focus();
    };

    const toggleMenu = (menuName) => {
        const mainMenuButtons = [undoButton.parentElement, redoButton.parentElement, selectAllButton.parentElement, goToLineButton.parentElement, findButton.parentElement, pagesButton.parentElement, runButton.parentElement, saveButton.parentElement, closeButton.parentElement];
        const findMenuButtons = [findInputCell, prevFindCell, nextFindCell, findCloseCell];
        const pagesMenuButtons = [pagesPrevCell, pagesTitleCell, pagesDropdownCell, pagesNextCell, pagesCloseCell];

        // First, hide all menus
        mainMenuButtons.forEach(cell => cell.style.display = 'none');
        findMenuButtons.forEach(cell => cell.style.display = 'none');
        pagesMenuButtons.forEach(cell => cell.style.display = 'none');
        titleBarRow.style.display = 'none'; // Initially hide the title bar as well

        // Then, show the selected menu and the title bar if needed
        if (menuName === 'find') {
            findMenuButtons.forEach(cell => cell.style.display = 'table-cell');
            findInput.focus();
            findInput.select();
        } else if (menuName === 'pages') {
            pagesMenuButtons.forEach(cell => cell.style.display = 'table-cell');
            pagesMenuTitleInput.focus();
            pagesMenuTitleInput.select();
        } else { // 'main' menu or no specific menu selected
            mainMenuButtons.forEach(cell => cell.style.display = 'table-cell');
            if (originalTitle) {
                titleBarRow.style.display = '';
            }
            contentDiv.focus();
        }

        // Adjust visibility for optional buttons in the main menu
        if (menuName === 'main') {
            updateButtonVisibility('run');
            updateButtonVisibility('save');
            updateButtonVisibility('close');
        }
    };

    const findNext = () => {
        const query = findInput.value;
        if (!query) return;
        const content = contentDiv.textContent;
        let { charIndex: currentCaretIndex } = getCaretPosition(contentDiv);
        let startIndex = currentCaretIndex;
        if (content.substring(startIndex, startIndex + query.length) === query) {
            startIndex += query.length;
        }
        let foundIndex = content.indexOf(query, startIndex);
        if (foundIndex === -1) {
            foundIndex = content.indexOf(query, 0);
        }
        if (foundIndex !== -1) {
            setCaretPosition(contentDiv, null, null, foundIndex);
            scrollCaretIntoView(contentDiv);
        }
    };

    const findPrevious = () => {
        const query = findInput.value;
        if (!query) return;
        const content = contentDiv.textContent;
        let { charIndex: currentCaretIndex } = getCaretPosition(contentDiv);
        let endIndex = currentCaretIndex;
        if (content.substring(currentCaretIndex, currentCaretIndex + query.length) === query) {
            endIndex = currentCaretIndex - 1;
        } else {
            endIndex = currentCaretIndex - 1;
        }
        let foundIndex = content.lastIndexOf(query, endIndex);
        if (foundIndex === -1) {
            foundIndex = content.lastIndexOf(query, content.length);
        }
        if (foundIndex !== -1) {
            setCaretPosition(contentDiv, null, null, foundIndex);
            scrollCaretIntoView(contentDiv);
        }
    };

    const executeAttributeHandler = (handlerCode, scope, ...args) => {
        if (!handlerCode) return;
        try {
            const fn = new Function('event', 'value', handlerCode);
            fn.apply(scope, args);
        } catch (err) {
            console.error("Error executing attribute handler:", handlerCode, err);
        }
    };

    // --- Event Listeners ---
    // Initialize history for the first page
    if (pages.length > 0 && pages[0].history.length === 0) {
        pushToHistory(true);
    }
    updateUndoRedoButtons();
    updatePageMenuDropdown();
    pagesMenuTitleInput.value = pages[currentPageIndex].title;
    toggleMenu('main'); // Initial state set to show main menu

    undoButton.addEventListener('click', undo);
    redoButton.addEventListener('click', redo);
    selectAllButton.addEventListener('click', selectAll);
    goToLineButton.addEventListener('click', showGoToLineDialog);
    goToLineOkButton.addEventListener('click', goToLine);
    goToLineCancelButton.addEventListener('click', hideGoToLineDialog);
    findButton.addEventListener('click', () => toggleMenu('find'));
    findCloseButton.addEventListener('click', () => toggleMenu('main'));
    nextFindButton.addEventListener('click', findNext);
    prevFindButton.addEventListener('click', findPrevious);

    pagesButton.addEventListener('click', () => toggleMenu('pages'));
    pagesCloseButton.addEventListener('click', () => toggleMenu('main'));

    pagesPrevButton.addEventListener('click', () => {
        if (currentPageIndex > 0) {
            switchPage(currentPageIndex - 1);
        }
    });

    pagesNextButton.addEventListener('click', () => {
        if (currentPageIndex < pages.length - 1) {
            switchPage(currentPageIndex + 1);
        } else {
            // We are at the end, so create a new page
            const newPageTitle = `Untitled ${pages.length + 1}`;
            const newPage = createNewPage('', newPageTitle);
            pages.push(newPage);
            switchPage(pages.length - 1);
        }
    });

    pagesMenuDropdown.addEventListener('change', (e) => switchPage(parseInt(e.target.value, 10)));
    pagesMenuTitleInput.addEventListener('input', (e) => {
        pages[currentPageIndex].title = e.target.value;
        titleTextSpan.textContent = e.target.value;
        updatePageMenuDropdown();
    });

    saveButton.addEventListener('click', (e) => {
        if (_onSaveHandler) {
            try {
                _onSaveHandler.call(editorContainerWrapper, e, editorContainerWrapper.values);
            } catch (err) {
                console.error("Error executing programmatic onsave handler:", err);
            }
        }
        executeAttributeHandler(originalOnSaveAttribute, editorContainerWrapper, e, editorContainerWrapper.values);
        editorContainerWrapper.dispatchEvent(new CustomEvent('save', {
            detail: { values: editorContainerWrapper.values },
            bubbles: true,
            composed: true
        }));
    });

    runButton.addEventListener('click', (e) => {
        if (_onRunHandler) {
            try {
                _onRunHandler.call(editorContainerWrapper, e, editorContainerWrapper.value);
            } catch (err) {
                console.error("Error executing programmatic onrun handler:", err);
            }
        }
        executeAttributeHandler(originalOnRunAttribute, editorContainerWrapper, e, editorContainerWrapper.value);
        editorContainerWrapper.dispatchEvent(new CustomEvent('run', {
            detail: { value: editorContainerWrapper.value },
            bubbles: true,
            composed: true
        }));
    });

    closeButton.addEventListener('click', (e) => {
        if (_onCloseHandler) {
            try {
                _onCloseHandler.call(editorContainerWrapper, e, editorContainerWrapper.value);
            } catch (err) {
                console.error("Error executing programmatic onclose handler:", err);
            }
        }
        executeAttributeHandler(originalOnCloseAttribute, editorContainerWrapper, e, editorContainerWrapper.value);
        editorContainerWrapper.dispatchEvent(new CustomEvent('close', {
            detail: { value: editorContainerWrapper.value },
            bubbles: true,
            composed: true
        }));
    });

    goToLineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            goToLine();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideGoToLineDialog();
            contentDiv.focus();
        }
    });

    findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            findNext();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            toggleMenu('main');
        }
    });

    contentDiv.addEventListener('scroll', () => {
        lineNumbersDiv.scrollTop = contentDiv.scrollTop;
    });

    contentDiv.addEventListener('input', (e) => {
        pages[currentPageIndex].content = contentDiv.textContent;
        updateLineNumbers();
        scrollCaretIntoView(contentDiv);
        pushToHistory();
        if (e.inputType === 'insertText') {
            lastTypedChar = e.data;
        } else {
            lastTypedChar = '';
        }
        if (_onInputHandler) {
            try {
                _onInputHandler.call(editorContainerWrapper, e, editorContainerWrapper.value);
            } catch (err) {
                console.error("Error executing programmatic oninput handler:", err);
            }
        }
        executeAttributeHandler(originalOnInputAttribute, editorContainerWrapper, e, editorContainerWrapper.value);
        editorContainerWrapper.dispatchEvent(new CustomEvent('input', {
            detail: { value: editorContainerWrapper.value },
            bubbles: true,
            composed: true
        }));
    });

    contentDiv.addEventListener('blur', () => {
        pages[currentPageIndex].content = contentDiv.textContent;
        pushToHistory(true);
        if (_onChangeHandler) {
            try {
                _onChangeHandler.call(editorContainerWrapper, editorContainerWrapper.value);
            } catch (err) {
                console.error("Error executing programmatic onchange handler:", err);
            }
        }
        executeAttributeHandler(originalOnChangeAttribute, editorContainerWrapper, editorContainerWrapper.value);
        editorContainerWrapper.dispatchEvent(new CustomEvent('change', {
            detail: { value: editorContainerWrapper.value },
            bubbles: true,
            composed: true
        }));
    });

    contentDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            const range = selection.getRangeAt(0);
            range.insertNode(document.createTextNode('\t'));
            range.collapse(false);
            scrollCaretIntoView(contentDiv);
            lastTypedChar = '\t';
            pushToHistory();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const originalCaret = getCaretPosition(contentDiv);
            const currentText = contentDiv.textContent;
            let lines = currentText.split('\n');
            const targetLineIndex = originalCaret.line - 1;

            let shouldDeindentClosingBracket = false;
            if (['}', ']', ')'].includes(lastTypedChar) && targetLineIndex >= 0) {
                const lineContentWhereBracketWasTyped = lines[targetLineIndex];
                const trimmedLine = lineContentWhereBracketWasTyped.trim();
                let hasOpeningCounterpart = false;
                switch (trimmedLine[0]) {
                    case '}':
                        hasOpeningCounterpart = lineContentWhereBracketWasTyped.includes('{');
                        break;
                    case ']':
                        hasOpeningCounterpart = lineContentWhereBracketWasTyped.includes('[');
                        break;
                    case ')':
                        hasOpeningCounterpart = lineContentWhereBracketWasTyped.includes('(');
                        break;
                }
                if (trimmedLine === lastTypedChar ||
                    (!hasOpeningCounterpart && lineContentWhereBracketWasTyped.startsWith(lastTypedChar))
                ) {
					
					
                    shouldDeindentClosingBracket = true;
                }
            }
            if (shouldDeindentClosingBracket && lines[targetLineIndex] && lines[targetLineIndex].startsWith('\t')) {
                lines[targetLineIndex] = lines[targetLineIndex].substring(1);
            }
            const currentLineContent = lines[targetLineIndex] || '';
            let charIndexInLine = 0;
            let visualColCounter = 0;
            for (let i = 0; i < currentLineContent.length; i++) {
                if (visualColCounter >= originalCaret.column) {
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
            const leadingTabsMatch = contentBeforeCaretInLine.match(/^\t*/);
            const leadingTabs = leadingTabsMatch ? leadingTabsMatch[0].length : 0;
            calculatedIndentLevel = leadingTabs;
            const bracketOpenings = (contentBeforeCaretInLine.match(/[{[(]/g) || []).length;
            const bracketClosings = (contentBeforeCaretInLine.match(/[}\])]/g) || []).length;
            calculatedIndentLevel += (bracketOpenings - bracketClosings);
            const trimmedContentAfterCaret = contentAfterCaretInLine.trim();
            if (trimmedContentAfterCaret.length > 0 && ['}', ']', ')'].includes(trimmedContentAfterCaret.charAt(0))) {
                calculatedIndentLevel = Math.max(0, calculatedIndentLevel - 1);
            }
            const newIndent = '\t'.repeat(Math.max(0, calculatedIndentLevel));
            lines[targetLineIndex] = contentBeforeCaretInLine;
            lines.splice(originalCaret.line, 0, newIndent + contentAfterCaretInLine);
            contentDiv.textContent = lines.join('\n');
            const newCaretLine = originalCaret.line + 1;
            const newCaretColumn = newIndent.length * TAB_SPACES;
            setCaretPosition(contentDiv, newCaretLine, newCaretColumn);
            scrollCaretIntoView(contentDiv);
            updateLineNumbers();
            lastTypedChar = '\n';
            contentDiv.dispatchEvent(new Event('input', { bubbles: true }));
            pushToHistory(true);
        } else if (['}', ']', ')'].includes(e.key)) {
            lastTypedChar = e.key;
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            toggleMenu('find');
        } else if (e.key === 'F3') {
            e.preventDefault();
            findNext();
        } else if (e.shiftKey && e.key === 'F3') {
            e.preventDefault();
            findPrevious();
        } else {
            lastTypedChar = '';
        }
    });
	
	beautifyButton.addEventListener('click', () => {
		
		const originalScrollTop = contentDiv.scrollTop;
		const originalScrollLeft = contentDiv.scrollLeft;

		
		
        const lines = contentDiv.textContent.split('\n');
        let beautifiedLines = [];
        let currentIndentLevel = 0;
		//skip inside of strings
		var isAtStr= false;
		var atStrChar;
        var isAtMultiComment=false;
        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.length === 0) {
                beautifiedLines.push('');
                return;
            }
            // Check for closing brackets at the start of the line, which should de-indent
            // skip because tab accounted for closing bracket.
			var skipBracket=0;
			if (!isAtStr&&!isAtMultiComment&&trimmedLine.length > 0 && (trimmedLine.startsWith('}') || trimmedLine.startsWith(']') || trimmedLine.startsWith(')'))) {
                currentIndentLevel = Math.max(0, currentIndentLevel - 1);
				skipBracket=1;
            }
            
            
			if(isAtMultiComment)
			{
				beautifiedLines.push(line);
			}
			else
			{
				const indent = '\t'.repeat(currentIndentLevel);
				beautifiedLines.push(indent + trimmedLine);
			}

            var strLen= trimmedLine.length;
			
			
			for(var i = skipBracket; i < strLen;i++)
			{
				var c=trimmedLine[i];
				if(isAtStr)
				{
					// skip charactures and escaped string charactures.
					//implement here.
					//check ending string characture get out of isAtStr
                    if (c === atStrChar && (i === 0 || trimmedLine[i - 1] !== '\\')) {
                        isAtStr = false;
                    }
				}
				else if(isAtMultiComment)
				{
					if(c=='*'&&i+1<strLen&&trimmedLine[i+1]=='/')
					{
						isAtMultiComment=false;
						i++;
					}
				}
				else
				{
					// count brackets incountered
					if(c=="'"||c=='"'||c=="`")
					{
						isAtStr=true;
						atStrChar=c;
					}
					else if(c=='/'&&i+1<strLen&&trimmedLine[i+1]=='/')
					{
						// skip rest of line.
						break;
					}
					else if(c=='/'&&i+1<strLen&&trimmedLine[i+1]=='*')
					{
						isAtMultiComment=true;
						i++;
					}
					else if(c=='{' || c=='[' || c=='(')
					{
						currentIndentLevel++;
					}
					else if(c=='}' || c==']' || c==')')
					{
						currentIndentLevel = Math.max(0, currentIndentLevel-1);
					}
				}
				
			}
            
            
            
            currentIndentLevel = Math.max(0, currentIndentLevel);
			

        });
		
		
        const originalCaretPos = getCaretPosition(contentDiv);
        contentDiv.textContent = beautifiedLines.join('\n');
        updateLineNumbers();
        setCaretPosition(contentDiv, originalCaretPos.line, originalCaretPos.column);
        scrollCaretIntoView(contentDiv);
        contentDiv.dispatchEvent(new Event('input', { bubbles: true }));
        pushToHistory(true);
		
		
		
		contentDiv.scrollTop = originalScrollTop;
		contentDiv.scrollLeft = originalScrollLeft;

		
    });

    const resizeObserver = new ResizeObserver(entries => {
        updateLineNumbers();
        scrollCaretIntoView(contentDiv);
    });
    resizeObserver.observe(editorContainerWrapper);
    resizeObserver.observe(contentDiv);

    return editorContainerWrapper;
}

/**
 * Public function to create a new code editor programmatically.
 * @param {string|Array<Object>} initialContent - The initial text content or an array of page objects.
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
    document.querySelectorAll('textcode').forEach(textcodeElement => {
        let initialContent = textcodeElement.textContent.trim();
        const pagesAttribute = textcodeElement.getAttribute('pages');
        if (pagesAttribute) {
            try {
                initialContent = JSON.parse(pagesAttribute);
            } catch (e) {
                console.error("Invalid 'pages' attribute JSON:", e);
                initialContent = textcodeElement.textContent.trim();
            }
        }

        const parentContainer = textcodeElement.parentNode;
        if (parentContainer) {
            const editorDom = setupCodeEditorInstance(initialContent, textcodeElement);
            parentContainer.replaceChild(editorDom, textcodeElement);
        } else {
            console.warn("Found <textcode> element without a parent, cannot convert:", textcodeElement);
        }
    });

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.tagName === 'TEXTCODE') {
                        let initialContent = node.textContent.trim();
                        const pagesAttribute = node.getAttribute('pages');
                        if (pagesAttribute) {
                            try {
                                initialContent = JSON.parse(pagesAttribute);
                            } catch (e) {
                                console.error("Invalid 'pages' attribute JSON:", e);
                                initialContent = node.textContent.trim();
                            }
                        }
                        const parentContainer = node.parentNode;
                        if (parentContainer) {
                            const editorDom = setupCodeEditorInstance(initialContent, node);
                            parentContainer.replaceChild(editorDom, node);
                        }
                    } else if (node.nodeType === 1) {
                        node.querySelectorAll('textcode').forEach(textcodeElement => {
                            let initialContent = textcodeElement.textContent.trim();
                            const pagesAttribute = textcodeElement.getAttribute('pages');
                            if (pagesAttribute) {
                                try {
                                    initialContent = JSON.parse(pagesAttribute);
                                } catch (e) {
                                    console.error("Invalid 'pages' attribute JSON:", e);
                                    initialContent = textcodeElement.textContent.trim();
                                }
                            }
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
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

document.addEventListener('DOMContentLoaded', () => {
    observeTextcodeElements();
});


