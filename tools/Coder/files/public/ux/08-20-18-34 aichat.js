


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
const LOCAL_STORAGE_CONVERSATION_ENABLED_KEY = 'aiChatConversationEnabled'; // New key for conversation mode setting
const LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY = 'aiChatSelectedTTSVoice'; // New key for selected TTS voice

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

        // New properties for conversation mode
        this.conversationEnabled = false;
        this.ttsVoices = [];
        this.selectedTTSVoiceURI = null; // Stores the URI of the selected voice
        this.speechRecognition = null;
        this.isListening = false; // Is SpeechRecognition active?
        this.currentSpeechRecognitionText = ''; // To accumulate STT results
        this.aiIsSpeaking = false; // Is SpeechSynthesis active? (NEW: Crucial for button state)

        this.render();
    }

    async connectedCallback() {
        // Load selected model from localStorage first
        const cachedModel = localStorage.getItem(LOCAL_STORAGE_SELECTED_MODEL_KEY);
        if (cachedModel) {
            this.currentModel = cachedModel;
            console.log(`[AIChat] Loaded cached model: ${this.currentModel}`);
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
            console.log(`[AIChat] Loaded cached system prompt content: "${this.systemPrompt}"`);

            // Set dropdown to 'custom' if the cached content doesn't match a predefined prompt
            const foundKey = Object.keys(this.systemPrompts).find(key => this.systemPrompts[key] === cachedSystemPromptContent);
            if (foundKey) {
                this.currentSystemPromptTitle = foundKey;
                if (systemPromptSelect) systemPromptSelect.value = this.currentSystemPromptTitle;
                console.log(`[AIChat] System prompt dropdown set to predefined: ${this.currentSystemPromptTitle}`);
            } else {
                this.currentSystemPromptTitle = "custom";
                if (systemPromptSelect) systemPromptSelect.value = "custom";
                console.log(`[AIChat] System prompt dropdown set to custom (content matched no predefined).`);
            }
        } else {
            // 2. If no cached content, try to load a cached *title* and get its content
            const cachedSystemPromptTitle = localStorage.getItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY);
            if (cachedSystemPromptTitle && this.systemPrompts[cachedSystemPromptTitle]) {
                this.currentSystemPromptTitle = cachedSystemPromptTitle;
                this.systemPrompt = this.systemPrompts[this.currentSystemPromptTitle];
                if (systemPromptSelect) systemPromptSelect.value = this.currentSystemPromptTitle;
                console.log(`[AIChat] Loaded cached system prompt title: ${cachedSystemPromptTitle}, content: "${this.systemPrompt}"`);
            } else if (Object.keys(this.systemPrompts).length > 0) {
                // 3. If no cached content and no cached title, default to the first predefined prompt
                const defaultTitle = Object.keys(this.systemPrompts)[0];
                this.currentSystemPromptTitle = defaultTitle;
                this.systemPrompt = this.systemPrompts[defaultTitle];
                if (systemPromptSelect) systemPromptSelect.value = defaultTitle;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, defaultTitle);
                localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
                console.log(`[AIChat] Defaulted to first system prompt: ${defaultTitle}, content: "${this.systemPrompt}"`);
            } else {
                console.log(`[AIChat] No system prompts loaded or cached, using default prompt: "${this.systemPrompt}"`);
            }
            // If no system prompts are loaded at all, this.systemPrompt remains its default value
        }

        // Ensure the system input content is set from this.systemPrompt
        if (systemInput) {
            systemInput.textContent = this.systemPrompt;
            console.log(`[AIChat] System input field set to: "${systemInput.textContent}"`);
        }
        // --- MODIFIED LOGIC FOR SYSTEM PROMPTS END ---

        // When the page loads, restart the conversation from scratch:
        // 1. Clear any previously stored conversation messages.
        // If you want history to persist, comment out the next line:
        localStorage.removeItem(LOCAL_STORAGE_MESSAGES_KEY);
        // 2. Initialize the messages array with only the system prompt.
        this.messages = [{ role: 'system', content: this.systemPrompt }];
        console.log(`[AIChat] Conversation history initialized.`);

        await this.fetchModels(); // This now handles loading from cache or network
        this.setupEventListeners();
        this.applyDynamicProperties();
        this.updateTitleBar();

        // After models are loaded and dropdown is populated, ensure the cached model is selected
        this.shadowRoot.getElementById('modelSelect').value = this.currentModel;
        console.log(`[AIChat] Model dropdown set to: ${this.currentModel}`);

        // Display initial history in the chat output (which will be just the loading message initially)
        this.renderHistory();

        // --- New: Conversation Mode Initialization ---
        const cachedConversationEnabled = localStorage.getItem(LOCAL_STORAGE_CONVERSATION_ENABLED_KEY);
        this.conversationEnabled = cachedConversationEnabled === 'true';
        this.shadowRoot.getElementById('conversationEnabledCheckbox').checked = this.conversationEnabled;
        this.toggleConversationSettingsVisibility();
        console.log(`[AIChat] Conversation mode enabled: ${this.conversationEnabled}`);

        // Load TTS voices and set selected voice
        // This MUST happen after initial render where ttsVoiceSelect is created
        await this.loadTTSVoices(); // Ensure voices are loaded before setting cached selection

        const ttsVoiceSelect = this.shadowRoot.getElementById('ttsVoiceSelect');
        const cachedTTSVoiceURI = localStorage.getItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY);
        console.log(`[AIChat] Cached TTS Voice URI from localStorage: "${cachedTTSVoiceURI}"`);

        if (ttsVoiceSelect) { // Check if element exists before trying to access it
            // Attempt to find the cached voice in the loaded voices
            if (cachedTTSVoiceURI && this.ttsVoices.some(voice => voice.voiceURI === cachedTTSVoiceURI)) {
                this.selectedTTSVoiceURI = cachedTTSVoiceURI;
                console.log(`[AIChat] Cached voice "${cachedTTSVoiceURI}" found and will be selected.`);
            } else if (this.ttsVoices.length > 0) {
                // If no cached voice, or cached voice is no longer available, default to the first available voice
                this.selectedTTSVoiceURI = this.ttsVoices[0].voiceURI;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY, this.selectedTTSVoiceURI);
                console.log(`[AIChat] No valid cached voice, defaulting to first available: "${this.selectedTTSVoiceURI}". Local storage updated.`);
            } else {
                // No voices available at all
                this.selectedTTSVoiceURI = null;
                console.warn("[AIChat] No TTS voices available on the system.");
            }
            // Ensure the dropdown value is set after voices are loaded and selectedTTSVoiceURI is determined
            ttsVoiceSelect.value = this.selectedTTSVoiceURI || ""; // Set to empty string if no voice selected
            console.log(`[AIChat] TTS Voice dropdown value set to: "${ttsVoiceSelect.value}"`);
        } else {
            console.error("[AIChat] TTS Voice Select element not found in connectedCallback.");
        }

        this.initializeSpeechRecognition(); // Initialize STT
        console.log("[AIChat] AIChat component fully connected and initialized.");
    }

    disconnectedCallback() {
        if (this.onCloseCallback) {
            this.onCloseCallback();
        }
        // Stop listening if active when component is removed
        if (this.isListening && this.speechRecognition) {
            this.stopListening();
        }
        // Cancel any ongoing speech synthesis when component is removed
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            this.aiIsSpeaking = false; // Reset the flag
            this.updateConversationButtonState(); // Update button state
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
                // Safely evaluate the function from string
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

    // Helper to control close button visibility based on whether an onClose callback is set
    updateCloseButtonVisibility() {
        const closeButton = this.shadowRoot.getElementById('closeButton');
        if (closeButton) {
            closeButton.style.display = this.onCloseCallback ? 'block' : 'none';
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
                    console.log('[AIChat] Cached model not available, defaulting to:', this.currentModel);
                }
                console.log('[AIChat] Models loaded from cache.');
                return; // Exit if loaded from cache
            } catch (e) {
                console.warn('[AIChat] Error parsing cached models, fetching new ones:', e);
                localStorage.removeItem(LOCAL_STORAGE_MODELS_KEY); // Clear invalid cache
            }
        }

        // 2. If no cache or cache invalid, fetch from network
        try {
            console.log('[AIChat] Fetching models from network...');
            const response = await fetch(MODELS_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.models = await response.json();
            this.populateModelDropdown();
            localStorage.setItem(LOCAL_STORAGE_MODELS_KEY, JSON.stringify(this.models)); // Cache new models
            console.log('[AIChat] Models fetched from network and cached.');

            // Ensure current model is valid after fresh fetch
            const isCurrentModelAvailable = this.models.some(model => model.name === this.currentModel);
            if (!isCurrentModelAvailable && this.models.length > 0) {
                this.currentModel = this.models[0].name;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel);
                console.log('[AIChat] Current model not available after fetch, defaulting to:', this.currentModel);
            }

        } catch (error) {
            console.error("[AIChat] Error fetching models:", error);
            const modelSelect = this.shadowRoot.getElementById('modelSelect');
            if (modelSelect) {
                modelSelect.innerHTML = `<option value="">Error loading models</option>`;
            }
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
        const fileName = 'systemPromp.json'; // Note: Typo in filename 'systemPromp.json' -> 'systemPrompts.json'?
        try {
            const response = await fetch(fileName); // Assumes file is in the same directory
            if (!response.ok) {
                console.warn(`[AIChat] System prompt JSON file not found or accessible: ${fileName}. Proceeding without predefined prompts.`);
                this.systemPrompts = {}; // Ensure it's an empty object
                return;
            }
            this.systemPrompts = await response.json();
            this.populateSystemPromptDropdown();
            console.log(`[AIChat] System prompts loaded from ${fileName}.`);
        } catch (error) {
            console.error(`[AIChat] Error fetching system prompts from ${fileName}:`, error);
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
        console.log(`[AIChat] System prompt dropdown populated. Selected: ${systemPromptSelect.value}`);
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
        console.log('[AIChat] Conversation history cleared.');
        // Cancel any ongoing speech synthesis if chat is cleared during a response
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            this.aiIsSpeaking = false; // Reset the flag
            this.updateConversationButtonState(); // Update button state
        }
        // Stop any ongoing speech recognition
        if (this.isListening) {
            this.stopListening();
        }
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
        const textInputDiv = this.shadowRoot.getElementById('textInput'); // Get the text input div

        // New elements for conversation mode
        const conversationEnabledCheckbox = this.shadowRoot.getElementById('conversationEnabledCheckbox');
        const ttsVoiceSelect = this.shadowRoot.getElementById('ttsVoiceSelect');
        const testTTSButton = this.shadowRoot.getElementById('testTTSButton'); // Get the new button
        const conversationModeButton = this.shadowRoot.getElementById('conversationModeButton');
        const conversationBigButton = this.shadowRoot.getElementById('conversationBigButton');
        const exitConversationButton = this.shadowRoot.getElementById('exitConversationButton');


        if (sendButton) sendButton.addEventListener('click', () => this.sendMessage()); else console.error('sendButton not found!');
        if (modelSelect) {
            modelSelect.addEventListener('change', (event) => {
                this.currentModel = event.target.value;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel); // Cache selected model
                console.log(`[AIChat] Model changed to: ${this.currentModel}`);
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
                    // User wants to write a custom prompt, keep current content in input field
                    // The systemPrompt variable already holds the last edited custom prompt or default
                    systemInput.textContent = this.systemPrompt;
                    this.currentSystemPromptTitle = "custom";
                    console.log(`[AIChat] System prompt dropdown set to 'custom'.`);
                } else if (this.systemPrompts[selectedTitle]) {
                    // Select a predefined prompt
                    this.systemPrompt = this.systemPrompts[selectedTitle];
                    this.currentSystemPromptTitle = selectedTitle;
                    systemInput.textContent = this.systemPrompt; // This line fills the text box
                    console.log(`[AIChat] System prompt changed to predefined: ${selectedTitle}`);
                }

                // Update localStorage for system prompt content and selected title
                localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
                localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, this.currentSystemPromptTitle);
                console.log(`[AIChat] System prompt saved to localStorage (content, title).`);


                // Update the system message in the messages array for the *new* conversation.
                // Note: This changes the system prompt for the *next* interaction.
                // If you wanted to re-render the history with the new system prompt, you'd need to clear and re-add.
                if (this.messages.length > 0 && this.messages[0].role === 'system') {
                    this.messages[0].content = this.systemPrompt;
                } else {
                    // If somehow system message is not first, add it.
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
                console.log(`[AIChat] System input content changed, saving to localStorage: "${this.systemPrompt.substring(0, 50)}..."`);

                // If user types into the system input, set dropdown to "custom"
                const currentDropdownValue = systemPromptSelect ? systemPromptSelect.value : "";
                if (systemInput.textContent.trim() !== "" && (currentDropdownValue === "" || (this.systemPrompts[currentDropdownValue] !== systemInput.textContent.trim()))) {
                    this.currentSystemPromptTitle = "custom";
                    if (systemPromptSelect) systemPromptSelect.value = "custom";
                    localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, "custom");
                    console.log(`[AIChat] System input manually edited, dropdown set to 'custom'.`);
                }

                // Update the system message in the messages array.
                if (this.messages.length > 0 && this.messages[0].role === 'system') {
                    this.messages[0].content = this.systemPrompt;
                } else {
                    this.messages.unshift({ role: 'system', content: this.systemPrompt });
                }
            });
        } else console.error('systemInput not found!');

        // Listen for 'Enter' key in textInput to send message
        if (textInputDiv) {
            textInputDiv.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) { // Shift+Enter for new line
                    event.preventDefault(); // Prevent default new line
                    this.sendMessage();
                }
            });
        }

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                if (this.onCloseCallback) {
                    this.onCloseCallback();
                }
                this.remove(); // Remove the custom element from the DOM
                console.log('[AIChat] Close button clicked, component removed.');
            });
        }

        // --- New: Conversation Mode Event Listeners ---
        if (conversationEnabledCheckbox) {
            conversationEnabledCheckbox.addEventListener('change', (event) => {
                this.conversationEnabled = event.target.checked;
                localStorage.setItem(LOCAL_STORAGE_CONVERSATION_ENABLED_KEY, this.conversationEnabled);
                this.toggleConversationSettingsVisibility();
                console.log(`[AIChat] Conversation mode enabled checkbox changed to: ${this.conversationEnabled}`);
                // If conversation mode is disabled, stop any ongoing speech
                if (!this.conversationEnabled && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                    this.aiIsSpeaking = false; // Reset the flag
                    this.updateConversationButtonState(); // Update button state
                    console.log('[AIChat] Conversation mode disabled, cancelling TTS.');
                }
                // If conversation mode is disabled, stop listening if active
                if (!this.conversationEnabled && this.isListening) {
                    this.stopListening();
                }
            });
        }

        if (ttsVoiceSelect) {
            ttsVoiceSelect.addEventListener('change', (event) => {
                this.selectedTTSVoiceURI = event.target.value;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY, this.selectedTTSVoiceURI);
                console.log(`[AIChat] TTS voice changed, saving to localStorage: ${this.selectedTTSVoiceURI}`);
            });
        } else console.error('ttsVoiceSelect not found!');

        // New: Test TTS button listener
        if (testTTSButton) {
            testTTSButton.addEventListener('click', () => {
                console.log('[AIChat] Test TTS button clicked.');
                this.speak("This is a test of the selected voice.");
            });
        } else console.error('testTTSButton not found!');


        // This button now ONLY enters the conversation mode (shows overlay)
        if (conversationModeButton) {
            conversationModeButton.addEventListener('click', () => {
                console.log('[AIChat] Entering conversation mode.');
                this.enterConversationMode();
            });
        }

        // NEW LOGIC FOR CONVERSATION BIG BUTTON
        if (conversationBigButton) {
            conversationBigButton.addEventListener('click', () => {
                if (!this.conversationEnabled) {
                    console.warn('[AIChat] Conversation button clicked but conversation mode is not enabled.');
                    return;
                }

                if (this.aiIsSpeaking) {
                    // If AI is speaking, pressing the button should stop AI speech
                    console.log('[AIChat] Big button clicked: Stopping AI speech.');
                    window.speechSynthesis.cancel();
                    this.aiIsSpeaking = false; // Ensure flag is reset
                    this.updateConversationButtonState(); // Update button to TAP TO SPEAK immediately
                    // After stopping AI, should it automatically start listening for user input?
                    // No, per new requirement. User has to tap again.
                } else if (this.isListening) {
                    // If currently listening, pressing the button stops listening
                    console.log('[AIChat] Big button clicked: Stopping listening.');
                    this.stopListening();
                } else {
                    // If not listening and AI is not speaking, pressing the button starts listening
                    console.log('[AIChat] Big button clicked: Starting listening.');
                    this.startListening();
                }
            });
        }

        if (exitConversationButton) {
            exitConversationButton.addEventListener('click', () => {
                console.log('[AIChat] Exiting conversation mode.');
                this.exitConversationMode();
            });
        }
    }

    // New: Update the state (text and class) of the big conversation button
    updateConversationButtonState() {
        const bigButton = this.shadowRoot.getElementById('conversationBigButton');
        if (!bigButton) return;

        if (this.aiIsSpeaking) {
            bigButton.textContent = 'AI SPEAKING...';
            bigButton.classList.add('speaking');
            bigButton.classList.remove('listening');
        } else if (this.isListening) {
            bigButton.textContent = 'LISTENING... TAP TO STOP';
            bigButton.classList.add('listening');
            bigButton.classList.remove('speaking');
        } else {
            bigButton.textContent = 'TAP TO SPEAK';
            bigButton.classList.remove('listening');
            bigButton.classList.remove('speaking');
        }
    }


    // New: Toggle visibility of conversation settings and button
    toggleConversationSettingsVisibility() {
        const ttsVoiceSelectContainer = this.shadowRoot.getElementById('ttsVoiceSelectContainer');
        const conversationModeButton = this.shadowRoot.getElementById('conversationModeButton');

        if (ttsVoiceSelectContainer) {
            // Make sure the entire container (including the new button) is hidden/shown
            ttsVoiceSelectContainer.style.display = this.conversationEnabled ? 'flex' : 'none'; // Changed to flex for horizontal layout
        }
        if (conversationModeButton) {
            // The conversationModeButton should only appear if conversationEnabled is true
            conversationModeButton.style.display = this.conversationEnabled ? 'block' : 'none';
        }
        console.log(`[AIChat] Conversation settings visibility toggled. Display: ${this.conversationEnabled ? 'visible' : 'hidden'}`);
    }

    renderHistory() {
        const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
        if (!rawTextOutputDiv) return;

        // Clear existing content if it's the first render or a full refresh
        rawTextOutputDiv.innerHTML = '';

        // Filter out the system message for display, as it's typically hidden
        const displayMessages = this.messages.filter(msg => msg.role !== 'system');

        displayMessages.forEach(msg => {
            const p = document.createElement('p');
            // When rendering history, ensure raw text by setting textContent
            p.textContent = `${msg.role === 'user' ? 'You' : 'AI'}: ${msg.content}`;
            rawTextOutputDiv.appendChild(p);
        });
        rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;
        console.log(`[AIChat] Chat history rendered. Message count: ${displayMessages.length}`);
    }

    // New: TTS Functionality
    async loadTTSVoices() {
        return new Promise(resolve => {
            const speechSynth = window.speechSynthesis;
            if (!speechSynth) {
                console.warn("[AIChat] Speech Synthesis API not supported by this browser.");
                resolve();
                return;
            }

            const populateAndResolve = () => {
                this.ttsVoices = speechSynth.getVoices();
                console.log("[AIChat] Loaded TTS voices:", this.ttsVoices.map(v => `${v.name} (${v.lang})`)); // VERIFICATION LOG
                if (this.ttsVoices.length === 0) {
                    console.warn("[AIChat] No TTS voices found on the system after loading.");
                }
                this.populateTTSVoiceDropdown(); // Populate dropdown immediately
                resolve();
            };

            // Check if voices are already loaded
            if (speechSynth.getVoices().length > 0) {
                console.log("[AIChat] TTS voices already loaded.");
                populateAndResolve();
            } else {
                // If not, wait for voices to be loaded
                console.log("[AIChat] Waiting for 'voiceschanged' event for TTS voices.");
                speechSynth.onvoiceschanged = populateAndResolve;

                // Fallback: In some browsers (like Chrome), onvoiceschanged might not fire reliably
                // if voices are already loaded or if the event is missed.
                // We'll try to populate after a small delay as a last resort,
                // but only if onvoiceschanged hasn't already done its job.
                setTimeout(() => {
                    if (this.ttsVoices.length === 0) { // Only if still empty after potential onvoiceschanged
                        console.warn("[AIChat] TTS voices not immediately loaded or onvoiceschanged missed, trying fallback populate.");
                        populateAndResolve();
                    }
                }, 1500); // Increased delay slightly
            }
        });
    }

    populateTTSVoiceDropdown() {
        const ttsVoiceSelect = this.shadowRoot.getElementById('ttsVoiceSelect');
        if (!ttsVoiceSelect) {
            console.error("TTS voice select element not found!");
            return;
        }
        ttsVoiceSelect.innerHTML = ''; // Clear existing options
        console.log(`[populateTTSVoiceDropdown] Populating dropdown with ${this.ttsVoices.length} voices.`);


        if (this.ttsVoices.length === 0) {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "No voices available";
            option.disabled = true;
            ttsVoiceSelect.appendChild(option);
            ttsVoiceSelect.disabled = true; // Disable dropdown if no voices
            console.warn("[populateTTSVoiceDropdown] No TTS voices to populate, dropdown disabled.");
            return;
        }

        this.ttsVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voiceURI;
            option.textContent = `${voice.name} (${voice.lang})`;
            if (voice.default) {
                option.textContent += ' — Default';
            }
            ttsVoiceSelect.appendChild(option);
        });

        // MODIFIED LOGIC: Ensure the cached voice is selected AFTER all options are added.
        // If the cached voice is still available, select it.
        if (this.selectedTTSVoiceURI && ttsVoiceSelect.querySelector(`option[value="${this.selectedTTSVoiceURI}"]`)) {
            ttsVoiceSelect.value = this.selectedTTSVoiceURI;
            console.log(`[populateTTSVoiceDropdown] Dropdown value explicitly set to cached URI: "${this.selectedTTSVoiceURI}"`);
        } else {
            // If no cached voice or cached voice is no longer available,
            // default to the first available voice and update localStorage.
            if (this.ttsVoices.length > 0) {
                this.selectedTTSVoiceURI = this.ttsVoices[0].voiceURI;
                ttsVoiceSelect.value = this.selectedTTSVoiceURI;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY, this.selectedTTSVoiceURI);
                console.log(`[populateTTSVoiceDropdown] No valid cached voice, defaulting to first available: "${this.selectedTTSVoiceURI}". Local storage updated.`);
            } else {
                // No voices available at all
                this.selectedTTSVoiceURI = null;
                ttsVoiceSelect.value = "";
                localStorage.removeItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY);
                console.warn("[populateTTSVoiceDropdown] No voices available, selectedTTSVoiceURI cleared.");
            }
        }
        ttsVoiceSelect.disabled = false; // Ensure dropdown is enabled if voices are present
        console.log(`[populateTTSVoiceDropdown] Final dropdown selection: "${ttsVoiceSelect.value}"`);
    }

    speak(text) {
        if (!window.speechSynthesis) {
            console.warn("[AIChat] Speech Synthesis API not supported by this browser.");
            return;
        }
        if (!this.selectedTTSVoiceURI) {
            console.warn("[AIChat] No TTS voice selected or available, cannot speak.");
            // Even if no voice, still try to trigger AI speaking flag reset
            this.aiIsSpeaking = false;
            this.updateConversationButtonState(); // Update button state to TAP TO SPEAK
            // REMOVED: Auto-restart listening if no voice selected
            return;
        }

        // If currently speaking, stop it before starting a new one
        window.speechSynthesis.cancel();
        this.aiIsSpeaking = true; // NEW: Set flag when AI starts speaking
        this.updateConversationButtonState(); // NEW: Update button state immediately
        console.log(`[AIChat] Speaking: "${text.substring(0, 50)}..."`);

        const utterance = new SpeechSynthesisUtterance(text);
        const selectedVoice = this.ttsVoices.find(voice => voice.voiceURI === this.selectedTTSVoiceURI);

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else {
            console.warn("[AIChat] Selected TTS voice not found or not loaded, using default system voice.");
            // Optionally, try to find a default voice or the first available if selected isn't found
            utterance.voice = this.ttsVoices.find(voice => voice.default) || this.ttsVoices[0] || null;
            if (!utterance.voice) {
                console.error("[AIChat] No default or fallback TTS voice could be found.");
                this.aiIsSpeaking = false; // Reset flag if speaking failed
                this.updateConversationButtonState(); // Update button state to TAP TO SPEAK
                // REMOVED: Auto-restart listening if voice lookup fails
                return;
            }
        }

        utterance.pitch = 1; // 0 to 2, default 1
        utterance.rate = 1;  // 0.1 to 10, default 1

        // NEW: onstart listener for precise button state update
        utterance.onstart = () => {
            console.log('[AIChat] TTS speaking actually started.');
            this.aiIsSpeaking = true;
            this.updateConversationButtonState(); // Update button state to "AI SPEAKING..."
        };

        // MODIFIED: Add onend listener to the utterance to handle restart of STT
        utterance.onend = () => {
            console.log('[AIChat] TTS speaking ended. AI is no longer speaking.');
            this.aiIsSpeaking = false; // Reset flag when speaking ends
            this.updateConversationButtonState(); // Update button state to TAP TO SPEAK
            // REMOVED: Auto-restart listening for user input
        };

        utterance.onerror = (event) => {
            console.error('[AIChat] TTS error:', event);
            this.aiIsSpeaking = false; // Reset flag on error
            this.updateConversationButtonState(); // Update button state to TAP TO SPEAK
            // REMOVED: Auto-restart listening on error
        };

        window.speechSynthesis.speak(utterance);
    }

    // New: STT Functionality
    initializeSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("[AIChat] Speech Recognition API not supported by this browser.");
            return;
        }

        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = true; // IMPORTANT: Set to true for continuous listening
        this.speechRecognition.interimResults = false; // Only final results
        this.speechRecognition.lang = 'en-US'; // Set a default language (consider making this configurable)

        this.speechRecognition.onstart = () => {
            console.log('[AIChat] Speech recognition started');
            this.isListening = true;
            this.updateConversationButtonState(); // Update button to 'LISTENING...'
            this.currentSpeechRecognitionText = ''; // Clear previous STT text
            // Clear the text input div when listening starts
            const textInputDiv = this.shadowRoot.getElementById('textInput');
            if (textInputDiv) textInputDiv.textContent = '';
        };

        this.speechRecognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                // Append or replace, depending on how you want to accumulate.
                // For continuous, often you only care about the latest final result for the current segment.
                // Let's replace for simplicity, or concatenate if you expect user to speak multiple sentences.
                // If the user taps the button, `this.currentSpeechRecognitionText` will be sent.
                this.currentSpeechRecognitionText = finalTranscript.trim();
                // Update the text input area with the recognized speech for visual feedback
                const textInputDiv = this.shadowRoot.getElementById('textInput');
                if (textInputDiv) {
                    textInputDiv.textContent = this.currentSpeechRecognitionText;
                    console.log(`[AIChat] STT Result: "${this.currentSpeechRecognitionText}"`);
                }
            }
        };

        this.speechRecognition.onerror = (event) => {
            console.error('[AIChat] Speech recognition error:', event.error);
            this.isListening = false;
            this.updateConversationButtonState(); // Update button to TAP TO SPEAK

            if (this.conversationEnabled) {
                let errorMessage = `Speech recognition error: ${event.error}`;
                if (event.error === 'not-allowed') {
                    errorMessage = "Microphone permission denied. Please enable it in your browser settings.";
                } else if (event.error === 'no-speech') {
                    errorMessage = "No speech detected. Please try again.";
                } else if (event.error === 'aborted') {
                    // This often happens when stop() is called explicitly, not necessarily an error to speak
                    console.log("[AIChat] Speech recognition aborted (e.g., by stop()).");
                    // If aborted, and there's text, we want to send it.
                    if (this.currentSpeechRecognitionText.trim() !== '') {
                        console.log(`[AIChat] Aborted, sending message from STT: "${this.currentSpeechRecognitionText.trim().substring(0, 50)}..."`);
                        this.sendMessage(this.currentSpeechRecognitionText.trim());
                        this.currentSpeechRecognitionText = ''; // Clear for next turn
                    } else {
                        // If aborted and no text, it means user stopped without speaking.
                        // We still want to allow them to speak again without immediate auto-restart.
                        console.log('[AIChat] Aborted with no speech. Awaiting user input.');
                    }
                    return; // Don't speak for 'aborted'
                }
                this.speak(errorMessage); // Speak the error message
            }
        };

        // NEW LOGIC FOR onend with continuous = true
        this.speechRecognition.onend = () => {
            console.log('[AIChat] Speech recognition ended.');
            this.isListening = false;
            this.updateConversationButtonState(); // Update button to TAP TO SPEAK

            // If text was recognized (meaning user spoke and then hit stop, or recognition stopped naturally with final text)
            if (this.currentSpeechRecognitionText.trim() !== '') {
                console.log(`[AIChat] Sending message from STT: "${this.currentSpeechRecognitionText.trim().substring(0, 50)}..."`);
                this.sendMessage(this.currentSpeechRecognitionText.trim());
                this.currentSpeechRecognitionText = ''; // Clear for next turn
            } else {
                console.log('[AIChat] Speech recognition ended with no recognized text (or explicitly stopped with no final text).');
                // If it ended without text and conversation mode is enabled, and AI is not speaking,
                // this means the user pressed stop without speaking, or the mic timed out.
                // We do NOT want to auto-restart listening here if user explicitly stopped and said nothing.
                // They should manually tap "TAP TO SPEAK" again.
                // Unless the goal is to *always* listen after an AI response, in which case the restart happens in speak()'s onend.
                // For a manual stop, we leave it in 'TAP TO SPEAK' state.
            }
        };
    }

    startListening() {
        if (this.speechRecognition) {
            // NEW: Cancel any ongoing TTS before starting STT
            if (window.speechSynthesis && window.speechSynthesis.speaking) {
                console.log('[AIChat] Cancelling ongoing TTS before starting listening.');
                window.speechSynthesis.cancel();
                this.aiIsSpeaking = false; // Reset AI speaking flag
                this.updateConversationButtonState(); // Update button to neutral state before listening
            }

            if (!this.isListening) {
                try {
                    this.speechRecognition.start();
                } catch (e) {
                    console.error("[AIChat] Error starting speech recognition:", e);
                    if (e.message.includes("recognition has already started")) {
                        console.warn("[AIChat] Speech recognition already active.");
                        this.isListening = true; // Ensure state is correct
                        this.updateConversationButtonState(); // Update button state
                    } else if (e.message.includes("not allowed")) {
                        if (this.conversationEnabled) {
                            this.speak("Microphone permission denied. Please enable it in your browser settings.");
                        }
                        this.isListening = false; // It failed to start
                        this.updateConversationButtonState(); // Update button state
                    }
                }
            } else {
                console.warn("[AIChat] Speech Recognition already listening.");
                this.updateConversationButtonState(); // Just ensure button state is correct
            }
        } else {
            console.error("[AIChat] Speech Recognition not initialized.");
        }
    }

    stopListening() {
        if (this.speechRecognition && this.isListening) {
            this.speechRecognition.stop();
            console.log('[AIChat] Speech recognition explicitly stopped.');
            // onend will handle the state update and message sending.
        } else {
            console.warn("[AIChat] Speech Recognition not active to stop.");
            this.updateConversationButtonState(); // Ensure button is correct if not listening
        }
    }

    // New: Conversation Mode entry/exit
    enterConversationMode() {
        const mainChatTool = this.shadowRoot.getElementById('mainChatTool');
        const conversationOverlay = this.shadowRoot.getElementById('conversationOverlay');

        if (mainChatTool && conversationOverlay) {
            mainChatTool.style.display = 'none';         // Hide the main chat tool
            conversationOverlay.style.display = 'flex'; // Show the overlay
            console.log('[AIChat] Entered conversation mode overlay.');
        }

        // Also, cancel any speech Synthesis if it was playing, before showing overlay.
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            this.aiIsSpeaking = false; // Reset the flag
            console.log('[AIChat] Cancelling TTS upon entering conversation mode.');
        }

        // Update the big button to its default state ("TAP TO SPEAK")
        this.isListening = false; // Ensure STT is off when entering
        this.updateConversationButtonState();
    }

    exitConversationMode() {
        const mainChatTool = this.shadowRoot.getElementById('mainChatTool');
        const conversationOverlay = this.shadowRoot.getElementById('conversationOverlay');

        if (mainChatTool && conversationOverlay) {
            mainChatTool.style.display = 'flex';       // Show the main chat tool
            conversationOverlay.style.display = 'none'; // Hide the overlay
            console.log('[AIChat] Exited conversation mode overlay.');
        }

        if (this.isListening) {
            this.stopListening();
        }
        // Cancel any ongoing speech synthesis when exiting conversation mode
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            this.aiIsSpeaking = false; // Reset the flag
            this.updateConversationButtonState(); // Update button state
            console.log('[AIChat] Cancelling TTS upon exiting conversation mode.');
        }
    }

    async sendMessage(userPromptFromSTT = null) {
        // If STT provided a prompt, use it. Otherwise, get from text input.
        const userPrompt = userPromptFromSTT !== null ? userPromptFromSTT : this.stripHtml(this.shadowRoot.getElementById('textInput').innerHTML).trim();
        const temperature = parseFloat(this.shadowRoot.getElementById('temperatureInput').value);
        const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
        const textInputDiv = this.shadowRoot.getElementById('textInput');

        if (!userPrompt) {
            rawTextOutputDiv.textContent = 'Please enter a user prompt.';
            if (this.conversationEnabled && this.shadowRoot.getElementById('conversationOverlay').style.display === 'flex') {
                this.speak("Please enter a user prompt.");
            }
            console.warn('[AIChat] Send message failed: No user prompt.');
            // If no prompt and in conversation, and AI isn't speaking, we expect user to re-tap "TAP TO SPEAK"
            return; // Do not auto-restart listening here.
        }

        if (isNaN(temperature) || temperature < 0 || temperature > 1) {
            rawTextOutputDiv.textContent = 'Please enter a valid temperature between 0.0 and 1.0.';
            if (this.conversationEnabled && this.shadowRoot.getElementById('conversationOverlay').style.display === 'flex') {
                this.speak("Please enter a valid temperature between zero point zero and one point zero.");
            }
            console.warn('[AIChat] Send message failed: Invalid temperature.');
            // If invalid temperature and in conversation, we expect user to re-tap "TAP TO SPEAK"
            return; // Do not auto-restart listening here.
        }

        // Add user message to history and display
        this.messages.push({ role: 'user', content: userPrompt });
        this.renderHistory(); // Update display with user's new message
        console.log(`[AIChat] User message added: "${userPrompt.substring(0, 50)}..."`);

        // Clear the user input box immediately if not from STT (STT already updates it)
        if (userPromptFromSTT === null) {
            textInputDiv.textContent = '';
        } else {
             // If from STT, clear it immediately after sending to prepare for AI response
            textInputDiv.textContent = '';
        }


        // Add a temporary "Generating response..." message to the display
        const generatingMessageP = document.createElement('p');
        generatingMessageP.textContent = 'AI: Generating response...';
        rawTextOutputDiv.appendChild(generatingMessageP);
        rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;


        // The payload now uses the accumulated history in this.messages
        const payload = {
            "model": this.currentModel,
            "messages": this.messages, // Send the full history
            "temperature": temperature,
            "stream": true,
            "private": false
        };

        let fullResponse = ''; // Accumulate the streamed response here
        console.log(`[AIChat] Sending API request to ${OPENAI_COMPLETION_URL} with payload:`, payload);

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

            // Remove the "Generating response..." message
            if (rawTextOutputDiv.contains(generatingMessageP)) {
                rawTextOutputDiv.removeChild(generatingMessageP);
            }

            // Create a new paragraph for the AI's streamed response
            const aiResponseParagraph = document.createElement('p');
            aiResponseParagraph.textContent = 'AI: '; // Start AI response paragraph using textContent
            rawTextOutputDiv.appendChild(aiResponseParagraph);
            rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;

            console.log('[AIChat] Starting to stream AI response...');
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
                            // This catch block is common for [DONE] or other non-JSON stream messages.
                            // console.warn("Received non-JSON data or marker:", data); // Can be noisy
                        }
                    }
                }
            }

            // After streaming is complete, add the full AI response to history
            this.messages.push({ role: 'assistant', content: fullResponse });
            // Save updated history (this will be cleared on next page load if localStorage.removeItem is active)
            localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));
            this.renderHistory(); // Final render to ensure proper formatting and update scroll
            console.log(`[AIChat] Full AI response received and added to history: "${fullResponse.substring(0, 50)}..."`);

            // Speak the AI response if conversation mode is enabled AND the overlay is active
            if (this.conversationEnabled && this.shadowRoot.getElementById('conversationOverlay').style.display === 'flex') {
                // Ensure any previous speech is cancelled before speaking new response
                window.speechSynthesis.cancel();
                // Check if a voice is selected before attempting to speak
                if (this.selectedTTSVoiceURI) {
                    this.speak(fullResponse);
                    // The restart of STT will happen in the utterance's onend handler
                    // (But we removed it, so now it will just go to TAP TO SPEAK)
                } else {
                    console.warn('[AIChat] Conversation mode active, but no TTS voice selected. AI response will not be spoken aloud.');
                    // If no voice, but in conversation mode, do not auto-restart listening
                    // It will stay in "TAP TO SPEAK" mode
                }
            }


        } catch (error) {
            console.error("[AIChat] Error sending message:", error);
            // Remove the "Generating response..." message if an.error occurred during stream
            if (rawTextOutputDiv.contains(generatingMessageP)) {
                rawTextOutputDiv.removeChild(generatingMessageP);
            }
            // Add a dedicated error message to the chat display
            const errorP = document.createElement('p');
            errorP.textContent = `AI: Error: ${error.message}`;
            errorP.style.color = 'red'; // Style error message
            rawTextOutputDiv.appendChild(errorP);
            rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;


            // If an error occurs, remove the last user message from history as no valid AI response was received
            this.messages.pop();
            localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));
            // Speak the error message
            if (this.conversationEnabled && this.shadowRoot.getElementById('conversationOverlay').style.display === 'flex') {
                window.speechSynthesis.cancel();
                this.speak(`Error: ${error.message}`);
                // If TTS speaks the error, it will just go to TAP TO SPEAK after.
                // No auto-restart here.
            }
            // In case of error, regardless of TTS, the conversation button should be "TAP TO SPEAK"
            this.aiIsSpeaking = false;
            this.isListening = false;
            this.updateConversationButtonState();
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
                    position: relative; /* For conversation overlay positioning */
                }

                /* Main chat tool container */
                #mainChatTool {
                    display: flex; /* This will be flex when visible */
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
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

                #modelSelect, #systemPromptSelect, #ttsVoiceSelect { /* Apply same style to both selects */
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

                /* New: Checkbox and label styling */
                .checkbox-group {
                    display: flex;
                    align-items: center;
                    margin-bottom: 8px;
                    gap: 5px; /* Space between checkbox and label */
                }
                .checkbox-group input[type="checkbox"] {
                    width: auto; /* Override full width from input[type="number"] */
                    margin: 0; /* Remove default margin */
                }
                .checkbox-group label {
                    margin-bottom: 0; /* Remove bottom margin for inline label */
                    font-weight: normal; /* Less bold for a checkbox label */
                }
                /* Flex container for the TTS voice select and test button */
                .tts-select-group {
                    display: flex;
                    align-items: center; /* Vertically align items */
                    gap: 8px; /* Space between select and button */
                }


                /* Styling for both contenteditable divs (user input and system input) */
                #textInput, #systemInput {
                    flex-grow: 1; /* Allow text input to take available space */
                    border: 1px solid #ddd; /* Re-added border for clear input field demarcation */
                    background-color: #fff; /* Solid background for input */
                    padding: 8px; /* Consistent padding */
                    min-height: 30px;
                    max-height: 120px; /* Limit height of input area */
                    overflow-y: auto;
                    border-radius: 4px; /* Consistent border-radius */
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
                    border-color: #007bff; /* Example: highlight border on focus */
                    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
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
                    /* resize: vertical; Removing resize for rawTextOutputDiv, typically not resizable */
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

                /* --- New: Conversation Overlay Styles --- */
                #conversationOverlay {
                    position: absolute; /* Position it relative to the :host */
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.9); /* Dark overlay */
                    display: none; /* Hidden by default */
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 99999999999; /* Super high z-index to ensure it's on top */
                    gap: 20px;
                }

                #conversationBigButton {
                    width: 80%;
                    height: 80%;
                    max-width: 500px; /* Limit size for desktop */
                    max-height: 500px;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 50%; /* Make it a circle */
                    font-size: 2.5em; /* Large text for interaction */
                    cursor: pointer;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    transition: background-color 0.3s ease, transform 0.1s ease;
                    text-align: center;
                    user-select: none; /* Prevent text selection */
                    font-weight: bold;
                    flex-direction: column; /* Allow text to wrap if needed */
                    padding: 20px;
                    box-sizing: border-box;
                    line-height: 1.2;
                }
                #conversationBigButton:hover {
                    background-color: #0056b3;
                }
                #conversationBigButton.listening {
                    background-color: #dc3545; /* Red when listening */
                    box-shadow: 0 0 0 0.5em rgba(220, 53, 69, 0.5); /* Pulse effect */
                    animation: pulse 1.5s infinite;
                }
                /* NEW: Style for AI SPEAKING state */
                #conversationBigButton.speaking {
                    background-color: #ffc107; /* Orange for speaking */
                    color: #333; /* Darker text for contrast */
                    box-shadow: 0 0 0 0.5em rgba(255, 193, 7, 0.5); /* Orange pulse */
                    animation: pulse-orange 1.5s infinite;
                }
                @keyframes pulse-orange {
                    0% {
                        box-shadow: 0 0 0 0 rgba(255, 193, 7, 0.5);
                    }
                    70% {
                        box-shadow: 0 0 0 1em rgba(255, 193, 7, 0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(255, 193, 7, 0);
                    }
                }


                @keyframes pulse {
                    0% {
                        box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.5);
                    }
                    70% {
                        box-shadow: 0 0 0 1em rgba(220, 53, 69, 0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(220, 53, 69, 0);
                    }
                }

                #exitConversationButton {
                    background: none;
                    border: 1px solid white;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 1em;
                    position: absolute;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 1001; /* Ensure it's above the big button */
                }
                #exitConversationButton:hover {
                    background-color: rgba(255, 255, 255, 0.2);
                }
            </style>

            <div id="mainChatTool" style="display: flex;">
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
                        <button id="conversationModeButton" class="icon-button" title="Enter Conversation Mode" style="display: none;">🗣️</button>
                        <button id="clearChatButton" class="icon-button" title="Clear Conversation">🗑️</button>
                    </div>
                </div>

                <div id="systemInputContainer" class="section">
                    <div class="checkbox-group">
                        <input type="checkbox" id="conversationEnabledCheckbox">
                        <label for="conversationEnabledCheckbox">Enable Conversation Mode</label>
                    </div>
                    <div class="input-group" id="ttsVoiceSelectContainer" style="display: none;">
                        <label for="ttsVoiceSelect">TTS Voice:</label>
                        <div class="tts-select-group"> <select id="ttsVoiceSelect"></select>
                            <button id="testTTSButton" class="icon-button" title="Test Voice">▶️</button>
                        </div>
                    </div>
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
            </div>

            <div id="conversationOverlay">
                <button id="conversationBigButton">TAP TO SPEAK</button>
                <button id="exitConversationButton">Exit Conversation</button>
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
                    // The connectedCallback will handle initialization for new elements
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
        // connectedCallback will be called automatically by the browser for existing elements
    });
});


