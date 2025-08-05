const https = require('https');
const fs = require('fs');
const path = require('path'); // To handle file paths correctly

/**
 * Generates an image using the Pollinations.ai API and saves it to a specified path.
 *
 * @param {number} width - The desired width of the image.
 * @param {number} height - The desired height of the image.
 * @param {string} prompt - The text prompt for image generation.
 * @param {number} seed - The seed for reproducible image generation.
 * @param {string} outputPath - The full path (including filename and extension, e.g., 'images/my-image.png') where the image will be saved.
 * @returns {Promise<object>} A promise that resolves to an object indicating success or failure, and the saved image path if successful.
 */
async function generateImage(width, height, prompt, seed, outputPath) {
    return new Promise((resolve, reject) => {
        const model = 'flux'; // Always use 'flux' as the model
        const encodedPrompt = encodeURIComponent(prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&model=${model}&private=true&seed=${seed}`;

        // Ensure the directory for the output path exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const fileStream = fs.createWriteStream(outputPath);

        https.get(imageUrl, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                res.pipe(fileStream); // Pipe the response directly to the file stream

                fileStream.on('finish', () => {
                    fileStream.close(() => {
                        resolve({ success: true, savedPath: outputPath });
                    });
                });

                fileStream.on('error', (err) => {
                    fs.unlink(outputPath, () => reject({ success: false, error: `File stream error: ${err.message}` })); // Delete the file if an error occurs during writing
                });
            } else {
                reject({ success: false, error: `Failed to fetch image from Pollinations.ai. HTTP Status: ${res.statusCode}` });
            }
        }).on('error', (e) => {
            reject({ success: false, error: `Network error during image fetch: ${e.message}` });
        });
    });
}

module.exports = {
    generateImage
};
