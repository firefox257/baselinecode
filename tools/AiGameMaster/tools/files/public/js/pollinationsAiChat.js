/*

give text documentation avout this module.


*/



// ./js/pollinationsAiChat.js

const POLLINATIONS_BASE_URL = 'https://text.pollinations.ai';
const MODELS_LOCAL_STORAGE_KEY = 'pollinationsModels';

const PollinationsAIChat = {
  /**
   * Fetches the list of available models from Pollinations.ai.
   * Caches the list in browser local storage. If the fetch fails,
   * it attempts to retrieve the list from the cache.
   * @returns {Promise<Array<string>>} A promise that resolves to an array of model names.
   */
  getModels: async function() {
    const cachedModels = localStorage.getItem(MODELS_LOCAL_STORAGE_KEY);

    if (cachedModels) {
      try {
        return JSON.parse(cachedModels);
      } catch (e) {
        console.error("Error parsing cached models, fetching new list:", e);
        localStorage.removeItem(MODELS_LOCAL_STORAGE_KEY); // Clear corrupted cache
      }
    }

    try {
      const response = await fetch(`${POLLINATIONS_BASE_URL}/models`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const models = await response.json();
      localStorage.setItem(MODELS_LOCAL_STORAGE_KEY, JSON.stringify(models));
      return models;
    } catch (error) {
      console.error("Failed to fetch models from Pollinations.ai:", error);
      // If fetching fails and there was a corrupted cache, we've already cleared it.
      // If there was no cache or parsing failed, we return an empty array or rethrow.
      return []; // Or consider throwing the error if you want stricter error handling.
    }
  },

  /**
   * Sends a chat prompt to a specified Pollinations.ai model.
   * Uses a POST request with a JSON body.
   * @param {string} modelName The name of the AI model to use (e.g., "gemma-7b-it").
   * @param {string} prompt The user's prompt for the AI.
   * @param {string} [systemPrompt='You are a helpful AI assistant.'] An optional system prompt to guide the AI's behavior.
   * @returns {Promise<string>} A promise that resolves to the AI's response text.
   * @throws {Error} If the API call fails or returns an error.
   */
  chat: async function(modelName, prompt, systemPrompt = 'You are a helpful AI assistant.') {
    try {
      const response = await fetch(`${POLLINATIONS_BASE_URL}/${modelName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json' // Request JSON response
        },
        body: JSON.stringify({
          prompt: prompt,
          system: systemPrompt,
          json: false // Request the response as not a JSON
        })
      });

      if (!response.ok) {
        // Attempt to parse error message from response if available
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData && errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (jsonError) {
          // Ignore if response body isn't JSON
        }
        throw new Error(`Failed to get chat response: ${errorMessage}`);
      }

      const data = await response.json();
      // Pollinations.ai text endpoint can return a string directly or a JSON object
      // with a 'text' field depending on how it's configured or accessed.
      // Based on the prompt for `json: true`, it should return JSON.
      if (typeof data === 'object' && data.text) {
        return data.text;
      } else if (typeof data === 'string') {
        return data; // In case it still returns plain text for some reason
      } else {
        throw new Error("Unexpected response format from Pollinations.ai chat API.");
      }

    } catch (error) {
      console.error("Error during Pollinations.ai chat API call:", error);
      throw error; // Re-throw to allow calling code to handle it
    }
  }
};

export default PollinationsAIChat;
