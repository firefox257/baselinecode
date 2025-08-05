
// reference code belowe. no response needed.

// chatSession.js

const API_BASE_URL = "https://text.pollinations.ai";
const MODELS_URL = `${API_BASE_URL}/models`;
const OPENAI_COMPLETION_URL = `${API_BASE_URL}/openai`;

// Regular expression to extract JSON content from a markdown code block
const JSON_CODE_BLOCK_REGEX = /```json\s*([\s\S]*?)\s*```/g;

/**
 * Manages an AI chat session, including message history, model selection, and API interactions.
 */
class ChatSession {
    /**
     * @param {string} systemPrompt - The initial system prompt for the AI.
     * @param {string} model - The AI model to use for the session (e.g., "mistral").
     * @param {number|null} [seed=null] - An optional seed number for reproducible results.
     */
    constructor(systemPrompt, model, seed = null) {
        if (!systemPrompt || typeof systemPrompt !== 'string') {
            throw new Error("A valid system prompt is required to create a ChatSession.");
        }
        if (!model || typeof model !== 'string') {
            throw new Error("A valid model is required to create a ChatSession.");
        }

        this.model = model;
        this.seed = seed;
        // Initialize messages with the system prompt
        this.messages = [{ role: 'system', content: systemPrompt }];
        console.log(`[ChatSession] New session created with model: ${this.model}, system prompt: "${systemPrompt.substring(0, 50)}...", seed: ${this.seed}`);
    }

    /**
     * Adds a user message to the session's history.
     * @param {string} text - The user's message.
     */
    addUserMessage(text) {
        if (!text || typeof text !== 'string') {
            throw new Error("User message must be a non-empty string.");
        }
        this.messages.push({ role: 'user', content: text });
        console.log(`[ChatSession] User message added: "${text.substring(0, 50)}..."`);
    }

    /**
     * Adds an assistant message to the session's history.
     * This is primarily for internal use after receiving a response, but can be used for custom history management.
     * @param {string} text - The AI's message.
     */
    addAssistantMessage(text) {
        if (!text || typeof text !== 'string') {
            throw new Error("Assistant message must be a non-empty string.");
        }
        this.messages.push({ role: 'assistant', content: text });
        console.log(`[ChatSession] Assistant message added: "${text.substring(0, 50)}..."`);
    }

    /**
     * Gets the current conversation history.
     * @returns {Array<Object>} An array of message objects ({role: string, content: string}).
     */
    getHistory() {
        return [...this.messages]; // Return a copy to prevent external modification
    }

    /**
     * Clears the conversation history, resetting it to only the initial system prompt.
     */
    clearHistory() {
        // Keep the original system prompt, but remove all user/assistant messages
        this.messages = [this.messages[0]];
        console.log('[ChatSession] Conversation history cleared.');
    }

    /**
     * Sends a text-based request to the AI and returns the full AI response text.
     * The response will be streamed and accumulated.
     * @param {string} userMessage - The user's message for the current turn.
     * @param {number} [temperature=0.7] - The sampling temperature for the AI response (0.0 to 1.0).
     * @returns {Promise<string>} A promise that resolves with the full AI response text.
     * @throws {Error} If the request fails or an invalid response is received.
     */
    async requestText(userMessage, temperature = 0.7) {
        this.addUserMessage(userMessage); // Add user message to history immediately

        if (temperature < 0 || temperature > 1) {
            throw new Error("Temperature must be between 0.0 and 1.0.");
        }

        const payload = {
            "model": this.model,
            "messages": this.messages, // Send the full history
            "temperature": temperature,
            "stream": true,
            "private": false,
            "seed": this.seed // Include seed if provided
        };

        let fullResponseContent = '';
        let currentStreamReader = null; // To manage cancellation if needed

        console.log(`[ChatSession] Requesting text from ${OPENAI_COMPLETION_URL} for model ${this.model}.`);

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
                const errorData = await response.text();
                throw new Error(`HTTP error! Status: ${response.status}. Details: ${errorData}`);
            }

