


/*
do not remove!!!
this file is ./ux/appsView.js
*/

/**
 * A module for creating and managing an "Apps View" UI component,
 * similar to an iPhone's app switcher.
 *
 * It handles:
 * - Replacing <appsview> custom tags with the interactive UI.
 * - Dynamically creating necessary CSS.
 * - Managing full-screen and stack (overview) modes for app children.
 * - Drag-down gesture to switch from full-screen to stack mode using a dedicated handle.
 * - Clicking an app in stack mode to go to its full-screen view.
 * - Observing DOM changes to automatically apply to new <appsview> elements
 * and to changes within existing <appsview> elements (appendChild, innerHTML).
 */

// --- Constants and Configuration ---
const APPSVIEW_TAG = 'APPSVIEW';
const APPSVIEW_CLASS = 'appsview-container';
const APP_WRAPPER_CLASS = 'appsview-app-wrapper';
const DRAG_HANDLE_CLASS = 'appsview-drag-handle';
const DOT_INDICATOR_CLASS = 'appsview-dot-indicator'; // New class for the dot
const DRAG_HANDLE_HEIGHT = 40; // Original height of the drag handle area in pixels, now mostly conceptual for initial touch area
const DRAG_THRESHOLD = 50; // Pixels to drag down to trigger stack view (now up)
const DIAGONAL_DRAG_THRESHOLD_X = 50; // New: Pixels to drag right for diagonal check (now left)
const APP_SCALE_FACTOR = 0.6; // Scale for apps in stack view
const TRANSITION_DURATION = '0.3s'; // CSS transition duration

// --- Utility Functions ---

/**
 * Injects necessary base CSS into the document head.
 * This ensures the component has its essential styling.
 * The styles are now consolidated into core concerns: Base Container, App Wrapper/Content, Full-Screen, and Stack View.
 */
