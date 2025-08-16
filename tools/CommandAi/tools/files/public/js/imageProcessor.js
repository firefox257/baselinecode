



// js/imageProcessor.js

import { api } from './apiCalls.js'; // Adjust path if necessary

let globalJpegQuality = 0.9;
let globalPngCompressionLevel = 6; // Note: This is largely informational for canvas.toBlob()

/**
 * Sets the global quality/compression levels for image saving.
 * @param {number} jpegQuality - JPEG quality (0.1 to 1.0).
 * @param {number} pngCompressionLevel - PNG compression level (0 to 9, largely informational for native canvas).
 */
export function setGlobalCompressionQuality(jpegQuality, pngCompressionLevel) {
    if (typeof jpegQuality === 'number' && jpegQuality >= 0.1 && jpegQuality <= 1) {
        globalJpegQuality = jpegQuality;
    } else {
        console.warn("Invalid JPEG quality provided for JPEG. Keeping current value.");
    }

    if (typeof pngCompressionLevel === 'number' && pngCompressionLevel >= 0 && pngCompressionLevel <= 9) {
        globalPngCompressionLevel = pngCompressionLevel;
    } else {
        console.warn("Invalid PNG compression level provided for PNG. Keeping current value.");
    }
    console.log(`Global compression settings updated: JPEG Quality = ${globalJpegQuality}, PNG Compression = ${globalPngCompressionLevel}`);
}

/**
 * Converts a Uint8Array to a Base64 string.
 * @param {Uint8Array} uint8Array - The Uint8Array to convert.
 * @returns {string} The Base64 encoded string.
 */
function uint8ToBase64(uint8Array) {
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
}

/**
 * Fetches an image, scales it using an internal canvas, and saves it to the server.
 * Does not interact with the DOM directly.
 * @param {Object} options - Configuration options for image generation and saving.
 * @param {string} options.prompt - The text prompt for image generation.
 * @param {string} options.filePathAndName - The desired file path and name to save on the server (e.g., "images/my_image.png").
 * @param {number} options.width - The desired width for image generation.
 * @param {number} options.height - The desired height for image generation.
 * @param {number} [options.seed] - Optional seed for image generation.
 * @param {number} [options.scaleX=1] - Scale factor for internal canvas width.
 * @param {number} [options.scaleY=1] - Scale factor for internal canvas height.
 * @param {'png'|'jpeg'} [options.imageFormat='png'] - Format to save the image (png or jpeg).
 * @returns {Promise<boolean>} A promise that resolves to true if successful, false otherwise.
 */
export async function generateAndSaveImage({
    prompt,
    filePathAndName,
    width,
    height,
    seed,
    scaleX = 1,
    scaleY = 1,
    imageFormat = 'png'
}) {
    const pEncoded = encodeURIComponent(prompt);
    const model = "flux";
    const imageUrl = `https://image.pollinations.ai/prompt/${pEncoded}?width=${width}&height=${height}&nologo=true&model=${model}&private=true&seed=${seed || ''}`;

    try {
        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const mimeType = imageFormat === 'png' ? 'image/png' : 'image/jpeg';
        const base64Image = `data:${mimeType};base64,${uint8ToBase64(uint8Array)}`;

        const img = new Image();
        img.src = base64Image;

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        // Create an offscreen canvas for scaling
        const offscreenCanvas = document.createElement('canvas'); // Or new OffscreenCanvas() if supported and desired
        const ctx = offscreenCanvas.getContext("2d");

        const scaledWidth = img.naturalWidth * scaleX;
        const scaledHeight = img.naturalHeight * scaleY;

        offscreenCanvas.width = scaledWidth;
        offscreenCanvas.height = scaledHeight;

        ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

        // Ensure filename has correct extension
        const defaultFileNameExtension = imageFormat === 'png' ? '.png' : '.jpeg';
        let finalFileName = filePathAndName;
        if (!finalFileName.endsWith(defaultFileNameExtension)) {
             finalFileName = finalFileName.split('.')[0] + defaultFileNameExtension;
        }

        // Use the global quality settings
        const qualityParam = imageFormat === 'jpeg' ? globalJpegQuality : undefined; // PNG doesn't use quality

        const blob = await new Promise((resolve, reject) => {
            offscreenCanvas.toBlob(resolve, mimeType, qualityParam);
        });

        if (!blob) {
            throw new Error("Could not create Blob from canvas.");
        }

        const headersToSend = {
            'X-Image-Prompt': prompt
        };
        
        // This call assumes api.saveFile can handle a Blob and filename directly
        // Make sure your api.saveFile implementation (in apiCalls.js) is compatible
        await api.saveFile(finalFileName, blob, headersToSend);
        
        console.log(`Successfully generated and saved "${finalFileName}"`);
        return true; // Success

    } catch (error) {
        console.error("Error in generateAndSaveImage:", error);
        return false; // Failure
    }
}