            const reader = response.body.getReader();
            currentStreamReader = reader; // Keep reference to reader for potential external cancellation
            const decoder = new TextDecoder('utf-8');
            let streamBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                streamBuffer += decoder.decode(value, { stream: true });

                while (true) {
                    const eventDelimiter = '\n\n';
                    const eventEndIndex = streamBuffer.indexOf(eventDelimiter);

                    if (eventEndIndex === -1) {
                        break; // No complete event found, wait for more data
                    }

                    const eventString = streamBuffer.substring(0, eventEndIndex);
                    streamBuffer = streamBuffer.substring(eventEndIndex + eventDelimiter.length);

                    if (eventString.startsWith('data:')) {
                        const data = eventString.substring(5).trim();

                        if (data === '[DONE]') {
                            break; // End of stream marker
                        }

                        try {
                            const parsedChunk = JSON.parse(data);
                            const content = parsedChunk.choices?.[0]?.delta?.content;
                            if (content) {
                                fullResponseContent += content;
                            }
                        } catch (jsonError) {
                            // console.warn("Non-JSON data or marker in stream:", data); // Suppress noisy logging for [DONE]
                        }
                    }
                }
                if (streamBuffer.includes('[DONE]')) {
                    break;
                }
            }

            this.addAssistantMessage(fullResponseContent); // Add full AI response to history
            console.log(`[ChatSession] Received full AI response (text): "${fullResponseContent.substring(0, 50)}..."`);
            return fullResponseContent;

        } catch (error) {
            console.error("[ChatSession] Error requesting text:", error);
            // If an error occurs, remove the last user message from history as no valid AI response was received
            this.messages.pop();
            throw error;
        } finally {
            if (currentStreamReader) {
                // Ensure the reader is released (though not strictly necessary as stream ends)
                currentStreamReader = null;
            }
        }
    }

    /**
     * Sends a request to the AI expecting JSON content in markdown code blocks within the response.
     * It parses and returns a list of JSON objects found.
     * @param {string} userMessage - The user's message for the current turn.
     * @param {number} [temperature=0.7] - The sampling temperature for the AI response (0.0 to 1.0).
     * @returns {Promise<Array<Object>>} A promise that resolves with an array of parsed JSON objects.
     * @throws {Error} If the request fails or JSON parsing fails.
     */
    async requestJson(userMessage, temperature = 0.7) {
        console.log('[ChatSession] Requesting JSON from AI...');
        const fullTextResponse = await this.requestText(userMessage, temperature); // Use requestText to get full response first

        const jsonResponses = [];
        let match;
        while ((match = JSON_CODE_BLOCK_REGEX.exec(fullTextResponse)) !== null) {
            try {
                const jsonContent = JSON.parse(match[1]);
                jsonResponses.push(jsonContent);
                console.log('[ChatSession] Successfully parsed JSON object from response.');
            } catch (parseError) {
                console.warn(`[ChatSession] Failed to parse JSON from block: ${match[1].substring(0, 100)}... Error: ${parseError.message}`);
                // Continue to try and parse other blocks even if one fails
            }
        }

        if (jsonResponses.length === 0) {
            console.warn('[ChatSession] No JSON markdown code blocks found in the AI response.');
        }

        return jsonResponses;
    }
}

/**
 * Fetches the list of available AI models from the API.
 * @returns {Promise<Array<Object>>} A promise that resolves with an array of model objects.
 * @throws {Error} If the API call fails.
 */
async function getAvailableModels() {
    console.log('[ChatSession] Fetching available models...');
    try {
        const response = await fetch(MODELS_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const models = await response.json();
        console.log(`[ChatSession] Fetched ${models.length} models.`);
        return models;
    } catch (error) {
        console.error("[ChatSession] Error fetching models:", error);
        throw error;
    }
}

/**
 * Creates a new ChatSession instance.
 * @param {string} systemPrompt - The initial system prompt for the AI.
 * @param {string} model - The AI model to use (e.g., "mistral").
 * @param {number|null} [seed=null] - An optional seed number.
 * @returns {ChatSession} A new ChatSession instance.
 */
function createSession(systemPrompt, model, seed = null) {
    return new ChatSession(systemPrompt, model, seed);
}

export { getAvailableModels, createSession };