function injectBaseStyles() {
    if (document.getElementById('appsview-styles')) {
        return; // Styles already injected
    }

    const style = document.createElement('style');
    style.id = 'appsview-styles';
    style.textContent = `
        /* --- 1. Base Container & Core Layout (applies to both modes, provides foundational structure) --- */
        .${APPSVIEW_CLASS} {
            position: relative;
            width: 100vw;
            height: 100vh;
            overflow: hidden; /* Hide scrollbar initially */
            display: block;
            background-color: #f0f0f0;
            transition: background-color ${TRANSITION_DURATION} ease-out;
            box-sizing: border-box; /* Include padding in element's total width and height */
            padding-top: 0; /* Managed by stack-mode */
        }

        /* The drag handle is now a small dot indicator */
        .${DRAG_HANDLE_CLASS} {
            position: absolute;
            bottom: 10px; /* Position it in the bottom-right */
            right: 10px;
            width: 15px; /* Size of the dot */
            height: 15px;
            background-color: rgba(0, 0, 0, 0.3); /* Semi-transparent black dot */
            border-radius: 50%; /* Make it circular */
            z-index: 100;
            cursor: pointer; /* Still indicates clickability */
            opacity: 1; /* Visible in full mode */
            pointer-events: auto; /* Active in full mode */
            border: 1px solid rgba(255, 255, 255, 0.7); /* Added: White translucent border */
            transition: opacity ${TRANSITION_DURATION} ease-out;
        }

        /* --- 2. App Wrapper & Content Base (applies to all app instances, defines shared appearance & the transparent overlay) --- */
        .${APP_WRAPPER_CLASS} {
            position: absolute; /* Default for full-screen mode, overridden by flex in stack */
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            border-radius: 10px;
            overflow: hidden;
            cursor: pointer; /* Cursor indicates clickability for the wrapper itself */
            opacity: 0; /* Hidden by default, controlled by active classes */
            pointer-events: none; /* Inactive by default */
            z-index: 1; /* Default behind active full app */

            /* Transparent Overlay / Simulated Border (using inset box-shadow) */
            border: none !important; /* Ensure no actual border */
            box-shadow: inset 0 0 0 1px rgba(204, 204, 204, 0.8); /* Consistent light gray 1px inner border */
            padding: 0 !important;
            margin: 0 !important;
            transition: transform ${TRANSITION_DURATION} ease-out,
                        opacity ${TRANSITION_DURATION} ease-out,
                        width ${TRANSITION_DURATION} ease-out,
                        height ${TRANSITION_DURATION} ease-out,
                        z-index ${TRANSITION_DURATION} ease-out; /* Add z-index transition */
        }

        .${APP_WRAPPER_CLASS} > * { /* Target the direct child of the wrapper (the app content) */
            position: absolute;
            top: 0;
            left: 0;
            width: 100vw; /* Content scales with viewport, not wrapper */
            height: 100vh; /* Content scales with viewport, not wrapper */
            transform-origin: top left;
            transition: transform ${TRANSITION_DURATION} ease-out;
            overflow: auto;
            padding: 0 !important;
            margin: 0 !important;
            /* No default pointer-events here. It will be explicitly set by active-full or stack-mode */
        }

        /* --- 3. Full-Screen View State (What the active app looks like when full) --- */
        .${APP_WRAPPER_CLASS}.active-full {
            opacity: 1;
            pointer-events: auto; /* Wrapper is active and clickable */
            transform: translateX(0); /* Ensure no translation */
            z-index: 10; /* Bring to front */
            display: block; /* Explicitly ensure it's a block element */
        }

        .${APP_WRAPPER_CLASS}.active-full > * {
            transform: scale(1); /* Full size content */
            pointer-events: auto; /* IMPORTANT: Content IS interactive when in active-full mode */
        }

        /* --- 4. Stack View State (What all apps look like in the overview) --- */
        .${APPSVIEW_CLASS}.stack-mode {
            display: flex; /* Use flexbox for horizontal layout */
            flex-wrap: nowrap;
            column-gap: 0; /* Ensure 0px gap between apps */
            padding-top: ${DRAG_HANDLE_HEIGHT}px; /* Space for the drag handle above apps */
            padding-left: 0 !important;
            padding-right: 0 !important;
            overflow-x: auto; /* Enable horizontal scrolling */
            align-items: flex-start; /* Align items to the top */
            height: 100%;
        }

        .${APPSVIEW_CLASS}.stack-mode .${DRAG_HANDLE_CLASS} {
            opacity: 0;
            pointer-events: none; /* Hide and disable handle in stack mode */
        }

        .${APPSVIEW_CLASS}.stack-mode .${APP_WRAPPER_CLASS} {
            position: relative; /* Behave as flex items */
            flex-shrink: 0; /* Prevent shrinking */
            width: calc(100vw * ${APP_SCALE_FACTOR}); /* Explicit width for flex item */
            height: calc(100vh * ${APP_SCALE_FACTOR}); /* Explicit height for flex item */
            margin-bottom: 0;
            margin-left: 0 !important;
            margin-right: 0 !important;
            opacity: 1; /* All apps visible in stack mode */
            pointer-events: auto; /* Wrapper is clickable in stack mode to select */
            z-index: 5; /* All apps visible and clickable */
            display: block; /* Ensure all are block in stack mode */
        }

        .${APPSVIEW_CLASS}.stack-mode .${APP_WRAPPER_CLASS} > * {
            transform: scale(${APP_SCALE_FACTOR}); /* Apply the scale to the content */
            pointer-events: none; /* IMPORTANT: Content is NOT interactive in stack mode */
        }
    `;
    document.head.appendChild(style);
}

/**
 * Manages the state and appearance of an individual AppsView instance.
 */
class AppsViewController {
    constructor(element) {
        this.element = element; // The main <appsview> container
        // this.apps = [];       // NO LONGER USED: Array of app wrapper elements (each containing an actual app content)
        this.currentIndex = 0; // Index of the currently active full-screen app
        this.isStackMode = false;
        this.internalObserver = null; // MutationObserver for internal changes
        this.dragHandle = null; // Reference to the drag handle element
        this.lastScrollPosition = 0; // Store the last scroll position in stack mode

        // Instance-specific drag state
        this.isDragging = false;
        this.startY = 0;
        this.startX = 0; // New: To track X position for diagonal drag
        this.isInitialDragAreaInteraction = false;

        // Bind event handlers once to ensure 'this' context is always correct
        this._boundHandleMouseDown = this.handleMouseDown.bind(this);
        this._boundHandleTouchStart = this.handleTouchStart.bind(this);
        this._boundHandleAppClick = this.handleAppClick.bind(this);
        this._boundHandleScroll = this.handleScroll.bind(this); // New scroll handler
        // Global document listeners, bound to 'this'
        this._boundHandleMouseMoveGlobal = this._handleMouseMoveGlobal.bind(this);
        this._boundHandleMouseUpGlobal = this._handleMouseUpGlobal.bind(this);
        this._boundHandleTouchMoveGlobal = this._handleTouchMoveGlobal.bind(this);
        this._boundHandleTouchEndGlobal = this._handleTouchEndGlobal.bind(this);

        // Initial setup
        this.initDOM();
        this.addEventListeners(); // Adds click listener to the container and drag listeners to main element
        this.observeInternalChanges(); // Start observing internal changes
        this.showApp(this.currentIndex, false); // Show the first app initially without animation
    }

