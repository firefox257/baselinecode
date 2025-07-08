

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
        this.selectedTTSVoiceURI = null;
        this.speechRecognition = null;
        this.isListening = false;
        this.currentSpeechRecognitionText = ''; // To accumulate STT results

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
        // If you want history to persist, comment out the next line:
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

        // --- New: Conversation Mode Initialization ---
        const cachedConversationEnabled = localStorage.getItem(LOCAL_STORAGE_CONVERSATION_ENABLED_KEY);
        this.conversationEnabled = cachedConversationEnabled === 'true';
        this.shadowRoot.getElementById('conversationEnabledCheckbox').checked = this.conversationEnabled;
        this.toggleConversationSettingsVisibility();

        // Load TTS voices and set selected voice
        await this.loadTTSVoices(); // Ensure voices are loaded before setting cached selection
        const cachedTTSVoiceURI = localStorage.getItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY);
        const ttsVoiceSelect = this.shadowRoot.getElementById('ttsVoiceSelect');
        if (ttsVoiceSelect) { // Check if element exists before trying to access it
            if (cachedTTSVoiceURI && this.ttsVoices.some(voice => voice.voiceURI === cachedTTSVoiceURI)) {
                this.selectedTTSVoiceURI = cachedTTSVoiceURI;
                ttsVoiceSelect.value = this.selectedTTSVoiceURI;
            } else if (this.ttsVoices.length > 0) {
                // Default to the first available voice if none cached or cached voice is gone
                this.selectedTTSVoiceURI = this.ttsVoices[0].voiceURI;
                ttsVoiceSelect.value = this.selectedTTSVoiceURI;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY, this.selectedTTSVoiceURI);
            }
        }

        this.initializeSpeechRecognition(); // Initialize STT
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
        const fileName = 'systemPromp.json'; // Note: Typo in filename 'systemPromp.json' -> 'systemPrompts.json'?
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
        // Cancel any ongoing speech synthesis if chat is cleared during a response
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
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
        const conversationModeButton = this.shadowRoot.getElementById('conversationModeButton');
        const conversationBigButton = this.shadowRoot.getElementById('conversationBigButton');
        const exitConversationButton = this.shadowRoot.getElementById('exitConversationButton');


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
                    // User wants to write a custom prompt, keep current content in input field
                    // The systemPrompt variable already holds the last edited custom prompt or default
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
            });
        }

        // --- New: Conversation Mode Event Listeners ---
        if (conversationEnabledCheckbox) {
            conversationEnabledCheckbox.addEventListener('change', (event) => {
                this.conversationEnabled = event.target.checked;
                localStorage.setItem(LOCAL_STORAGE_CONVERSATION_ENABLED_KEY, this.conversationEnabled);
                this.toggleConversationSettingsVisibility();
                // If conversation mode is disabled, stop any ongoing speech
                if (!this.conversationEnabled && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                }
            });
        }

        if (ttsVoiceSelect) {
            ttsVoiceSelect.addEventListener('change', (event) => {
                this.selectedTTSVoiceURI = event.target.value;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY, this.selectedTTSVoiceURI);
                // Optionally, say a test phrase with the new voice
                // this.speak("This is a test of the new voice.");
            });
        }

        // This button now ONLY enters the conversation mode (shows overlay)
        if (conversationModeButton) {
            conversationModeButton.addEventListener('click', () => this.enterConversationMode());
        }

        // This button (inside overlay) toggles listening
        if (conversationBigButton) {
            conversationBigButton.addEventListener('click', () => {
                if (this.isListening) {
                    this.stopListening();
                    // Do not speak "Stop" immediately here, let onend handle it to ensure STT result is processed first
                } else {
                    this.startListening();
                }
            });
        }

        if (exitConversationButton) {
            exitConversationButton.addEventListener('click', () => this.exitConversationMode());
        }
    }

    // New: Toggle visibility of conversation settings and button
    toggleConversationSettingsVisibility() {
        const ttsVoiceSelectContainer = this.shadowRoot.getElementById('ttsVoiceSelectContainer');
        const conversationModeButton = this.shadowRoot.getElementById('conversationModeButton');

        if (ttsVoiceSelectContainer) {
            ttsVoiceSelectContainer.style.display = this.conversationEnabled ? 'block' : 'none';
        }
        if (conversationModeButton) {
            // The conversationModeButton should only appear if conversationEnabled is true
            conversationModeButton.style.display = this.conversationEnabled ? 'block' : 'none';
        }
    }

    renderHistory() {
        const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
        if (!rawTextOutputDiv) return;

        // Clear existing content if it's the first render or a full refresh
        // Otherwise, append
        // rawTextOutputDiv.innerHTML = ''; // Removed this for streaming effect

        // Filter out the system message for display, as it's typically hidden
        const displayMessages = this.messages.filter(msg => msg.role !== 'system');

        // Rebuild content to avoid partial updates if streaming
        rawTextOutputDiv.innerHTML = '';
        displayMessages.forEach(msg => {
            const p = document.createElement('p');
            // When rendering history, ensure raw text by setting textContent
            p.textContent = `${msg.role === 'user' ? 'You' : 'AI'}: ${msg.content}`;
            rawTextOutputDiv.appendChild(p);
        });
        rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;
    }

    // New: TTS Functionality
    async loadTTSVoices() {
        return new Promise(resolve => {
            const speechSynth = window.speechSynthesis;
            if (!speechSynth) {
                console.warn("Speech Synthesis API not supported by this browser.");
                resolve();
                return;
            }

            // Function to populate and resolve
            const populateAndResolve = () => {
                this.ttsVoices = speechSynth.getVoices();
                console.log("Loaded TTS voices:", this.ttsVoices); // VERIFICATION LOG
                if (this.ttsVoices.length === 0) {
                    console.warn("No TTS voices found on the system after loading.");
                }
                this.populateTTSVoiceDropdown();
                resolve();
            };

            // Check if voices are already loaded
            if (speechSynth.getVoices().length > 0) {
                populateAndResolve();
            } else {
                // If not, wait for voices to be loaded
                speechSynth.onvoiceschanged = populateAndResolve;

                // Fallback: In some browsers (like Chrome), onvoiceschanged might not fire reliably
                // if voices are already loaded or if the event is missed.
                // We'll try to populate after a small delay as a last resort,
                // but only if onvoiceschanged hasn't already done its job.
                setTimeout(() => {
                    if (this.ttsVoices.length === 0) { // Only if still empty after potential onvoiceschanged
                        console.warn("TTS voices not immediately loaded or onvoiceschanged missed, trying fallback populate.");
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

        if (this.ttsVoices.length === 0) {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "No voices available";
            option.disabled = true;
            ttsVoiceSelect.appendChild(option);
            ttsVoiceSelect.disabled = true; // Disable dropdown if no voices
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

        // Ensure the cached voice is selected, otherwise default to first available
        if (this.selectedTTSVoiceURI && ttsVoiceSelect.querySelector(`option[value="${this.selectedTTSVoiceURI}"]`)) {
            ttsVoiceSelect.value = this.selectedTTSVoiceURI;
        } else {
            // Default to the first available voice if none cached or cached voice is gone
            this.selectedTTSVoiceURI = this.ttsVoices[0].voiceURI;
            ttsVoiceSelect.value = this.selectedTTSVoiceURI;
            localStorage.setItem(LOCAL_STORAGE_SELECTED_TTS_VOICE_KEY, this.selectedTTSVoiceURI);
        }
        ttsVoiceSelect.disabled = false; // Ensure dropdown is enabled if voices are present
    }

    speak(text) {
        if (!window.speechSynthesis) {
            console.warn("Speech Synthesis API not supported, cannot speak.");
            return;
        }
        if (!this.selectedTTSVoiceURI) {
            console.warn("No TTS voice selected or available, cannot speak.");
            return;
        }

        // If currently speaking, stop it before starting a new one
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        const selectedVoice = this.ttsVoices.find(voice => voice.voiceURI === this.selectedTTSVoiceURI);

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else {
            console.warn("Selected TTS voice not found or not loaded, using default system voice.");
            // Optionally, try to find a default voice or the first available if selected isn't found
            utterance.voice = this.ttsVoices.find(voice => voice.default) || this.ttsVoices[0] || null;
            if (!utterance.voice) {
                console.error("No default or fallback TTS voice could be found.");
                return;
            }
        }

        utterance.pitch = 1; // 0 to 2, default 1
        utterance.rate = 1;  // 0.1 to 10, default 1

        window.speechSynthesis.speak(utterance);
    }

    // New: STT Functionality
    initializeSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("Speech Recognition API not supported by this browser.");
            return;
        }

        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = false; // Set to false to get a single result per activation
        this.speechRecognition.interimResults = false; // Only final results
        this.speechRecognition.lang = 'en-US'; // Set a default language (consider making this configurable)

        this.speechRecognition.onstart = () => {
            console.log('Speech recognition started');
            this.isListening = true;
            this.shadowRoot.getElementById('conversationBigButton').textContent = 'LISTENING... TAP TO STOP'; // Update button text
            this.shadowRoot.getElementById('conversationBigButton').classList.add('listening'); // Add class for styling
            this.currentSpeechRecognitionText = ''; // Clear previous STT text
        };

        this.speechRecognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                this.currentSpeechRecognitionText = finalTranscript.trim(); // Only store the latest final result
                // Update the text input area with the recognized speech
                const textInputDiv = this.shadowRoot.getElementById('textInput');
                if (textInputDiv) {
                    textInputDiv.textContent = this.currentSpeechRecognitionText;
                }
            }
        };

        this.speechRecognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.isListening = false;
            this.shadowRoot.getElementById('conversationBigButton').textContent = 'TAP TO SPEAK';
            this.shadowRoot.getElementById('conversationBigButton').classList.remove('listening');
            // Optionally, speak the error
            if (this.conversationEnabled) {
                let errorMessage = `Speech recognition error: ${event.error}`;
                if (event.error === 'not-allowed') {
                    errorMessage = "Microphone permission denied. Please enable it in your browser settings.";
                } else if (event.error === 'no-speech') {
                    errorMessage = "No speech detected. Please try again.";
                } else if (event.error === 'aborted') {
                    // This often happens when stop() is called, not necessarily an error to speak
                    console.log("Speech recognition aborted (e.g., by stop()).");
                    return; // Don't speak for 'aborted'
                }
                this.speak(errorMessage);
            }
        };

        this.speechRecognition.onend = () => {
            console.log('Speech recognition ended.');
            this.isListening = false;
            this.shadowRoot.getElementById('conversationBigButton').textContent = 'TAP TO SPEAK';
            this.shadowRoot.getElementById('conversationBigButton').classList.remove('listening');

            // Speak "Stop" only if no transcript was captured AND TTS isn't already speaking
            // This prevents "Stop" from interrupting the AI's response or if the user simply stopped listening without speaking.
            if (this.conversationEnabled && !this.currentSpeechRecognitionText.trim() && !window.speechSynthesis.speaking) {
                this.speak("Stop");
            }

            if (this.currentSpeechRecognitionText.trim() !== '') {
                // Automatically send the recognized speech as a message
                this.sendMessage(this.currentSpeechRecognitionText.trim());
                this.currentSpeechRecognitionText = ''; // Clear for next turn
            }
        };
    }

    startListening() {
        if (this.speechRecognition && !this.isListening) {
            try {
                // Stop any ongoing TTS before starting STT
                window.speechSynthesis.cancel();
                this.speechRecognition.start();
            } catch (e) {
                console.error("Error starting speech recognition:", e);
                // Handle cases where recognition is already started or not allowed
                if (e.message.includes("recognition has already started")) {
                    console.warn("Speech recognition already active.");
                    this.isListening = true; // Ensure state is correct if already started
                } else if (e.message.includes("not allowed")) {
                    if (this.conversationEnabled) {
                        this.speak("Microphone permission denied. Please enable it in your browser settings.");
                    }
                }
            }
        } else {
            console.warn("Speech Recognition not initialized or already listening.");
        }
    }

    stopListening() {
        if (this.speechRecognition && this.isListening) {
            this.speechRecognition.stop();
        } else {
            console.warn("Speech Recognition not active to stop.");
        }
    }

    // New: Conversation Mode entry/exit
    enterConversationMode() {
        const conversationOverlay = this.shadowRoot.getElementById('conversationOverlay');
        const chatContainer = this.shadowRoot.querySelector('.chat-container'); // The main container of the chat

        if (conversationOverlay && chatContainer) {
            conversationOverlay.style.display = 'flex'; // Show the overlay
            // Prevent scrolling on the main body when overlay is active if needed
            // document.body.style.overflow = 'hidden';
        }

        // Do NOT automatically start listening here.
        // The user will tap 'conversationBigButton' (TAP TO SPEAK) inside the overlay.

        // Also, cancel any speech Synthesis if it was playing, before showing overlay.
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        // Optionally, reset the big button text to ensure it's 'TAP TO SPEAK' when the overlay opens
        const conversationBigButton = this.shadowRoot.getElementById('conversationBigButton');
        if (conversationBigButton) {
            conversationBigButton.textContent = 'TAP TO SPEAK';
            conversationBigButton.classList.remove('listening');
        }
    }

    exitConversationMode() {
        const conversationOverlay = this.shadowRoot.getElementById('conversationOverlay');
        if (conversationOverlay) {
            conversationOverlay.style.display = 'none'; // Hide the overlay
            // Re-enable scrolling on the main body if it was disabled
            // document.body.style.overflow = '';
        }
        if (this.isListening) {
            this.stopListening();
        }
        // Cancel any ongoing speech synthesis when exiting conversation mode
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }

    async sendMessage(userPromptFromSTT = null) {
        const userPrompt = userPromptFromSTT !== null ? userPromptFromSTT : this.stripHtml(this.shadowRoot.getElementById('textInput').innerHTML).trim();
        const temperature = parseFloat(this.shadowRoot.getElementById('temperatureInput').value);
        const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
        const textInputDiv = this.shadowRoot.getElementById('textInput');

        if (!userPrompt) {
            rawTextOutputDiv.textContent = 'Please enter a user prompt.';
            if (this.conversationEnabled) {
                this.speak("Please enter a user prompt.");
            }
            return;
        }

        if (isNaN(temperature) || temperature < 0 || temperature > 1) {
            rawTextOutputDiv.textContent = 'Please enter a valid temperature between 0.0 and 1.0.';
            if (this.conversationEnabled) {
                this.speak("Please enter a valid temperature between zero point zero and one point zero.");
            }
            return;
        }

        // Add user message to history and display
        this.messages.push({ role: 'user', content: userPrompt });
        this.renderHistory(); // Update display with user's new message

        // Clear the user input box immediately
        textInputDiv.textContent = '';

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

            // Speak the AI response if conversation mode is enabled
            if (this.conversationEnabled) {
                // Ensure any previous speech is cancelled before speaking new response
                window.speechSynthesis.cancel();
                this.speak(fullResponse);
            }

        } catch (error) {
            console.error("Error sending message:", error);
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
            // Speak the error message
            if (this.conversationEnabled) {
                window.speechSynthesis.cancel();
                this.speak(`Error: ${error.message}`);
            }
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
                    position: absolute;
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
                    <select id="ttsVoiceSelect"></select>
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


