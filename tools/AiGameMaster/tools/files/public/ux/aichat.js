



// ./ux/aichat.js

import { createSession } from '../js/chatSession.js';

const API_BASE_URL = "https://text.pollinations.ai";
const MODELS_URL = `${API_BASE_URL}/models`;
const OPENAI_COMPLETION_URL = `${API_BASE_URL}/openai`;

// Local Storage Keys
const LOCAL_STORAGE_MODELS_KEY = 'aiChatModels';
const LOCAL_STORAGE_SELECTED_MODEL_KEY = 'aiChatSelectedModel';
const LOCAL_STORAGE_SYSTEM_PROMPT_KEY = 'aiChatSystemPrompt';
const LOCAL_STORAGE_MESSAGES_KEY = 'aiChatMessages';
const LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY = 'aiChatSelectedSystemPromptTitle';
const LOCAL_STORAGE_SELECTED_CODE_FILTER_KEY = 'aiChatSelectedCodeFilter';

class AIChat extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.models = [];
        this.currentModel = "mistral";
        this.systemPrompt = "You are a helpful AI assistant.";
        this.systemPrompts = {};
        this.currentSystemPromptTitle = "";
        this.onCloseCallback = null;
        this.chatTitle = null;

        this.currentStreamReader = null;

        this.codeFilter = 'all';
        this.availableCodeTypes = new Set();

        this.chatSession = null;

        this.render();
    }

    async connectedCallback() {
        const cachedModel = localStorage.getItem(LOCAL_STORAGE_SELECTED_MODEL_KEY);
        if (cachedModel) {
            this.currentModel = cachedModel;
        }

        await this.fetchSystemPrompts();

        const systemInput = this.shadowRoot.getElementById('systemInput');
        const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect');

        const cachedSystemPromptContent = localStorage.getItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY);
        if (cachedSystemPromptContent) {
            this.systemPrompt = cachedSystemPromptContent;
            const foundKey = Object.keys(this.systemPrompts).find(key => this.systemPrompts[key] === cachedSystemPromptContent);
            if (foundKey) {
                this.currentSystemPromptTitle = foundKey;
                if (systemPromptSelect) systemPromptSelect.value = this.currentSystemPromptTitle;
            } else {
                this.currentSystemPromptTitle = "custom";
                if (systemPromptSelect) systemPromptSelect.value = "custom";
            }
        } else {
            const cachedSystemPromptTitle = localStorage.getItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY);
            if (cachedSystemPromptTitle && this.systemPrompts[cachedSystemPromptTitle]) {
                this.currentSystemPromptTitle = cachedSystemPromptTitle;
                this.systemPrompt = this.systemPrompts[this.currentSystemPromptTitle];
                if (systemPromptSelect) systemPromptSelect.value = this.currentSystemPromptTitle;
            } else if (Object.keys(this.systemPrompts).length > 0) {
                const defaultTitle = Object.keys(this.systemPrompts)[0];
                this.currentSystemPromptTitle = defaultTitle;
                this.systemPrompt = this.systemPrompts[defaultTitle];
                if (systemPromptSelect) systemPromptSelect.value = defaultTitle;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, defaultTitle);
                localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
            }
        }
        if (systemInput) {
            systemInput.textContent = this.systemPrompt;
        }

        this.clearConversation();

        await this.fetchModels();
        this.setupEventListeners();
        this.applyDynamicProperties();
        this.updateTitleBar();

        this.shadowRoot.getElementById('modelSelect').value = this.currentModel;

        const cachedCodeFilter = localStorage.getItem(LOCAL_STORAGE_SELECTED_CODE_FILTER_KEY);
        if (cachedCodeFilter) {
            this.codeFilter = cachedCodeFilter;
        }
        this.populateCodeFilterDropdown();
        this.renderHistory();
    }

    disconnectedCallback() {
        if (this.onCloseCallback) {
            this.onCloseCallback();
        }
        this.stopAIChatResponse();
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

    updateCloseButtonVisibility() {
        const closeButton = this.shadowRoot.getElementById('closeButton');
        if (closeButton) {
            closeButton.style.display = this.onCloseCallback ? 'block' : 'none';
        }
    }

    async fetchModels() {
        const cachedModels = localStorage.getItem(LOCAL_STORAGE_MODELS_KEY);
        if (cachedModels) {
            try {
                this.models = JSON.parse(cachedModels);
                this.populateModelDropdown();
                const isCachedModelAvailable = this.models.some(model => model.name === this.currentModel);
                if (!isCachedModelAvailable && this.models.length > 0) {
                    this.currentModel = this.models[0].name;
                    localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel);
                }
                return;
            } catch (e) {
                localStorage.removeItem(LOCAL_STORAGE_MODELS_KEY);
            }
        }

        try {
            const response = await fetch(MODELS_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.models = await response.json();
            this.populateModelDropdown();
            localStorage.setItem(LOCAL_STORAGE_MODELS_KEY, JSON.stringify(this.models));
            const isCurrentModelAvailable = this.models.some(model => model.name === this.currentModel);
            if (!isCurrentModelAvailable && this.models.length > 0) {
                this.currentModel = this.models[0].name;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel);
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
            return;
        }
        modelSelect.innerHTML = '';

        this.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.description || model.name;
            modelSelect.appendChild(option);
        });

        modelSelect.value = this.currentModel;
    }

    async fetchSystemPrompts() {
        const fileName = 'systemPrompts.json';
        try {
            const response = await fetch(fileName);
            if (!response.ok) {
                this.systemPrompts = {};
                return;
            }
            this.systemPrompts = await response.json();
            this.populateSystemPromptDropdown();
        } catch (error) {
            console.error(`[AIChat] Error fetching system prompts from ${fileName}:`, error);
            this.systemPrompts = {};
        }
    }

    populateSystemPromptDropdown() {
        const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect');
        if (!systemPromptSelect) {
            return;
        }
        systemPromptSelect.innerHTML = '';

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

        if (this.currentSystemPromptTitle && systemPromptSelect.querySelector(`option[value="${this.currentSystemPromptTitle}"]`)) {
            systemPromptSelect.value = this.currentSystemPromptTitle;
        } else {
            systemPromptSelect.value = "custom";
        }
    }

    stripHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    }

    clearConversation() {
        this.messages = [{ role: 'system', content: this.systemPrompt }];
        localStorage.removeItem(LOCAL_STORAGE_MESSAGES_KEY);
        this.availableCodeTypes.clear();
        this.codeFilter = 'all';
        localStorage.setItem(LOCAL_STORAGE_SELECTED_CODE_FILTER_KEY, this.codeFilter);
        this.populateCodeFilterDropdown();

        this.renderHistory();

        this.stopAIChatResponse();

        this.chatSession = createSession(this.systemPrompt, this.currentModel);
    }

    stopAIChatResponse() {
        if (this.currentStreamReader) {
            try {
                this.currentStreamReader.cancel();
            } catch (e) {
                console.error('[AIChat] Error cancelling stream reader:', e);
            } finally {
                this.currentStreamReader = null;
            }
        }
    }

    setupEventListeners() {
        const sendButton = this.shadowRoot.getElementById('sendButton');
        const modelSelect = this.shadowRoot.getElementById('modelSelect');
        const systemPromptButton = this.shadowRoot.getElementById('systemPromptButton');
        const clearChatButton = this.shadowRoot.getElementById('clearChatButton');
        const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect');
        const closeButton = this.shadowRoot.getElementById('closeButton');
        const systemInputContainer = this.shadowRoot.getElementById('systemInputContainer');
        const systemInput = this.shadowRoot.getElementById('systemInput');
        const textInputDiv = this.shadowRoot.getElementById('textInput');

        const codeFilterSelect = this.shadowRoot.getElementById('codeFilterSelect');

        if (sendButton) sendButton.addEventListener('click', () => this.sendMessage());
        if (modelSelect) {
            modelSelect.addEventListener('change', (event) => {
                this.currentModel = event.target.value;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel);
                this.chatSession = createSession(this.systemPrompt, this.currentModel);
            });
        }
        if (systemPromptButton) systemPromptButton.addEventListener('click', () => { systemInputContainer.style.display = systemInputContainer.style.display === 'none' ? 'block' : 'none'; });
        if (clearChatButton) clearChatButton.addEventListener('click', () => this.clearConversation());
        if (systemPromptSelect) {
            systemPromptSelect.addEventListener('change', (event) => {
                const selectedTitle = event.target.value;
                const systemInput = this.shadowRoot.getElementById('systemInput');
                if (selectedTitle === "custom") {
                    systemInput.textContent = this.systemPrompt;
                    this.currentSystemPromptTitle = "custom";
                } else if (this.systemPrompts[selectedTitle]) {
                    this.systemPrompt = this.systemPrompts[selectedTitle];
                    this.currentSystemPromptTitle = selectedTitle;
                    systemInput.textContent = this.systemPrompt;
                }
                localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
                localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, this.currentSystemPromptTitle);

                this.clearConversation();
            });
        }

        if (systemInput) {
            systemInput.addEventListener('input', (event) => {
                this.systemPrompt = this.stripHtml(event.target.innerHTML).trim();
                localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);

                const currentDropdownValue = systemPromptSelect ? systemPromptSelect.value : "";
                if (systemInput.textContent.trim() !== "" && (currentDropdownValue === "" || (this.systemPrompts[currentDropdownValue] !== systemInput.textContent.trim()))) {
                    this.currentSystemPromptTitle = "custom";
                    if (systemPromptSelect) systemPromptSelect.value = "custom";
                    localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, "custom");
                }

                this.clearConversation();
            });
        }

        if (textInputDiv) {
            textInputDiv.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    this.sendMessage();
                }
            });
        }

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                if (this.onCloseCallback) {
                    this.onCloseCallback();
                }
                this.remove();
            });
        }

        if (codeFilterSelect) {
            codeFilterSelect.addEventListener('change', (event) => {
                this.codeFilter = event.target.value;
                localStorage.setItem(LOCAL_STORAGE_SELECTED_CODE_FILTER_KEY, this.codeFilter);
                this.renderHistory();
            });
        }
    }

    populateCodeFilterDropdown() {
        const codeFilterSelect = this.shadowRoot.getElementById('codeFilterSelect');
        if (!codeFilterSelect) {
            return;
        }

        const currentSelection = codeFilterSelect.value;
        codeFilterSelect.innerHTML = '';

        const addOption = (value, text) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            codeFilterSelect.appendChild(option);
        };

        addOption('all', 'Show All Messages');
        addOption('no-code', 'No Code Messages');
        addOption('all-code', 'All Code Messages');

        Array.from(this.availableCodeTypes).sort().forEach(type => {
            addOption(type, `Code: ${type.toUpperCase()}`);
        });

        if (this.codeFilter && codeFilterSelect.querySelector(`option[value="${this.codeFilter}"]`)) {
            codeFilterSelect.value = this.codeFilter;
        } else {
            codeFilterSelect.value = 'all';
            this.codeFilter = 'all';
            localStorage.setItem(LOCAL_STORAGE_SELECTED_CODE_FILTER_KEY, this.codeFilter);
        }
    }

    renderHistory() {
        const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
        if (!rawTextOutputDiv) return;

        rawTextOutputDiv.innerHTML = '';
        const displayMessages = this.messages.filter(msg => msg.role !== 'system');
        const assistantRoleDisplay = "Assistant";

        displayMessages.forEach(msg => {
            const codeBlockRegex = /```(\S*)\n([\s\S]*?)```/g;
            let match;
            let lastIndex = 0;
            const fragment = document.createDocumentFragment();
            let containsCode = false;

            while ((match = codeBlockRegex.exec(msg.content)) !== null) {
                containsCode = true;
                const [fullMatch, lang, code] = match;
                const precedingText = msg.content.substring(lastIndex, match.index).trim();

                if (precedingText) {
                    const p = document.createElement('p');
                    p.textContent = precedingText;
                    fragment.appendChild(p);
                }

                const codeBlockContainer = document.createElement('div');
                codeBlockContainer.classList.add('code-block-container');

                const header = document.createElement('div');
                header.classList.add('code-block-header');
                const langSpan = document.createElement('span');
                langSpan.classList.add('code-lang');
                langSpan.textContent = lang || 'plaintext';
                header.appendChild(langSpan);

                const copyButton = document.createElement('button');
                copyButton.classList.add('copy-button');
                copyButton.innerHTML = '📋 Copy';
                copyButton.title = 'Copy code to clipboard';
                copyButton.onclick = () => this.copyToClipboard(code, copyButton);
                header.appendChild(copyButton);
                codeBlockContainer.appendChild(header);

                const pre = document.createElement('pre');
                const codeElement = document.createElement('code');
                codeElement.textContent = code;
                pre.appendChild(codeElement);
                codeBlockContainer.appendChild(pre);
                fragment.appendChild(codeBlockContainer);

                if (msg.role === 'assistant' && lang) {
                    this.availableCodeTypes.add(lang.toLowerCase());
                }

                lastIndex = match.index + fullMatch.length;
            }

            const remainingText = msg.content.substring(lastIndex).trim();
            if (remainingText || (!containsCode && msg.content.trim())) {
                const p = document.createElement('p');
                p.textContent = msg.role === 'user' ? `You: ${remainingText || msg.content}` : `${assistantRoleDisplay}: ${remainingText || msg.content}`;
                fragment.appendChild(p);
            }

            let shouldDisplay = false;
            if (this.codeFilter === 'all') {
                shouldDisplay = true;
            } else if (this.codeFilter === 'no-code') {
                shouldDisplay = !containsCode;
            } else if (this.codeFilter === 'all-code') {
                shouldDisplay = containsCode;
            } else {
                const filterLang = this.codeFilter;
                const messageContainsFilteredCode = [...msg.content.matchAll(codeBlockRegex)].some(([_, lang]) => lang.toLowerCase() === filterLang);
                shouldDisplay = messageContainsFilteredCode;
            }

            if (shouldDisplay) {
                if (!containsCode) {
                    const outerP = document.createElement('p');
                    outerP.textContent = `${msg.role === 'user' ? 'You' : assistantRoleDisplay}: ${msg.content}`;
                    rawTextOutputDiv.appendChild(outerP);
                } else {
                    if (fragment.firstChild && fragment.firstChild.tagName === 'P') {
                        fragment.firstChild.textContent = `${msg.role === 'user' ? 'You' : assistantRoleDisplay}: ${fragment.firstChild.textContent}`;
                    } else if (fragment.firstChild && fragment.firstChild.classList.contains('code-block-container')) {
                        const roleInfo = document.createElement('span');
                        roleInfo.textContent = `${msg.role === 'user' ? 'You' : assistantRoleDisplay}: `;
                        rawTextOutputDiv.appendChild(roleInfo);
                    }
                    rawTextOutputDiv.appendChild(fragment);
                }
            }
        });

        this.populateCodeFilterDropdown();
        rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;
    }

    async copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            const originalText = button.innerHTML;
            button.innerHTML = '✅ Copied!';
            setTimeout(() => {
                button.innerHTML = originalText;
            }, 2000);
        } catch (err) {
            button.innerHTML = '❌ Failed!';
            setTimeout(() => {
                button.innerHTML = '📋 Copy';
            }, 2000);
        }
    }

    async sendMessage(userPromptFromSTT = null) {
        const userPrompt = this.stripHtml(this.shadowRoot.getElementById('textInput').innerHTML).trim();
        const temperature = parseFloat(this.shadowRoot.getElementById('temperatureInput').value);
        const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
        const textInputDiv = this.shadowRoot.getElementById('textInput');

        if (this.currentStreamReader) {
            this.stopAIChatResponse();
        }

        if (!userPrompt) {
            return;
        }

        if (isNaN(temperature) || temperature < 0 || temperature > 1) {
            return;
        }

        if (!this.chatSession) {
            this.chatSession = createSession(this.systemPrompt, this.currentModel);
        }

        const userMessageP = document.createElement('p');
        userMessageP.textContent = `You: ${userPrompt}`;
        rawTextOutputDiv.appendChild(userMessageP);

        textInputDiv.textContent = '';

        const generatingMessageP = document.createElement('p');
        const assistantRoleDisplay = "Assistant";
        generatingMessageP.textContent = `${assistantRoleDisplay}: Generating response...`;
        rawTextOutputDiv.appendChild(generatingMessageP);
        rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;

        let fullResponse = '';

        const onChunk = (chunk) => {
            fullResponse += chunk;

            const lastMessageDiv = rawTextOutputDiv.querySelector('p:last-child');
            if (lastMessageDiv && lastMessageDiv.textContent.startsWith(assistantRoleDisplay)) {
                lastMessageDiv.textContent = `${assistantRoleDisplay}: ${fullResponse}`;
            } else {
                const newP = document.createElement('p');
                newP.textContent = `${assistantRoleDisplay}: ${fullResponse}`;
                rawTextOutputDiv.appendChild(newP);
            }
            rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;
        };

        const onEnd = () => {
            this.messages = this.chatSession.getHistory();
            localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));

            this.renderHistory();
        };

        try {
            await this.chatSession.requestStreamText(userPrompt, onChunk, onEnd, temperature);
        } catch (error) {
            console.error("[AIChat] Error streaming response:", error);

            const errorP = document.createElement('p');
            errorP.textContent = `${assistantRoleDisplay}: Error: ${error.message}`;
            errorP.style.color = 'red';
            rawTextOutputDiv.appendChild(errorP);
            rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;

            this.chatSession.messages.pop();
            this.messages = this.chatSession.getHistory();
            localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));

            this.stopAIChatResponse();

        } finally {
            this.currentStreamReader = null;
        }
    }


    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
                    box-sizing: border-box;
                    font-family: 'Space Mono', 'Courier New', monospace;
                    background-color: #fcfcfc;
                    color: #333;
                    overflow: hidden;
                    position: relative;
                }
                #mainChatTool {
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
                }
                .section {
                    padding: 8px 10px;
                    border-bottom: 1px solid #eee;
                }
                .section:last-of-type {
                    border-bottom: none;
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
                    padding-bottom: 5px;
                }
                .title-text {
                    overflow: hidden;
                    text-overflow: clip;
                    white-space: nowrap;
                }
                .top-menu {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-shrink: 0;
                }
                .top-menu > div {
                    display: flex;
                    gap: 8px;
                    flex-grow: 1;
                    min-width: 0;
                    align-items: center;
                }
                .top-menu button, .top-menu select {
                    padding: 6px 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    background-color: #fff;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 0.9em;
                    color: #333;
                    box-sizing: border-box;
                }
                .top-menu button:hover, .top-menu select:hover {
                    background-color: #e9e9e9;
                }
                .top-menu .icon-button {
                    font-size: 1.1em;
                    flex-shrink: 0;
                }
                #modelSelect, #systemPromptSelect, #codeFilterSelect {
                    flex-grow: 1;
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                #systemInputContainer {
                    display: none;
                    padding-top: 10px;
                    padding-bottom: 5px;
                }
                .input-group {
                    margin-bottom: 8px;
                }
                .input-group label {
                    display: block;
                    margin-bottom: 4px;
                    font-weight: bold;
                    font-size: 0.85em;
                    color: #555;
                }
                .input-group input[type="number"], .input-group input[type="text"] {
                    width: calc(100% - 2px);
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 0.9em;
                    box-sizing: border-box;
                    font-family: inherit;
                    color: #333;
                }
                .input-group select {
                    width: calc(100% - 2px);
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 0.9em;
                    box-sizing: border-box;
                    font-family: inherit;
                    color: #333;
                }
                #textInput, #systemInput {
                    flex-grow: 1;
                    border: 1px solid #ddd;
                    background-color: #fff;
                    padding: 8px;
                    min-height: 30px;
                    max-height: 120px;
                    overflow-y: auto;
                    border-radius: 4px;
                    cursor: text;
                    font-family: inherit;
                    font-size: 0.95em;
                    line-height: 1.4;
                    box-sizing: border-box;
                    color: #333;
                    margin: 0;
                }
                #textInput[contenteditable="true"]:focus,
                #systemInput[contenteditable="true"]:focus {
                    outline: none;
                    border-color: #007bff;
                    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
                }
                #textInput:empty:before, #systemInput:empty:before {
                    content: attr(placeholder);
                    color: #aaa;
                    pointer-events: none;
                    display: block;
                }
                .chat-area {
                    flex-grow: 1;
                    overflow-x: auto;
                    overflow-y: auto;
                    font-size: 0.95em;
                    line-height: 1.4;
                    background-color: #fff;
                    min-height: 50px;
                    box-sizing: border-box;
                    padding: 10px;
                    border: none;
                    border-radius: 0;
                    outline: none;
                }
                .chat-area p {
                    margin: 0 0 8px 0;
                    white-space: pre-wrap;
                    word-break: normal;
                }
                .chat-area p:last-child {
                    margin-bottom: 0;
                }
                .code-block-container {
                    background-color: #f4f4f4;
                    border: 1px solid #e1e1e1;
                    border-radius: 5px;
                    margin: 10px 0;
                    overflow: hidden;
                }
                .code-block-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background-color: #e9e9e9;
                    padding: 5px 10px;
                    border-bottom: 1px solid #e1e1e1;
                    font-size: 0.8em;
                    color: #555;
                }
                .code-lang {
                    font-weight: bold;
                    text-transform: uppercase;
                }
                .code-block-container pre {
                    margin: 0;
                    padding: 10px;
                    overflow-x: auto;
                    font-size: 0.9em;
                    line-height: 1.3;
                    white-space: pre-wrap;
                    word-break: break-all;
                }
                .code-block-container code {
                    display: block;
                }
                .copy-button {
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 3px;
                    padding: 3px 8px;
                    font-size: 0.8em;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .copy-button:hover {
                    background-color: #0056b3;
                }
                .input-area-wrapper {
                    display: flex;
                    align-items: flex-end;
                    gap: 8px;
                    flex-shrink: 0;
                    padding-top: 8px;
                }
                #sendButton {
                    padding: 8px 14px;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 1.4em;
                    flex-shrink: 0;
                    line-height: 1;
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
                    padding: 0;
                }
                .close-button:hover {
                    color: #333;
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
                        <select id="codeFilterSelect" title="Filter messages by code type"></select>
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
            </div>
        `;
    }
}

if (!customElements.get('ai-chat')) {
    customElements.define('ai-chat', AIChat);
}

const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.tagName === 'AI-CHAT') {
                }
            });
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('ai-chat').forEach(chatElement => {
    });
});