    /**
     * Gets all current app wrapper elements from the DOM.
     * This replaces the need for a `this.apps` array.
     * @returns {HTMLElement[]} An array of app wrapper elements.
     */
    _getAppWrappers() {
        return Array.from(this.element.querySelectorAll(`.${APP_WRAPPER_CLASS}`));
    }

    /**
     * Initializes or re-initializes the DOM structure for the apps view.
     * This method is crucial for handling innerHTML and appendChild changes.
     */
    initDOM() {
        this.element.classList.add(APPSVIEW_CLASS);

        // Disconnect internal observer *before* making DOM changes within initDOM
        // This is crucial to prevent the observer from re-triggering itself.
        if (this.internalObserver) {
            console.log(`[AppsView-${this.element.id || 'unknown'}] Disconnecting internal observer before DOM re-init.`);
            this.internalObserver.disconnect();
            // Do NOT set internalObserver to null here. It will be re-connected at the end.
            // This prevents race conditions if a mutation occurs right after disconnect but before re-observe.
        }

        // Disconnect and remove old drag handle and its listeners if re-initializing
        if (this.dragHandle) {
            this.dragHandle.removeEventListener('mousedown', this._boundHandleMouseDown);
            this.dragHandle.removeEventListener('touchstart', this._boundHandleTouchStart);
            this.dragHandle.remove();
            this.dragHandle = null;
        }

        // Create and prepend the drag handle
        this.dragHandle = document.createElement('div');
        this.dragHandle.classList.add(DRAG_HANDLE_CLASS);
        this.element.prepend(this.dragHandle); // Add to the very beginning
        // Re-add listeners for the (potentially new) drag handle
        this.dragHandle.addEventListener('mousedown', this._boundHandleMouseDown);
        this.dragHandle.addEventListener('touchstart', this._boundHandleTouchStart, { passive: true });


        // 1. Unwrap existing app content from wrappers and remove old wrappers
        this._getAppWrappers().forEach(wrapper => {
            if (wrapper.parentNode === this.element && wrapper.firstElementChild) {
                // Move the actual app content back to be a direct child of appsview
                this.element.insertBefore(wrapper.firstElementChild, wrapper);
            }
            wrapper.remove(); // Remove the old wrapper div
        });


        // 2. Now, re-wrap all actual app content children that are direct children of appsview
        // We filter out our own internal elements (drag handle)
        const actualAppContentChildren = Array.from(this.element.children).filter(child =>
            child !== this.dragHandle && !child.classList.contains(APP_WRAPPER_CLASS)
        );

        actualAppContentChildren.forEach((child, index) => {
            const appWrapper = document.createElement('div');
            appWrapper.classList.add(APP_WRAPPER_CLASS);
            appWrapper.dataset.appIndex = index; // Store index for later use

            // Insert wrapper *before* the child, then move child into wrapper
            this.element.insertBefore(appWrapper, child);
            appWrapper.appendChild(child);
        });

        // After DOM manipulation, ensure observer is re-connected.
        this.observeInternalChanges();

        const currentAppsCount = this._getAppWrappers().length;
        // If no apps are present after re-initialization, reset index
        if (currentAppsCount === 0) {
            this.currentIndex = 0;
            this.isStackMode = false;
            this.element.classList.remove('stack-mode');
        } else if (this.currentIndex >= currentAppsCount) {
            // If current index is out of bounds (e.g., app removed), go to last app
            this.currentIndex = currentAppsCount - 1;
        }
        // Always call showApp to apply correct display/classes based on new structure
        this.showApp(this.currentIndex, false); // Keep false to avoid initial animation
    }

