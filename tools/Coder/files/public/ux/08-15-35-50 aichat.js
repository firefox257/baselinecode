

// ./ux/aichat.js

const API_BASE_URL = "https://text.pollinations.ai";
const MODELS_URL = `${API_BASE_URL}/models`;
const OPENAI_COMPLETION_URL = `${API_BASE_URL}/openai`;

// Local Storage Keys
const LOCAL_STORAGE_MODELS_KEY = 'aiChatModels';
const LOCAL_STORAGE_SELECTED_MODEL_KEY = 'aiChatSelectedModel';
const LOCAL_STORAGE_SYSTEM_PROMPT_KEY = 'aiChatSystemPrompt';
const LOCAL_STORAGE_MESSAGES_KEY = 'aiChatMessages'; // New key for conversation history
const LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY = 'aiChatSelectedSystemPromptTitle'; // New key for selected system prompt title

class AIChat extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' }); // Use Shadow DOM for encapsulation
        this.models = [];
        this.currentModel = "mistral"; // Default model
        this.systemPrompt = "You are a helpful AI assistant."; // Default value
        this.systemPrompts = {}; // New: Store loaded system prompts from JSON
        this.currentSystemPromptTitle = ""; // New: Store the title of the currently selected system prompt
        this.onCloseCallback = null;
        this.chatTitle = null;

        this.render();
    }

    async connectedCallback() {
        // Load selected model from localStorage first
        const cachedModel = localStorage.getItem(LOCAL_STORAGE_SELECTED_MODEL_KEY);
        if (cachedModel) {
            this.currentModel = cachedModel;
        }

        // Fetch and populate system prompts dropdown
        await this.fetchSystemPrompts();

        // --- MODIFIED LOGIC FOR SYSTEM PROMPTS START ---
        const systemInput = this.shadowRoot.getElementById('systemInput');
        const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect');

        // 1. Try to load the actual system prompt content from local storage first
        const cachedSystemPromptContent = localStorage.getItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY);
        if (cachedSystemPromptContent) {
            this.systemPrompt = cachedSystemPromptContent;
            // Set dropdown to 'custom' if the cached content doesn't match a predefined prompt
            const foundKey = Object.keys(this.systemPrompts).find(key => this.systemPrompts[key] === cachedSystemPromptContent);
            if (foundKey) {
                this.currentSystemPromptTitle = foundKey;
                if (systemPromptSelect) systemPromptSelect.value = this.currentSystemPromptTitle;
            } else {
                this.currentSystemPromptTitle = "custom";
                if (systemPromptSelect) systemPromptSelect.value = "custom";
            }
        } else {
            // 2. If no cached content, try to load a cached *title* and get its content
            const cachedSystemPromptTitle = localStorage.getItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY);
            if (cachedSystemPromptTitle && this.systemPrompts[cachedSystemPromptTitle]) {
                this.currentSystemPromptTitle = cachedSystemPromptTitle;
                this.systemPrompt = this.systemPrompts[this.currentSystemPromptTitle];
                if (systemPromptSelect) systemPromptSelect.value = this.currentSystemPromptTitle;
            } else if (Object.keys(this.systemPrompts).length > 0) {
                // 3. If no cached content and no cached title, default to the first predefined prompt
                const defaultTitle = Object.keys(this.systemPrompts)[0];
                this.currentSystemPromptTitle = defaultTitle;
                this.systemPrompt = this.systemPrompts[defaultTitle];
                if (systemPromptSelect) systemPromptSelect.value = defaultTitle;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, defaultTitle);
                localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
            }
            // If no system prompts are loaded at all, this.systemPrompt remains its default value
        }

        // Ensure the system input content is set from this.systemPrompt
        if (systemInput) {
            systemInput.textContent = this.systemPrompt;
        }
        // --- MODIFIED LOGIC FOR SYSTEM PROMPTS END ---

        // When the page loads, restart the conversation from scratch:
        // 1. Clear any previously stored conversation messages.
        localStorage.removeItem(LOCAL_STORAGE_MESSAGES_KEY);
        // 2. Initialize the messages array with only the system prompt.
        this.messages = [{ role: 'system', content: this.systemPrompt }];

        await this.fetchModels(); // This now handles loading from cache or network
        this.setupEventListeners();
        this.applyDynamicProperties();
        this.updateTitleBar();

        // After models are loaded and dropdown is populated, ensure the cached model is selected
        this.shadowRoot.getElementById('modelSelect').value = this.currentModel;

        // Display initial history in the chat output (which will be just the loading message initially)
        this.renderHistory();
    }

    disconnectedCallback() {
        if (this.onCloseCallback) {
            this.onCloseCallback();
        }
    }

    static get observedAttributes() {
        return ['title', 'onclose'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'title') {
            this.chatTitle = newValue;
            this.updateTitleBar();
        } else if (name === 'onclose') {
            try {
                this.onCloseCallback = window[newValue] || new Function(newValue);
            } catch (e) {
                console.error(`Error parsing onClose attribute: ${e}`);
                this.onCloseCallback = null;
            }
            this.updateCloseButtonVisibility();
        }
    }

    applyDynamicProperties() {
        if (this.hasAttribute('title')) {
            this.chatTitle = this.getAttribute('title');
        }
        if (this.hasAttribute('onclose')) {
            try {
                this.onCloseCallback = window[this.getAttribute('onclose')] || new Function(this.getAttribute('onclose'));
            } catch (e) {
                console.error(`Error parsing onClose attribute: ${e}`);
                this.onCloseCallback = null;
            }
        }
        this.updateCloseButtonVisibility();
    }

    updateTitleBar() {
        const titleBar = this.shadowRoot.querySelector('.title-bar');
        const titleSpan = this.shadowRoot.querySelector('.title-text');
        if (titleBar && titleSpan) {
            if (this.chatTitle) {
                titleSpan.textContent = this.chatTitle;
                titleBar.style.display = 'flex';
            } else {
                titleBar.style.display = 'none';
            }
        }
    }

    async fetchModels() {
        // 1. Try to load from localStorage first
        const cachedModels = localStorage.getItem(LOCAL_STORAGE_MODELS_KEY);
        if (cachedModels) {
            try {
                this.models = JSON.parse(cachedModels);
                this.populateModelDropdown();
                // If a cached model was previously selected, ensure it's still available in the fetched models
                // If not, revert to default or first available.
                const isCachedModelAvailable = this.models.some(model => model.name === this.currentModel);
                if (!isCachedModelAvailable && this.models.length > 0) {
                    this.currentModel = this.models[0].name; // Default to first available if old model is gone
                    localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel);
                }
                console.log('Models loaded from cache.');
                return; // Exit if loaded from cache
            } catch (e) {
                console.warn('Error parsing cached models, fetching new ones:', e);
                localStorage.removeItem(LOCAL_STORAGE_MODELS_KEY); // Clear invalid cache
            }
        }

        // 2. If no cache or cache invalid, fetch from network
        try {
            console.log('Fetching models from network...');
            const response = await fetch(MODELS_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.models = await response.json();
            this.populateModelDropdown();
            localStorage.setItem(LOCAL_STORAGE_MODELS_KEY, JSON.stringify(this.models)); // Cache new models
            console.log('Models fetched from network and cached.');

            // Ensure current model is valid after fresh fetch
            const isCurrentModelAvailable = this.models.some(model => model.name === this.currentModel);
            if (!isCurrentModelAvailable && this.models.length > 0) {
                this.currentModel = this.models[0].name;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel);
            }

        } catch (error) {
            console.error("Error fetching models:", error);
            const modelSelect = this.shadowRoot.getElementById('modelSelect');
            if (modelSelect) {
                modelSelect.innerHTML = `<option value="">Error loading models</option>`;
            }
            // If network fetch fails, and we couldn't load from cache initially, then display error.
            // If we successfully loaded from cache first, this error won't be critical.
        }
    }

    populateModelDropdown() {
        const modelSelect = this.shadowRoot.getElementById('modelSelect');
        if (!modelSelect) {
            console.error("Model select element not found in Shadow DOM!");
            return;
        }
        modelSelect.innerHTML = ''; // Clear existing options

        this.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.description || model.name;
            modelSelect.appendChild(option);
        });

        // Ensure the currentModel (potentially from cache) is selected in the dropdown
        modelSelect.value = this.currentModel;
    }

    // New: Fetch system prompts from a JSON file
    async fetchSystemPrompts() {
        const fileName = 'systemPromp.json';
        try {
            const response = await fetch(fileName); // Assumes file is in the same directory
            if (!response.ok) {
                console.warn(`System prompt JSON file not found or accessible: ${fileName}. Proceeding without predefined prompts.`);
                this.systemPrompts = {}; // Ensure it's an empty object
                return;
            }
            this.systemPrompts = await response.json();
            this.populateSystemPromptDropdown();
        } catch (error) {
            console.error(`Error fetching system prompts from ${fileName}:`, error);
            this.systemPrompts = {}; // Fallback to empty object on error
        }
    }

    // New: Populate the system prompt dropdown
    populateSystemPromptDropdown() {
        const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect');
        if (!systemPromptSelect) {
            console.error("System prompt select element not found in Shadow DOM!");
            return;
        }
        systemPromptSelect.innerHTML = ''; // Clear existing options

        const customOption = document.createElement('option');
        customOption.value = "custom";
        customOption.textContent = "Custom Prompt";
        systemPromptSelect.appendChild(customOption);

        for (const title in this.systemPrompts) {
            const option = document.createElement('option');
            option.value = title;
            option.textContent = title;
            systemPromptSelect.appendChild(option);
        }

        // Set the currently active prompt in the dropdown
        if (this.currentSystemPromptTitle && systemPromptSelect.querySelector(`option[value="${this.currentSystemPromptTitle}"]`)) {
            systemPromptSelect.value = this.currentSystemPromptTitle;
        } else {
             // If currentSystemPromptTitle is not set or not in predefined list, assume custom
            systemPromptSelect.value = "custom";
        }
    }


    // Helper to strip HTML tags for input fields only
    stripHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    }

    // New method to clear the conversation
    clearConversation() {
        // Reset messages to only the system prompt
        this.messages = [{ role: 'system', content: this.systemPrompt }];
        // Clear from local storage
        localStorage.removeItem(LOCAL_STORAGE_MESSAGES_KEY);
        // Re-render the chat area to show it's empty
        this.renderHistory();
        console.log('Conversation history cleared.');
    }


    setupEventListeners() {
        const sendButton = this.shadowRoot.getElementById('sendButton');
        const modelSelect = this.shadowRoot.getElementById('modelSelect');
        const systemPromptButton = this.shadowRoot.getElementById('systemPromptButton');
        const clearChatButton = this.shadowRoot.getElementById('clearChatButton'); // Get the new button
        const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect'); // Get the new dropdown
        const closeButton = this.shadowRoot.getElementById('closeButton');
        const systemInputContainer = this.shadowRoot.getElementById('systemInputContainer');
        const systemInput = this.shadowRoot.getElementById('systemInput');

        if (sendButton) sendButton.addEventListener('click', () => this.sendMessage()); else console.error('sendButton not found!');
        if (modelSelect) {
            modelSelect.addEventListener('change', (event) => {
                this.currentModel = event.target.value;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel); // Cache selected model
            });
        } else console.error('modelSelect not found!');
        if (systemPromptButton) systemPromptButton.addEventListener('click', () => { systemInputContainer.style.display = systemInputContainer.style.display === 'none' ? 'block' : 'none'; }); else console.error('systemPromptButton not found!');

        // Add event listener for the new clear chat button
        if (clearChatButton) clearChatButton.addEventListener('click', () => this.clearConversation()); else console.error('clearChatButton not found!');

        // --- NEW EVENT LISTENER FOR SYSTEM PROMPT DROPDOWN ---
        if (systemPromptSelect) {
            systemPromptSelect.addEventListener('change', (event) => {
                const selectedTitle = event.target.value;
                const systemInput = this.shadowRoot.getElementById('systemInput');

                if (selectedTitle === "custom") {
                    // User wants to write a custom prompt, keep current content
                    systemInput.textContent = this.systemPrompt;
                    this.currentSystemPromptTitle = "custom";
                } else if (this.systemPrompts[selectedTitle]) {
                    // Select a predefined prompt
                    this.systemPrompt = this.systemPrompts[selectedTitle];
                    this.currentSystemPromptTitle = selectedTitle;
                    systemInput.textContent = this.systemPrompt; // This line fills the text box
                }

                // Update localStorage for system prompt content and selected title
                localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
                localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, this.currentSystemPromptTitle);

                // Update the system message in the messages array for the *new* conversation.
                if (this.messages.length > 0 && this.messages[0].role === 'system') {
                    this.messages[0].content = this.systemPrompt;
                } else {
                    this.messages.unshift({ role: 'system', content: this.systemPrompt });
                }
            });
        } else console.error('systemPromptSelect not found!');


        // Add event listener for system input changes
        if (systemInput) {
            systemInput.addEventListener('input', (event) => {
                // Strip HTML from the system prompt before storing
                this.systemPrompt = this.stripHtml(event.target.innerHTML).trim();
                localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt); // Cache system prompt

                // If user types into the system input, set dropdown to "custom"
                const currentDropdownValue = systemPromptSelect ? systemPromptSelect.value : "";
                if (systemInput.textContent.trim() !== "" && (currentDropdownValue === "" || (this.systemPrompts[currentDropdownValue] !== systemInput.textContent.trim()))) {
                    this.currentSystemPromptTitle = "custom";
                    if (systemPromptSelect) systemPromptSelect.value = "custom";
                    localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, "custom");
                }


                // Update the system message in the messages array.
                if (this.messages.length > 0 && this.messages[0].role === 'system') {
                    this.messages[0].content = this.systemPrompt;
                } else {
                    this.messages.unshift({ role: 'system', content: this.systemPrompt });
                }
            });
        } else console.error('systemInput not found!');


        if (closeButton) {
            closeButton.addEventListener('click', () => {
                if (this.onCloseCallback) {
                    this.onCloseCallback();
                }
                this.remove(); // Remove the custom element from the DOM
            });
        }
    }

    renderHistory() {
        const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
        if (!rawTextOutputDiv) return;

        rawTextOutputDiv.innerHTML = ''; // Clear existing content

        // Filter out the system message for display, as it's typically hidden
        const displayMessages = this.messages.filter(msg => msg.role !== 'system');

        displayMessages.forEach(msg => {
            const p = document.createElement('p');
            // When rendering history, ensure raw text by setting textContent
            p.textContent = `${msg.role === 'user' ? 'You' : 'AI'}: ${msg.content}`;
            rawTextOutputDiv.appendChild(p);
        });
        rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;
    }


    async sendMessage() {
        // Strip HTML from the user prompt before processing
        const userPrompt = this.stripHtml(this.shadowRoot.getElementById('textInput').innerHTML).trim();
        const temperature = parseFloat(this.shadowRoot.getElementById('temperatureInput').value);
        const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
        const textInputDiv = this.shadowRoot.getElementById('textInput');

        if (!userPrompt) {
            rawTextOutputDiv.textContent = 'Please enter a user prompt.';
            return;
        }

        if (isNaN(temperature) || temperature < 0 || temperature > 1) {
            rawTextOutputDiv.textContent = 'Please enter a valid temperature between 0.0 and 1.0.';
            return;
        }

        // Add user message to history and display
        this.messages.push({ role: 'user', content: userPrompt });
        this.renderHistory(); // Update display with user's new message

        rawTextOutputDiv.textContent += '\n\nAI: Generating response...'; // Append loading message
        rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;


        // The payload now uses the accumulated history in this.messages
        const payload = {
            "model": this.currentModel,
            "messages": this.messages, // Send the full history
            "temperature": temperature,
            "stream": true,
            "private": false
        };

        try {
            const response = await fetch(OPENAI_COMPLETION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullResponse = '';

            // Clear the "Generating response..." message and prepare for stream
            rawTextOutputDiv.innerHTML = ''; // Clear everything
            this.renderHistory(); // Re-render history without "Generating..."
            const aiResponseParagraph = document.createElement('p');
            aiResponseParagraph.textContent = 'AI: '; // Start AI response paragraph using textContent
            rawTextOutputDiv.appendChild(aiResponseParagraph);
            rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;


            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const events = chunk.split('\n\n').filter(Boolean);

                for (const eventString of events) {
                    if (eventString.startsWith('data:')) {
                        const data = eventString.substring(5).trim();

                        if (data === '[DONE]') {
                            reader.cancel();
                            break;
                        }

                        try {
                            const parsedChunk = JSON.parse(data);
                            const content = parsedChunk.choices && parsedChunk.choices[0] && parsedChunk.choices[0].delta && parsedChunk.choices[0].delta.content;

                            if (content) {
                                fullResponse += content;
                                // Set textContent to ensure raw text output without HTML interpretation
                                aiResponseParagraph.textContent = 'AI: ' + fullResponse;
                                rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;
                            }
                        } catch (jsonError) {
                            console.warn("Received non-JSON data or marker:", data);
                        }
                    }
                }
            }

            // After streaming is complete, add the full AI response to history
            this.messages.push({ role: 'assistant', content: fullResponse });
            // Save updated history (this will be cleared on next page load)
            localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));
            textInputDiv.textContent = ''; // Clear user input (this automatically strips HTML from input)
            this.renderHistory(); // Final render to ensure proper formatting
        } catch (error) {
            console.error("Error:", error);
            rawTextOutputDiv.textContent = `Error: ${error.message}`;
            // If an error occurs, remove the last user message from history as no response was received
            this.messages.pop();
            localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex; /* Use flexbox for vertical layout */
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
                    box-sizing: border-box;
                    font-family: 'Space Mono', 'Courier New', monospace;
                    background-color: #fcfcfc; /* Very subtle background for the whole component */
                    color: #333;
                    overflow: hidden; /* Prevent scrollbars from the host itself if content overflows */
                }

                .section {
                    padding: 8px 10px; /* Minimal padding for sections */
                    border-bottom: 1px solid #eee; /* Horizontal line separator */
                }

                .section:last-of-type {
                    border-bottom: none; /* No line after the last section */
                }

                .title-bar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    font-weight: bold;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    flex-shrink: 0;
                    padding-bottom: 5px; /* Add some space below title if present */
                }
                .title-text {
                    overflow: hidden;
                    text-overflow: clip;
                    white-space: nowrap;
                }

                .top-menu {
                    display: flex;
                    justify-content: space-between; /* This allows items to push to ends */
                    align-items: center;
                    flex-shrink: 0;
                }
                .top-menu > div { /* This div contains the buttons and the select */
                    display: flex;
                    gap: 8px; /* Slightly reduced gap between items in this group */
                    flex-grow: 1; /* Allow this div to grow */
                    min-width: 0; /* Allow content to shrink */
                    align-items: center; /* Align items within this flex container */
                }
                .top-menu button, .top-menu select {
                    padding: 6px 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    background-color: #fff;
                    cursor: pointer;
                    font-family: inherit; /* Inherit font from host */
                    font-size: 0.9em;
                    color: #333;
                    box-sizing: border-box; /* Crucial for width calculations */
                }
                .top-menu button:hover, .top-menu select:hover {
                    background-color: #e9e9e9;
                }
                .top-menu .icon-button {
                    font-size: 1.1em;
                    flex-shrink: 0; /* Prevent icon button from shrinking */
                }

                #modelSelect, #systemPromptSelect { /* Apply same style to both selects */
                    flex-grow: 1; /* Allow the select to take up available space */
                    min-width: 0; /* Allow the select to shrink below its intrinsic width */
                    overflow: hidden; /* Hide overflowing text in select itself */
                    text-overflow: ellipsis; /* Add ellipsis for long options */
                    white-space: nowrap; /* Prevent options from wrapping */
                }


                #systemInputContainer {
                    display: none; /* Hidden by default */
                    padding-top: 10px;
                    padding-bottom: 5px; /* Consistent vertical spacing */
                }
                .input-group {
                    margin-bottom: 8px; /* Space between system input and temperature */
                }
                .input-group label {
                    display: block;
                    margin-bottom: 4px;
                    font-weight: bold;
                    font-size: 0.85em;
                    color: #555;
                }
                .input-group input[type="number"],
                .input-group select {
                    width: calc(100% - 2px); /* Full width minus border */
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 0.9em;
                    box-sizing: border-box;
                    font-family: inherit;
                    color: #333;
                }

                /* Styling for both contenteditable divs (user input and system input) */
                #textInput, #systemInput {
                    flex-grow: 1; /* Allow text input to take available space */
                    border: none; /* Crucial: Remove the border to eliminate "box" look */
                    background-color: transparent; /* Make background transparent */
                    padding: 8px 0; /* Minimal vertical padding, no horizontal padding */
                    min-height: 30px;
                    max-height: 120px; /* Limit height of input area */
                    overflow-y: auto;
                    border-radius: 0; /* Remove border-radius */
                    cursor: text;
                    font-family: inherit;
                    font-size: 0.95em;
                    line-height: 1.4;
                    box-sizing: border-box;
                    color: #333;
                    margin: 0; /* Remove any default margins */
                }
                /* Focus state for contenteditable divs */
                #textInput[contenteditable="true"]:focus,
                #systemInput[contenteditable="true"]:focus {
                    outline: none; /* Remove default blue outline */
                    /* Optional: Add a subtle bottom border or shadow on focus for feedback */
                    border-bottom: 1px solid #007bff; /* Example: highlight bottom border */
                }

                /* Placeholder styling for contenteditable */
                #textInput:empty:before, #systemInput:empty:before {
                    content: attr(placeholder);
                    color: #aaa;
                    pointer-events: none; /* Allow clicks to pass through to the div */
                    display: block; /* Important for Firefox */
                }

                .chat-area {
                    flex-grow: 1; /* Allows chat area to take available space */
                    overflow-x: auto; /* Enable horizontal scrolling */
                    overflow-y: auto; /* Keep vertical scrolling */
                    font-size: 0.95em;
                    line-height: 1.4;
                    background-color: #fff; /* Solid background for chat content */
                    min-height: 50px; /* Minimum height for the chat area */
                    box-sizing: border-box;
                    resize: vertical; /* Allow vertical resizing */
                    padding: 10px; /* Padding for actual chat content */
                    border: none; /* Remove any border here */
                    border-radius: 0; /* Remove any border-radius */
                    outline: none; /* Remove outline on focus */
                }
                .chat-area p { /* Style for chat messages */
                    margin: 0 0 8px 0; /* Space between messages */
                    white-space: pre-wrap; /* Changed to pre-wrap for line wrapping */
                    word-break: normal; /* Changed to normal to allow natural word breaks */
                }
                .chat-area p:last-child {
                    margin-bottom: 0;
                }

                .input-area-wrapper {
                    display: flex;
                    align-items: flex-end;
                    gap: 8px; /* Space between text input and send button */
                    flex-shrink: 0;
                    padding-top: 8px; /* Space above input */
                }


                #sendButton {
                    padding: 8px 14px;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 1.4em; /* Larger for unicode icon */
                    flex-shrink: 0;
                    line-height: 1; /* Adjust line height for icon */
                }
                #sendButton:hover {
                    background-color: #0056b3;
                }

                .close-button {
                    background: none;
                    border: none;
                    font-size: 1.3em;
                    cursor: pointer;
                    color: #888;
                    padding: 0; /* Remove default button padding */
                }
                .close-button:hover {
                    color: #333;
                }
            </style>

            <div class="title-bar section" style="display: none;">
                <span class="title-text"></span>
                <button id="closeButton" class="close-button" style="display: none;">✖</button>
            </div>

            <div class="top-menu section">
                <div>
                    <button id="systemPromptButton" class="icon-button" title="Toggle System Prompt">⚙️</button>
                    <select id="modelSelect"></select>
                </div>
                <div>
                    <button id="clearChatButton" class="icon-button" title="Clear Conversation">🗑️</button>
                </div>
            </div>

            <div id="systemInputContainer" class="section">
                <div class="input-group">
                    <label for="systemPromptSelect">System Prompt:</label>
                    <select id="systemPromptSelect"></select>
                </div>
                <div class="input-group">
                    <div id="systemInput" contenteditable="true" placeholder="You are a helpful AI assistant."></div>
                </div>
                <div class="input-group">
                    <label for="temperatureInput">Temperature (0.0 - 1.0):</label>
                    <input type="number" id="temperatureInput" value="0.7" min="0" max="1" step="0.1">
                </div>
            </div>

            <div id="rawTextOutput" class="chat-area" spellcheck="false">
                Loading AI Chat...
            </div>

            <div class="input-area-wrapper section">
                <div id="textInput" contenteditable="true" placeholder="Enter your prompt here..."></div>
                <button id="sendButton">➤</button>
            </div>
        `;
    }
}

// Define the custom element
if (!customElements.get('ai-chat')) {
    customElements.define('ai-chat', AIChat);
}

// MutationObserver to detect dynamically added <ai-chat> tags
const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.tagName === 'AI-CHAT') {
                    // console.log('MutationObserver detected new <ai-chat> element.');
                }
            });
        }
    });
});

// Start observing the document body for changes in the DOM
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial scan for existing <ai-chat> tags on page load
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('ai-chat').forEach(chatElement => {
        console.log('Found an existing <ai-chat> element and initializing.');
    });
});


