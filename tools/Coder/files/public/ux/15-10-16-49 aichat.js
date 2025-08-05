




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
        this.selectedTTSVoiceURI = null; // Stores the URI of the selected voice (SOURCE OF TRUTH)
        this.speechRecognition = null;
        this.isListening = false; // Is SpeechRecognition active?
        this.currentSpeechRecognitionText = ''; // To accumulate STT results
        this.aiIsSpeaking = false; // Is SpeechSynthesis active? (NEW: Crucial for button state)

        // NEW: For streaming TTS
        this.currentUtterance = null; // To keep track of the current utterance
        this.ttsQueue = []; // Queue for utterance chunks (FIFO)
        this.isSpeakingFromQueue = false; // Flag to manage the speaking process of our queue
        this.speechBuffer = ''; // Buffer for accumulating text from stream for TTS

        // NEW: To hold the ReadableStreamDefaultReader for cancellation
        this.currentStreamReader = null;

        // NEW: State for permission flow
        this.microphonePermissionRequested = false; // Has user been prompted for microphone?
        this.voiceInitialized = false; // NEW: Has TTS voice been initialized and "Ready to listen" spoken?


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

        // --- New: Conversation Mode Initialization ---
        const cachedConversationEnabled = localStorage.getItem(LOCAL_STORAGE_CONVERSATION_ENABLED_KEY);
        this.conversationEnabled = cachedConversationEnabled === 'true';
        this.shadowRoot.getElementById('conversationEnabledCheckbox').checked = this.conversationEnabled;
        this.toggleConversationSettingsVisibility();
        console.log(`[AIChat] Conversation mode enabled: ${this.conversationEnabled}`);

        // Load TTS voices and set selected voice
        // This MUST happen after initial render where ttsVoiceSelect is created
        await this.loadTTSVoices(); // Ensure voices are loaded before setting cached selection
        console.log('[AIChat] loadTTSVoices completed.'); // New log

        // --- NEW/MODIFIED LOGIC FOR selectedTTSVoiceURI ---
        const cachedTTSVoiceURI = localStorage.getItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY);
        console.log(`[AIChat] Cached TTS Voice URI from localStorage: "${cachedTTSVoiceURI}"`);

        // Attempt to find the cached voice in the loaded voices
        if (cachedTTSVoiceURI && this.ttsVoices.some(voice => voice.voiceURI === cachedTTSVoiceURI)) {
            this.selectedTTSVoiceURI = cachedTTSVoiceURI;
            console.log(`[AIChat] Cached voice "${cachedTTSVoiceURI}" found and will be used.`);
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
        // Update the display label and dropdown (the dropdown is now internal)
        this.updateTTSVoiceDisplay();
        console.log(`[AIChat] Final selected TTS Voice URI after init: "${this.selectedTTSVoiceURI}"`); // New log

        this.initializeSpeechRecognition(); // Initialize STT
        console.log("[AIChat] AIChat component fully connected and initialized.");
    }

    disconnectedCallback() {
        if (this.onCloseCallback) {
            this.onCloseCallback();
        }
        // Stop all ongoing processes when component is removed
        this.stopAIChatResponse();
        console.log('[AIChat] Component disconnected, all active processes stopped.');
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
        const fileName = 'systemPrompts.json'; // CORRECTED TYPO: was 'systemPromp.json'
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

        // Stop any ongoing speech synthesis or recognition if chat is cleared
        this.stopAIChatResponse();
    }

    // NEW: Centralized method to stop all ongoing AI response processes
    stopAIChatResponse() {
        console.log('[AIChat] Stopping ongoing AI response process (stream, TTS, STT).');

        // 1. Stop the response stream (if active)
        if (this.currentStreamReader) {
            try {
                this.currentStreamReader.cancel();
                console.log('[AIChat] Response stream cancelled.');
            } catch (e) {
                console.error('[AIChat] Error cancelling stream reader:', e);
            } finally {
                this.currentStreamReader = null; // Clear the reference
            }
        }

        // 2. Clear the TTS FIFO queue and stop active speaking
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel(); // Stop any currently active utterance
            this.aiIsSpeaking = false; // Reset AI speaking flag
            this.isSpeakingFromQueue = false; // Reset our queue processing flag
            this.ttsQueue = []; // Clear the custom queue of pending utterances
            this.currentUtterance = null; // Clear reference to current utterance
            this.speechBuffer = ''; // Clear any buffered text for TTS
            console.log('[AIChat] TTS cancelled and queue cleared.');
        }

        // 3. Stop Speech Recognition (if active)
        if (this.isListening) {
            this.stopListening(); // This will handle its own state updates
            console.log('[AIChat] Speech recognition stopped.');
        }

        // 4. Update the conversation button state to neutral "TAP TO SPEAK"
        this.updateConversationButtonState();
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
        const ttsVoiceSettingsButton = this.shadowRoot.getElementById('ttsVoiceSettingsButton'); // New button to expose dropdown
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
                // If conversation mode is disabled, stop any ongoing speech or listening
                if (!this.conversationEnabled) {
                    this.stopAIChatResponse();
                    console.log('[AIChat] Conversation mode disabled, cancelling active processes.');
                }
            });
        }

        // --- NEW: TTS Voice Settings Button Listener ---
        const ttsVoiceSelectContainer = this.shadowRoot.getElementById('ttsVoiceSelectContainer');
        if (ttsVoiceSettingsButton) {
            ttsVoiceSettingsButton.addEventListener('click', () => {
                // Toggle visibility of the actual dropdown
                const isHidden = ttsVoiceSelect.style.display === 'none' || ttsVoiceSelect.style.display === '';
                ttsVoiceSelect.style.display = isHidden ? 'block' : 'none';
                console.log(`[AIChat] TTS Voice Select dropdown visibility toggled to: ${ttsVoiceSelect.style.display}`);
            });
        }

        if (ttsVoiceSelect) {
            ttsVoiceSelect.addEventListener('change', (event) => {
                this.selectedTTSVoiceURI = event.target.value; // Update the property
                localStorage.setItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY, this.selectedTTSVoiceURI);
                this.updateTTSVoiceDisplay(); // Update the label
                console.log(`[AIChat] TTS voice changed, saving to localStorage: ${this.selectedTTSVoiceURI}`);
            });
        } else console.error('ttsVoiceSelect not found!');

        // New: Test TTS button listener
        if (testTTSButton) {
            testTTSButton.addEventListener('click', () => {
                console.log('[AIChat] Test TTS button clicked.');
                // Stop any current processes before testing a voice
                this.stopAIChatResponse();
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

        // NEW LOGIC FOR CONVERSATION BIG BUTTON - Handles permission and then listening
        if (conversationBigButton) {
            conversationBigButton.addEventListener('click', () => {
                if (!this.conversationEnabled) {
                    console.warn('[AIChat] Conversation button clicked but conversation mode is not enabled.');
                    return;
                }

                if (!this.microphonePermissionRequested) {
                    console.log('[AIChat] First click: Requesting microphone permission.');
                    this.requestMicrophonePermission();
                } else if (!this.voiceInitialized) { // NEW: Handle initializing voice separately
                    console.log('[AIChat] Initializing voice and starting listening.');
                    this.initializeTTSAndStartListening();
                }
                else if (this.aiIsSpeaking || this.isListening) {
                    // If AI is speaking or listening, stop everything
                    console.log('[AIChat] Big button clicked: Stopping AI speech/listening.');
                    this.stopAIChatResponse();
                } else {
                    // If not speaking and not listening (after permission), start listening
                    console.log('[AIChat] Big button clicked: Starting continuous listening.');
                    this.startContinuousListening(); // New method for continuous
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

        if (!this.microphonePermissionRequested) {
            bigButton.textContent = 'ALLOW MICROPHONE';
            bigButton.classList.remove('listening', 'speaking');
        } else if (!this.voiceInitialized) { // NEW: State for uninitialized voice
            bigButton.textContent = 'INITIALIZE VOICE';
            bigButton.classList.remove('listening', 'speaking');
        } else if (this.aiIsSpeaking) {
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
        console.log(`[AIChat] Conversation button state updated to: ${bigButton.textContent}`); // New log
    }

    // NEW: Update the display label for the selected TTS voice
    updateTTSVoiceDisplay() {
        const ttsVoiceDisplayLabel = this.shadowRoot.getElementById('ttsVoiceDisplayLabel');
        const selectedVoice = this.ttsVoices.find(voice => voice.voiceURI === this.selectedTTSVoiceURI);

        if (ttsVoiceDisplayLabel) {
            ttsVoiceDisplayLabel.textContent = selectedVoice ? selectedVoice.name : 'No Voice Selected';
            console.log(`[AIChat] TTS Voice Display Label updated to: "${ttsVoiceDisplayLabel.textContent}"`);

            // Also update the hidden dropdown's value
            const ttsVoiceSelect = this.shadowRoot.getElementById('ttsVoiceSelect');
            if (ttsVoiceSelect) {
                ttsVoiceSelect.value = this.selectedTTSVoiceURI || "";
            }
        }
    }


    // New: Toggle visibility of conversation settings and button
    toggleConversationSettingsVisibility() {
        const ttsVoiceSettingsGroup = this.shadowRoot.getElementById('ttsVoiceSettingsGroup');
        const conversationModeButton = this.shadowRoot.getElementById('conversationModeButton');

        if (ttsVoiceSettingsGroup) {
            // Make sure the entire container is hidden/shown
            ttsVoiceSettingsGroup.style.display = this.conversationEnabled ? 'flex' : 'none'; // Changed to flex for horizontal layout
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
                // This is where selectedTTSVoiceURI should be set initially IF IT HASN'T BEEN FROM CACHE
                // This ensures we have a default if localStorage was empty or invalid
                if (!this.selectedTTSVoiceURI && this.ttsVoices.length > 0) {
                    this.selectedTTSVoiceURI = this.ttsVoices[0].voiceURI;
                    localStorage.setItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY, this.selectedTTSVoiceURI);
                    console.log(`[AIChat] Defaulting selected TTS voice to first available: "${this.selectedTTSVoiceURI}"`);
                }
                this.updateTTSVoiceDisplay(); // Ensure display label is updated
                console.log(`[AIChat] resolve() called from populateAndResolve. Selected TTS Voice URI: "${this.selectedTTSVoiceURI}"`); // New log
                resolve();
            };

            // Check if voices are already loaded
            if (speechSynth.getVoices().length > 0) {
                console.log("[AIChat] TTS voices already loaded, populating directly.");
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
                }, 2000); // Increased delay slightly
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

        // Set the internal dropdown's value based on selectedTTSVoiceURI
        // This is important so that when the user opens the dropdown, the correct voice is pre-selected.
        if (this.selectedTTSVoiceURI && ttsVoiceSelect.querySelector(`option[value="${this.selectedTTSVoiceURI}"]`)) {
            ttsVoiceSelect.value = this.selectedTTSVoiceURI;
            console.log(`[populateTTSVoiceDropdown] Dropdown value explicitly set to current selected URI: "${this.selectedTTSVoiceURI}"`);
        } else {
             // If selectedTTSVoiceURI is null or no longer valid, default dropdown to first voice if available
            if (this.ttsVoices.length > 0) {
                this.selectedTTSVoiceURI = this.ttsVoices[0].voiceURI; // Ensure the class property is also updated
                ttsVoiceSelect.value = this.ttsVoices[0].voiceURI;
                console.log(`[populateTTSVoiceDropdown] Current selectedTTSVoiceURI not valid or null, defaulting dropdown and class property to first available: "${this.ttsVoices[0].voiceURI}"`);
            } else {
                ttsVoiceSelect.value = ""; // No voices at all
            }
        }
        ttsVoiceSelect.disabled = false; // Ensure dropdown is enabled if voices are present
        console.log(`[populateTTSVoiceDropdown] Final dropdown selection: "${ttsVoiceSelect.value}"`);

        // Important: Update the display label after dropdown is populated and its value is set
        this.updateTTSVoiceDisplay();
    }

    /**
     * Queues text for speech synthesis. If speech is not ongoing, it starts immediately.
     * Otherwise, it adds the text to a queue.
     * @param {string} text The text to speak.
     */
    speak(text) {
        if (!window.speechSynthesis) {
            console.warn("[AIChat] Speech Synthesis API not supported by this browser.");
            return;
        }
        // Use this.selectedTTSVoiceURI as the source of truth
        if (!this.selectedTTSVoiceURI) {
            console.warn("[AIChat] No TTS voice selected or available, cannot speak.");
            // Even if no voice, still try to trigger AI speaking flag reset
            this.aiIsSpeaking = false;
            this.updateConversationButtonState(); // Update button state to TAP TO SPEAK
            return;
        }

        const selectedVoice = this.ttsVoices.find(voice => voice.voiceURI === this.selectedTTSVoiceURI);
        if (!selectedVoice) {
            console.warn("[AIChat] Selected TTS voice not found or not loaded, cannot speak.");
            this.aiIsSpeaking = false;
            this.updateConversationButtonState();
            return;
        }

        // Add the text to the queue
        this.ttsQueue.push(text);
        console.log(`[AIChat] Text queued for TTS: "${text.substring(0, 50)}..." Current queue size: ${this.ttsQueue.length}`);

        // If not already speaking from our queue, start processing
        if (!this.isSpeakingFromQueue) {
            this._processTTSQueue();
        }
    }

    /**
     * Internal method to process the TTS queue.
     * This method ensures only one utterance from our queue is active at a time.
     */
    _processTTSQueue() {
        if (this.ttsQueue.length === 0) {
            console.log('[AIChat] TTS queue is empty. AI is no longer speaking.');
            this.isSpeakingFromQueue = false;
            this.aiIsSpeaking = false; // Reset flag when all speaking ends
            this.currentUtterance = null; // Clear current utterance
            this.updateConversationButtonState(); // Update button state to TAP TO SPEAK
            return;
        }

        this.isSpeakingFromQueue = true;
        const textToSpeak = this.ttsQueue.shift(); // Get the next item from the FIFO queue

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        const selectedVoice = this.ttsVoices.find(voice => voice.voiceURI === this.selectedTTSVoiceURI);
        utterance.voice = selectedVoice;
        utterance.pitch = 1; // 0 to 2, default 1
        utterance.rate = 1;  // 0.1 to 10, default 1

        utterance.onstart = () => {
            console.log(`[AIChat] TTS speaking started for chunk: "${textToSpeak.substring(0, 50)}..."`);
            this.aiIsSpeaking = true;
            this.updateConversationButtonState();
        };

        utterance.onend = () => {
            console.log(`[AIChat] TTS speaking ended for chunk: "${textToSpeak.substring(0, 50)}..."`);
            this.currentUtterance = null; // Clear current utterance
            this._processTTSQueue(); // Process the next item in the queue
        };

        utterance.onerror = (event) => {
            console.error('[AIChat] TTS error:', event);
            // On error, the whole queue should be cleared and state reset
            this.stopAIChatResponse(); // Use the centralized stop
            console.warn('[AIChat] Clearing TTS queue due to error via stopAIChatResponse().');
        };

        this.currentUtterance = utterance; // Keep track of the current utterance
        window.speechSynthesis.speak(utterance);
    }

    // NEW: Play a very short, silent audio file to activate the audio context.
    // This helps with browser autoplay policies for SpeechSynthesis.
    playSilentSound() {
        // You might need to adjust the path to your silent audio file
        // Ensure 'silent.mp3' or 'silent.wav' exists in your project.
        // For example, if it's in an 'audio' folder: new Audio('audio/silent.mp3');
        const audio = new Audio('silent.mp3');
        audio.volume = 0; // Keep it silent
        audio.play().catch(e => console.warn("[AIChat] Failed to play silent sound:", e));
        console.log('[AIChat] Attempting to play silent sound to activate audio context.');
    }


    // New: STT Functionality
    initializeSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("[AIChat] Speech Recognition API not supported by this browser.");
            return;
        }

        this.speechRecognition = new SpeechRecognition();
        // IMPORTANT: continuous is set to false initially for the permission phase,
        // and only set to true when we start actual continuous listening.
        this.speechRecognition.continuous = false;
        this.speechRecognition.interimResults = false; // Only final results
        this.speechRecognition.lang = 'en-US'; // Set a default language (consider making this configurable)

        // NEW: Flag to differentiate initial permission start from continuous listening start
        let isInitialPermissionRequest = false;

        this.speechRecognition.onstart = () => {
            console.log('[AIChat] Speech recognition started');
            this.isListening = true;
            this.currentSpeechRecognitionText = ''; // Clear previous STT text

            // Determine if this 'onstart' is from the initial permission request
            if (!this.microphonePermissionRequested) {
                isInitialPermissionRequest = true;
                // Microphone permission has been granted
                this.microphonePermissionRequested = true; // Set this flag
                this.voiceInitialized = false; // NEW: Mark voice as not yet initialized
                console.log('[AIChat] Microphone permission granted during initial request.');
                // Immediately stop the initial recognition session after permission is granted
                this.speechRecognition.stop(); // This will trigger onend
            } else {
                // This is a start for actual continuous listening
                console.log('[AIChat] Continuous speech recognition started.');
                this.updateConversationButtonState(); // Update button to 'LISTENING...'
                const textInputDiv = this.shadowRoot.getElementById('textInput');
                if (textInputDiv) textInputDiv.textContent = ''; // Clear input field
            }
        };

        this.speechRecognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
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
            // If the error happens during the initial permission request
            if (event.error === 'not-allowed' || event.error === 'permission-denied') {
                this.microphonePermissionRequested = true; // Still mark as requested, to avoid re-prompting immediately
                this.voiceInitialized = false; // NEW: Ensure voice is marked as uninitialized
                // However, permission was denied, so revert button to allow microphone
                this.updateConversationButtonState(); // Will show "ALLOW MICROPHONE" or "TAP TO SPEAK" based on specific logic
                if (this.conversationEnabled) {
                    this.speak("Microphone permission denied. Please enable it in your browser settings.");
                }
                console.warn('[AIChat] Microphone permission permanently denied or error during initial request.');
            } else {
                // This is an error during actual continuous listening
                this.updateConversationButtonState(); // Update button to TAP TO SPEAK

                let errorMessage = `Speech recognition error: ${event.error}`;
                if (event.error === 'no-speech') {
                    errorMessage = "No speech detected. Please try again.";
                } else if (event.error === 'aborted') {
                    console.log("[AIChat] Speech recognition aborted (e.g., by stop()).");
                    // If aborted, and there's text, we want to send it.
                    if (this.currentSpeechRecognitionText.trim() !== '') {
                        console.log(`[AIChat] Aborted, sending message from STT: "${this.currentSpeechRecognitionText.trim().substring(0, 50)}..."`);
                        this.sendMessage(this.currentSpeechRecognitionText.trim());
                        this.currentSpeechRecognitionText = ''; // Clear for next turn
                    } else {
                        console.log('[AIChat] Aborted with no speech. Awaiting user input.');
                    }
                    return; // Don't speak for 'aborted'
                }
                // Speak the error message (this will queue and speak as usual)
                this.speak(errorMessage);
            }
        };

        // MODIFIED: onend now handles the state transitions carefully
        this.speechRecognition.onend = () => {
            console.log('[AIChat] Speech recognition ended. isInitialPermissionRequest:', isInitialPermissionRequest); // New log
            this.isListening = false; // Always set to false when it ends

            // If this was the initial permission request session that just ended
            if (isInitialPermissionRequest) {
                isInitialPermissionRequest = false; // Reset flag for next potential permission request
                console.log('[AIChat] Initial permission session onend: setting state for TTS initialization click.');
                this.updateConversationButtonState(); // This will now show "INITIALIZE VOICE"
            } else {
                // This is an end for actual continuous listening
                this.updateConversationButtonState(); // Update button to TAP TO SPEAK

                // If text was recognized (meaning user spoke and then hit stop, or recognition stopped naturally with final text)
                if (this.currentSpeechRecognitionText.trim() !== '') {
                    console.log(`[AIChat] Sending message from STT: "${this.currentSpeechRecognitionText.trim().substring(0, 50)}..."`);
                    this.sendMessage(this.currentSpeechRecognitionText.trim());
                    this.currentSpeechRecognitionText = ''; // Clear for next turn
                } else {
                    console.log('[AIChat] Speech recognition ended with no recognized text (or explicitly stopped with no final text).');
                }
            }
        };
    }

    // NEW: Method to initialize TTS and then potentially start continuous listening
    initializeTTSAndStartListening() {
        if (!this.microphonePermissionRequested) {
            console.warn('[AIChat] Cannot initialize voice: Microphone permission not granted.');
            this.updateConversationButtonState();
            return;
        }
        if (this.voiceInitialized) {
            console.warn('[AIChat] Voice already initialized. Skipping.');
            this.updateConversationButtonState(); // Ensure button is correct
            return;
        }
        if (!this.conversationEnabled) {
            console.warn('[AIChat] Conversation mode not enabled, skipping voice initialization.');
            this.updateConversationButtonState(); // Ensure button is correct
            return;
        }

        this.voiceInitialized = true; // Mark voice as initialized

        // Play silent sound to wake up audio context
        this.playSilentSound();
        console.log('[AIChat] Voice initialized. Speaking "Ready to listen."');

        // Speak "Ready to listen."
        this.speak("Ready to listen.");

        // Wait for TTS to finish, then start continuous listening
        // We'll leverage the onend of the last queued utterance
        // This is a bit tricky, as 'speak' queues. We need to know when the specific "Ready to listen" ends.
        // A simpler approach for this specific scenario:
        // After 'Ready to listen' is spoken, we can then initiate the continuous listening.
        // The `onend` for the `SpeechSynthesisUtterance` for "Ready to listen." is the key.
        const originalOnEnd = this.currentUtterance ? this.currentUtterance.onend : null;

        // Find the specific utterance for "Ready to listen" in the queue
        // This assumes 'Ready to listen' is the first/only thing in the queue when this is called.
        // If 'speak' is always called immediately before this, it should be the `currentUtterance`.
        // However, a more robust way is to add a callback to the `speak` function if we needed to guarantee it.
        // The `_processTTSQueue` actually sets `currentUtterance`.
        // So, we need to check when the `_processTTSQueue` finishes this specific phrase.

        // A better approach: call startContinuousListening after the *first* utterance in the queue (which is "Ready to listen.") finishes.
        const originalProcessQueue = this._processTTSQueue.bind(this);
        this._processTTSQueue = () => {
            // First call to process queue will pick up "Ready to listen."
            if (this.ttsQueue.length > 0 && this.ttsQueue[0] === "Ready to listen.") { // Check if it's the specific phrase
                const utterance = new SpeechSynthesisUtterance(this.ttsQueue[0]); // Peek at the next utterance
                utterance.onend = () => {
                    console.log('[AIChat] "Ready to listen." TTS finished. Starting continuous listening.');
                    this.startContinuousListening(); // Start continuous listening after this specific phrase
                    // Restore original _processTTSQueue after this special behavior
                    this._processTTSQueue = originalProcessQueue;
                    originalProcessQueue(); // Continue processing the rest of the queue (if any, though should be empty)
                };
                utterance.voice = this.ttsVoices.find(v => v.voiceURI === this.selectedTTSVoiceURI);
                utterance.pitch = 1; utterance.rate = 1;
                utterance.onstart = () => {
                    console.log(`[AIChat] TTS speaking started for chunk: "${this.ttsQueue[0].substring(0, 50)}..."`);
                    this.aiIsSpeaking = true;
                    this.updateConversationButtonState();
                };
                utterance.onerror = (event) => {
                    console.error('[AIChat] TTS error during "Ready to listen":', event);
                    this.stopAIChatResponse();
                };
                window.speechSynthesis.speak(utterance);
                this.ttsQueue.shift(); // Remove it from the queue now that we're speaking it
            } else {
                // If it's not the specific "Ready to listen." or queue is empty, behave normally
                originalProcessQueue();
            }
        };

        // Trigger processing the queue for "Ready to listen."
        this._processTTSQueue();

        // Update button state immediately to reflect "AI SPEAKING"
        this.updateConversationButtonState();
    }


    // NEW: Method to request microphone permission (called on first button click)
    requestMicrophonePermission() {
        if (!this.speechRecognition) {
            console.error("[AIChat] Speech Recognition not initialized.");
            return;
        }

        console.log('[AIChat] Attempting to trigger microphone permission prompt.');
        // Set button state to indicate action
        const bigButton = this.shadowRoot.getElementById('conversationBigButton');
        if (bigButton) {
            bigButton.textContent = 'CONNECTING MICROPHONE...';
            bigButton.classList.remove('listening', 'speaking'); // Remove active states
        }

        try {
            // Start a temporary recognition session to trigger the permission prompt
            // onstart will fire if permission is granted, onerror if denied.
            this.speechRecognition.start();
        } catch (e) {
            console.error("[AIChat] Error initiating speech recognition for permission:", e);
            // Fallback for immediate errors, e.g., if already in an active session (shouldn't happen with our logic)
            // If an immediate error occurs before onstart/onerror, we must manually set the flag.
            this.microphonePermissionRequested = true; // Mark as attempted to prevent re-triggering this flow
            this.voiceInitialized = false; // NEW: Ensure voice is marked uninitialized on error
            this.updateConversationButtonState(); // Revert to "ALLOW MICROPHONE" or "INITIALIZE VOICE"
            if (this.conversationEnabled) {
                this.speak("Could not access microphone. Please check your browser settings.");
            }
        }
    }

    // NEW: Method to start continuous listening (called after permission is handled)
    async startContinuousListening() {
        if (!this.speechRecognition) {
            console.error("[AIChat] Speech Recognition not initialized for continuous listening.");
            return;
        }
        if (!this.microphonePermissionRequested) {
            console.warn("[AIChat] Cannot start continuous listening: Microphone permission not yet handled.");
            this.updateConversationButtonState(); // Ensure button reflects permission state
            return;
        }
        if (!this.voiceInitialized) { // NEW: Must have voice initialized before continuous listening
            console.warn("[AIChat] Cannot start continuous listening: Voice not initialized. Click 'INITIALIZE VOICE' first.");
            this.updateConversationButtonState();
            return;
        }
        if (this.isListening) {
            console.warn("[AIChat] Speech Recognition already listening continuously.");
            this.updateConversationButtonState();
            return;
        }

        // Cancel any ongoing TTS or stream before starting STT by calling the central stop
        if (this.aiIsSpeaking || this.currentStreamReader) {
            console.log('[AIChat] Cancelling ongoing TTS/Stream before starting listening via stopAIChatResponse().');
            this.stopAIChatResponse();
            // Wait briefly for stop to propagate, might not be necessary, but safer.
            await new Promise(r => setTimeout(r, 100));
        }

        console.log('[AIChat] Attempting to start continuous speech recognition.');
        try {
            this.speechRecognition.continuous = true; // Set to true for continuous mode
            this.speechRecognition.start();
            // onstart handler will now handle setting isListening = true and updating button
        } catch (e) {
            console.error("[AIChat] Error starting continuous speech recognition:", e);
            this.isListening = false;
            this.updateConversationButtonState(); // Revert button state
            if (e.message.includes("not allowed")) {
                if (this.conversationEnabled) {
                    this.speak("Microphone access issue. Please enable it in your browser settings.");
                }
            }
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

        // Also, cancel any speech Synthesis and stream if it was playing, before showing overlay.
        this.stopAIChatResponse(); // Use the centralized stop
        console.log('[AIChat] Cancelling TTS/Stream upon entering conversation mode via stopAIChatResponse().');

        // Update the big button to its default state ("ALLOW MICROPHONE" or "INITIALIZE VOICE" or "TAP TO SPEAK")
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

        // Stop any ongoing speech synthesis, stream, or recognition when exiting conversation mode
        this.stopAIChatResponse(); // Use the centralized stop
        console.log('[AIChat] Cancelling TTS/Stream/STT upon exiting conversation mode via stopAIChatResponse().');
    }

    async sendMessage(userPromptFromSTT = null) {
        // If STT provided a prompt, use it. Otherwise, get from text input.
        const userPrompt = userPromptFromSTT !== null ? userPromptFromSTT : this.stripHtml(this.shadowRoot.getElementById('textInput').innerHTML).trim();
        const temperature = parseFloat(this.shadowRoot.getElementById('temperatureInput').value);
        const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
        const textInputDiv = this.shadowRoot.getElementById('textInput');

        // NEW: Stop any existing AI speech or stream before sending a new message
        if (this.aiIsSpeaking || this.currentStreamReader) {
            console.log('[AIChat] New message, stopping previous AI response.');
            this.stopAIChatResponse();
        }

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
        this.speechBuffer = ''; // Reset speech buffer for new response
        this.ttsQueue = []; // Clear any previous TTS queue for a new response
        this.isSpeakingFromQueue = false; // Reset the queue processing flag
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
            this.currentStreamReader = reader; // Store the reader for potential cancellation
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

            // NEW: Buffer for accumulating raw stream data for robust SSE parsing
            let streamBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                streamBuffer += decoder.decode(value, { stream: true }); // Append new data to buffer

                // Process all complete events in the buffer
                while (true) {
                    const eventDelimiter = '\n\n';
                    const eventEndIndex = streamBuffer.indexOf(eventDelimiter);

                    if (eventEndIndex === -1) {
                        // No complete event found, wait for more data
                        break;
                    }

                    const eventString = streamBuffer.substring(0, eventEndIndex);
                    streamBuffer = streamBuffer.substring(eventEndIndex + eventDelimiter.length); // Remove processed event from buffer

                    // Process the eventString
                    if (eventString.startsWith('data:')) {
                        const data = eventString.substring(5).trim();

                        if (data === '[DONE]') {
                            // If [DONE] is received, stop processing further events in this loop
                            break; // Break from inner while(true) for processing events
                        }

                        try {
                            // Use optional chaining for safer property access
                            const parsedChunk = JSON.parse(data);
                            const content = parsedChunk.choices?.[0]?.delta?.content;

                            if (content) {
                                fullResponse += content;
                                this.speechBuffer += content; // Add to TTS buffer

                                // Update the display with the full streamed content
                                aiResponseParagraph.textContent = 'AI: ' + fullResponse;
                                rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;

                                // If conversation mode is enabled, attempt to speak chunks
                                if (this.conversationEnabled && this.shadowRoot.getElementById('conversationOverlay').style.display === 'flex') {
                                    // Strategy: Speak by sentence or a buffered word count
                                    // Matches sentence ending punctuation followed by space or end of string
                                    const sentenceEndings = /[.!?](\s|$)/;
                                    const MIN_SPEECH_BUFFER_SIZE = 50;
                                    const MAX_BUFFER_WITHOUT_PUNCTUATION = 200; // Force speak if buffer hits this without a sentence ending

                                    while (true) {
                                        let match = this.speechBuffer.match(sentenceEndings);
                                        let speakableChunk = '';

                                        if (match) {
                                            // Found a sentence ending
                                            const endIndex = match.index + match[0].length;
                                            speakableChunk = this.speechBuffer.substring(0, endIndex);
                                            this.speechBuffer = this.speechBuffer.substring(endIndex);
                                        } else if (this.speechBuffer.length >= MAX_BUFFER_WITHOUT_PUNCTUATION) {
                                            // Buffer is large but no sentence ending, so find the last word break
                                            const lastSpaceIndex = this.speechBuffer.substring(0, MAX_BUFFER_WITHOUT_PUNCTUATION).lastIndexOf(' ');
                                            if (lastSpaceIndex !== -1 && lastSpaceIndex > 0) {
                                                speakableChunk = this.speechBuffer.substring(0, lastSpaceIndex + 1); // Include the space
                                                this.speechBuffer = this.speechBuffer.substring(lastSpaceIndex + 1);
                                            } else {
                                                speakableChunk = this.speechBuffer;
                                                this.speechBuffer = '';
                                            }
                                        } else {
                                            // Not enough content to form a sentence and buffer isn't big enough to force a chunk
                                            break; // Wait for more content
                                        }

                                        if (speakableChunk.trim().length > 0) {
                                            this.speak(speakableChunk.trim());
                                        }
                                        // The original loop condition was quite intricate, simplified to ensure it breaks when no more
                                        // speechable content can be extracted under current rules.
                                        if (this.speechBuffer.length < MIN_SPEECH_BUFFER_SIZE && !match && this.speechBuffer.length < MAX_BUFFER_WITHOUT_PUNCTUATION) {
                                            break;
                                        }
                                    }
                                }
                            }
                        } catch (jsonError) {
                            // This catch block is common for [DONE] or other non-JSON stream messages.
                            // console.warn("Received non-JSON data or marker:", data); // Can be noisy
                        }
                    }
                }
                // If the inner loop broke because of [DONE], we need to break the outer loop too.
                if (streamBuffer.includes('[DONE]')) {
                    break;
                }
            }

            // After streaming is complete, speak any remaining text in the buffer
            if (this.speechBuffer.trim().length > 0 && this.conversationEnabled && this.shadowRoot.getElementById('conversationOverlay').style.display === 'flex') {
                this.speak(this.speechBuffer.trim());
                this.speechBuffer = ''; // Clear buffer
            }

            // After streaming is complete, add the full AI response to history
            this.messages.push({ role: 'assistant', content: fullResponse });
            // Save updated history (this will be cleared on next page load if localStorage.removeItem is active)
            localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));
            this.renderHistory(); // Final render to ensure proper formatting and update scroll
            console.log(`[AIChat] Full AI response received and added to history: "${fullResponse.substring(0, 50)}..."`);


        } catch (error) {
            console.error("[AIChat] Error sending message:", error);
            // Remove the "Generating response..." message if an error occurred during stream
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
            // Speak the error message and stop all processes via the centralized method
            if (this.conversationEnabled && this.shadowRoot.getElementById('conversationOverlay').style.display === 'flex') {
                this.speak(`Error: ${error.message}`);
            }
            // Ensure all active processes are stopped
            this.stopAIChatResponse();

        } finally {
            // Ensure the stream reader is nullified whether successful or failed
            this.currentStreamReader = null;
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
                .input-group input[type="number"] {
                    width: calc(100% - 2px); /* Full width minus border */
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 0.9em;
                    box-sizing: border-box;
                    font-family: inherit;
                    color: #333;
                }
                /* Select element inside input-group to handle its width specifically */
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
                .tts-settings-group { /* Changed name for clarity */
                    display: flex;
                    align-items: center; /* Vertically align items */
                    gap: 8px; /* Space between label/button and dropdown */
                    flex-wrap: wrap; /* Allow wrapping if space is tight */
                }
                .tts-settings-group > div { /* Container for label and test button */
                    display: flex;
                    align-items: center;
                    gap: 5px; /* Space between label and test button */
                    flex-shrink: 0;
                }
                #ttsVoiceSelect {
                    flex-grow: 1; /* Allow dropdown to take space */
                    min-width: 150px; /* Ensure a minimum width */
                    display: none; /* Hidden by default, exposed by button */
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
                    <div class="input-group" id="ttsVoiceSettingsGroup" style="display: none;">
                        <label>TTS Voice:</label>
                        <div class="tts-settings-group">
                            <span id="ttsVoiceDisplayLabel">No Voice Selected</span>
                            <button id="testTTSButton" class="icon-button" title="Test Voice">▶️</button>
                            <button id="ttsVoiceSettingsButton" class="icon-button" title="Select TTS Voice">🔊</button>
                            <select id="ttsVoiceSelect" style="display: none;"></select>
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
                <button id="conversationBigButton">ALLOW MICROPHONE</button>
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