    /**
     * Sets up an internal MutationObserver to watch for changes within this AppsView instance.
     * This handles `appendChild`, `removeChild`, and `innerHTML` changes.
     */
    observeInternalChanges() {
        if (this.internalObserver) {
            // If already connected, nothing to do. This check prevents connecting multiple observers.
            return;
        }

        this.internalObserver = new MutationObserver(mutations => {
            // Filter mutations to only react to changes in the immediate children of the appsview element
            // that involve actual app content (not our wrappers or drag handle).
            const hasRelevantChanges = mutations.some(mutation => {
                if (mutation.type === 'childList' && mutation.target === this.element) {
                    // Check if added/removed nodes are actual app content, not our wrappers or drag handle
                    const addedRelevant = Array.from(mutation.addedNodes).some(node =>
                        node.nodeType === Node.ELEMENT_NODE &&
                        node.tagName !== APPSVIEW_TAG && // Ensure it's not a nested appsview
                        !node.classList.contains(APP_WRAPPER_CLASS) &&
                        !node.classList.contains(DRAG_HANDLE_CLASS)
                    );
                    const removedRelevant = Array.from(mutation.removedNodes).some(node =>
                        node.nodeType === Node.ELEMENT_NODE &&
                        node.tagName !== APPSVIEW_TAG &&
                        !node.classList.contains(APP_WRAPPER_CLASS) &&
                        !node.classList.contains(DRAG_HANDLE_CLASS)
                    );
                    return addedRelevant || removedRelevant;
                }
                return false;
            });

            if (hasRelevantChanges) {
                console.log(`[AppsView-${this.element.id || 'unknown'}] Internal appsview content changed (MutationObserver detected), re-initializing DOM.`);
                // Disconnect immediately before calling initDOM to prevent recursion
                this.internalObserver.disconnect();
                this.internalObserver = null; // Clear reference to allow re-creation in initDOM
                this.initDOM();
            }
        });

        this.internalObserver.observe(this.element, { childList: true });
        console.log(`[AppsView-${this.element.id || 'unknown'}] Internal MutationObserver connected.`);
    }

    /**
     * Adds general event listeners. Drag listeners are now on the drag handle.
     */
    addEventListeners() {
        // App click listener remains on the main element as it's for stack mode interactions
        this.element.addEventListener('click', this._boundHandleAppClick);
        // Add scroll listener to store position when in stack mode
        this.element.addEventListener('scroll', this._boundHandleScroll);
    }

    /**
     * Handles mouse down event on the drag handle to potentially start dragging.
     */
    handleMouseDown(e) {
        if (!this.isStackMode) {
            this.isDragging = true;
            this.startY = e.clientY;
            this.startX = e.clientX; // Store initial X
            this.isInitialDragAreaInteraction = true;
            document.addEventListener('mousemove', this._boundHandleMouseMoveGlobal);
            document.addEventListener('mouseup', this._boundHandleMouseUpGlobal);
            e.preventDefault(); // Prevent default browser drag behavior
        }
    }

    /**
     * Handles touch start event on the drag handle to potentially start dragging.
     */
    handleTouchStart(e) {
        if (!this.isStackMode) {
            this.isDragging = true;
            this.startY = e.touches[0].clientY;
            this.startX = e.touches[0].clientX; // Store initial X
            this.isInitialDragAreaInteraction = true;
            document.addEventListener('touchmove', this._boundHandleTouchMoveGlobal, { passive: false });
            document.addEventListener('touchend', this._boundHandleTouchEndGlobal);
            e.preventDefault(); // Prevent scrolling interference
        }
    }

    /**
     * Handles mouse move event during dragging (global listener).
     */
    _handleMouseMoveGlobal(e) {
        if (!this.isDragging || !this.isInitialDragAreaInteraction) return;

        const deltaY = this.startY - e.clientY; // Inverted for upward drag
        const deltaX = this.startX - e.clientX; // Inverted for leftward drag

        // Check for diagonal up-left drag
        if (deltaY > DRAG_THRESHOLD && deltaX > DIAGONAL_DRAG_THRESHOLD_X && !this.isStackMode) {
            console.log(`[AppsView-${this.element.id || 'unknown'}] Diagonal drag detected: deltaY=${deltaY}, deltaX=${deltaX}. Entering stack mode.`);
            this.enterStackMode();
            this.isDragging = false; // Stop dragging after entering stack mode
            this._handleMouseUpGlobal(); // Clean up listeners immediately
        }
    }

    /**
     * Handles touch move event during dragging (global listener).
     */
    _handleTouchMoveGlobal(e) {
        if (!this.isDragging || !this.isInitialDragAreaInteraction) return;

        const deltaY = this.startY - e.touches[0].clientY; // Inverted for upward drag
        const deltaX = this.startX - e.touches[0].clientX; // Inverted for leftward drag

        // Check for diagonal up-left drag
        if (deltaY > DRAG_THRESHOLD && deltaX > DIAGONAL_DRAG_THRESHOLD_X && !this.isStackMode) {
            console.log(`[AppsView-${this.element.id || 'unknown'}] Diagonal touch drag detected: deltaY=${deltaY}, deltaX=${deltaX}. Entering stack mode.`);
            this.enterStackMode();
            this.isDragging = false; // Stop dragging after entering stack mode
            this._handleTouchEndGlobal(); // Clean up listeners immediately
        }
        e.preventDefault(); // Prevent default scroll behavior
    }

    /**
     * Handles mouse up event to stop dragging (global listener).
     */
    _handleMouseUpGlobal() {
        this.isDragging = false;
        this.isInitialDragAreaInteraction = false;
        document.removeEventListener('mousemove', this._boundHandleMouseMoveGlobal);
        document.removeEventListener('mouseup', this._boundHandleMouseUpGlobal);
    }

    /**
     * Handles touch end event to stop dragging (global listener).
     */
    _handleTouchEndGlobal() {
        this.isDragging = false;
        this.isInitialDragAreaInteraction = false;
        document.removeEventListener('touchmove', this._boundHandleTouchMoveGlobal);
        document.removeEventListener('touchend', this._boundHandleTouchEndGlobal);
    }

    /**
     * Handles click event on an app in stack mode to switch to full view.
     */
    handleAppClick(e) {
        // Only handle clicks if in stack mode
        if (!this.isStackMode) return;

        // Use closest to find the app wrapper, then get its data-app-index
        const appWrapper = e.target.closest(`.${APP_WRAPPER_CLASS}`);
        if (appWrapper) {
            const index = parseInt(appWrapper.dataset.appIndex, 10);
            if (!isNaN(index)) { // Ensure it's a valid number
                this.currentIndex = index; // Update the current index
                console.log(`[AppsView-${this.element.id || 'unknown'}] App clicked in stack mode: Index ${index}. Exiting stack mode.`);
                this.exitStackMode();
            }
        }
    }

    /**
     * Stores the current scroll position when the appsview is scrolled.
     * This is only relevant when in stack mode.
     */
    handleScroll() {
        if (this.isStackMode) {
            this.lastScrollPosition = this.element.scrollLeft;
        }
    }

    /**
     * Displays a specific app in full-screen mode and hides others.
     * @param {number} index - The index of the app to show.
     * @param {boolean} [animate=true] - Whether to apply transition effects.
     */
    showApp(index, animate = true) {
        const appWrappers = this._getAppWrappers(); // Get the current list of wrappers

        appWrappers.forEach((appWrapper, i) => {
            const appContent = appWrapper.firstElementChild;
            if (!appContent) return;

            // Manage transitions for app content and wrapper
            appContent.style.transition = animate ? `transform ${TRANSITION_DURATION} ease-out` : 'none';
            appWrapper.style.transition = animate ? `transform ${TRANSITION_DURATION} ease-out, opacity ${TRANSITION_DURATION} ease-out, width ${TRANSITION_DURATION} ease-out, height ${TRANSITION_DURATION} ease-out, z-index ${TRANSITION_DURATION} ease-out` : 'none';

            if (i === index) {
                appWrapper.classList.add('active-full');
                appWrapper.classList.remove('active-stack'); // Ensure removed if mistakenly present
                appWrapper.style.display = 'block'; // Ensure the active one is displayed
                appWrapper.style.pointerEvents = 'auto'; // Ensure wrapper is interactive
                appContent.style.pointerEvents = 'auto'; // Ensure content is interactive
            } else {
                appWrapper.classList.remove('active-full');
                appWrapper.classList.remove('active-stack');
                appWrapper.style.pointerEvents = 'none'; // Ensure wrapper is not interactive
                appContent.style.pointerEvents = 'none'; // Ensure content is not interactive

                // Crucial: Hide non-active apps completely
                // Delay display: 'none' slightly to allow opacity/transform transition to finish
                if (animate) {
                     setTimeout(() => {
                        // Re-check if the app is still not active, in case its status changed during the timeout
                        if (!appWrapper.classList.contains('active-full')) {
                            appWrapper.style.display = 'none';
                        }
                     }, parseFloat(TRANSITION_DURATION) * 1000 + 10); // A small buffer after transition
                } else {
                    appWrapper.style.display = 'none'; // Instantly hide if no animation
                }
            }

            // Force reflow after setting classes and transitions to ensure they apply correctly
            void appContent.offsetWidth;
            void appWrapper.offsetWidth;
        });

        // After setting classes, if not animating, clear transitions to prevent unexpected behavior
        if (!animate) {
            appWrappers.forEach(appWrapper => { // Use the dynamically queried list here too
                const appContent = appWrapper.firstElementChild;
                if (appContent) {
                    appContent.style.transition = '';
                    appWrapper.style.transition = '';
                }
            });
        }
    }

    /**
     * Transitions the view into stack (overview) mode.
     */
    enterStackMode() {
        if (this.isStackMode) return;
        this.isStackMode = true;
        this.element.classList.add('stack-mode');
        console.log(`[AppsView-${this.element.id || 'unknown'}] Entering stack mode.`);

        const appWrappers = this._getAppWrappers(); // Get the current list of wrappers

        // Ensure all app wrappers are visible (display: block) in stack mode
        appWrappers.forEach((appWrapper) => {
            appWrapper.classList.remove('active-full'); // Ensure full-screen class is removed
            appWrapper.style.display = 'block'; // Ensure it's displayed for flex layout
            appWrapper.style.pointerEvents = 'auto'; // Wrapper is clickable in stack mode
            if (appWrapper.firstElementChild) {
                appWrapper.firstElementChild.style.pointerEvents = 'none'; // Content is NOT interactive in stack mode
            }
        });

        // Apply scroll position AFTER a slight delay to allow CSS transitions to complete
        // and for the browser to recalculate layout.
        const transitionMs = parseFloat(TRANSITION_DURATION) * 1000;
        setTimeout(() => {
            if (this.element && this.isStackMode) { // Ensure still in stack mode and element exists
                this.element.scrollTo({
                    left: this.lastScrollPosition,
                    behavior: 'smooth'
                });
            }
        }, transitionMs + 50); // Add a small buffer (e.g., 50ms) after the transition duration
    }

    /**
     * Transitions the view out of stack (overview) mode to full-screen of the selected app.
     */
    exitStackMode() {
        if (!this.isStackMode) return;
        this.isStackMode = false;
        this.element.classList.remove('stack-mode');
        console.log(`[AppsView-${this.element.id || 'unknown'}] Exiting stack mode.`);

        this.showApp(this.currentIndex); // Show the selected app in full mode
    }

    /**
     * Exported function to create and return an AppsView DOM element.
     * Useful for programmatic creation.
     * @param {HTMLElement[]} children - Array of HTMLElement to be used as app content.
     * @param {object} [attributes={}] - Object of attributes to set on the main appsview element.
     * @returns {HTMLElement} The created appsview DOM element.
     */
    static createAppsView(children, attributes = {}) {
        const appsViewElement = document.createElement(APPSVIEW_TAG);
        for (const key in attributes) {
            if (Object.hasOwnProperty.call(attributes, key)) {
                appsViewElement.setAttribute(key, attributes[key]);
            }
        }
        children.forEach(child => appsViewElement.appendChild(child));
        // A new instance will be created by the global mutation observer
        return appsViewElement;
    }
}

// --- Initialization Logic ---

/**
 * Processes all <appsview> tags currently in the DOM.
 */
function processAppsViewTags() {
    injectBaseStyles(); // Ensure styles are there before processing
    document.querySelectorAll(APPSVIEW_TAG).forEach(appsViewElement => {
        if (!appsViewElement.classList.contains(APPSVIEW_CLASS)) {
            new AppsViewController(appsViewElement);
        }
    });
}

/**
 * Sets up a MutationObserver to detect dynamically added <appsview> tags
 * across the entire document body.
 */
function setupGlobalMutationObserver() {
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.tagName === APPSVIEW_TAG) {
                            console.log(`[GlobalObserver] Detected new <${APPSVIEW_TAG}> element:`, node);
                            new AppsViewController(node);
                        } else {
                            // Check for <appsview> inside added subtrees
                            node.querySelectorAll(APPSVIEW_TAG).forEach(appsViewElement => {
                                if (!appsViewElement.classList.contains(APPSVIEW_CLASS)) {
                                    console.log(`[GlobalObserver] Detected <${APPSVIEW_TAG}> within added subtree:`, appsViewElement);
                                    new AppsViewController(appsViewElement);
                                }
                            });
                        }
                    }
                });
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log("Global MutationObserver for <APPSVIEW> tags active.");
}

// Run initial processing on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    processAppsViewTags();
    setupGlobalMutationObserver();
    console.log("AppsView module initialized. MutationObservers active.");
});

// Export the createAppsView function
export const createAppsView = AppsViewController.createAppsView;



