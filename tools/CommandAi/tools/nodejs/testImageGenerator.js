


const { generateImage } = require('./imageGenerator'); // Import the generateImage function
const path = require('path'); // Import path to construct the output path
const fs = require('fs'); // Import fs to optionally check if the file exists

async function testImageGeneration() {
    const width = 1920; // Changed width for variety
    const height = 1080; // Changed height for variety
    const prompt = "a serene lakeside village under a starry night, fantasy art, highly detailed";
    // Generate a more unique seed for better testing
    const seed = Math.floor(Math.random() * 10000000); 

    // --- Output Path Configuration ---
    const outputDirectory = './generated_images';
    // Create a unique filename for each image using a timestamp and seed
    const filename = `image_${Date.now()}_seed${seed}_${width}x${height}.png`;
    const outputPath = path.join(outputDirectory, filename);
    // --- End Output Path Configuration ---

    console.log(`--- Starting Image Generation Test ---`);
    console.log(`Parameters:`);
    console.log(`  Width: ${width}`);
    console.log(`  Height: ${height}`);
    console.log(`  Prompt: "${prompt}"`);
    console.log(`  Seed: ${seed}`);
    console.log(`  Model: flux (hardcoded in module)`);
    console.log(`  Target Output Path: ${outputPath}`);
    console.log(`------------------------------------`);

    try {
        console.log('\nCalling generateImage function...');
        const result = await generateImage(width, height, prompt, seed, outputPath);

        if (result.success) {
            console.log('\n✅ Image generation and saving successful!');
            console.log('   Saved to Path:', result.savedPath);

            // Optional: Verify if the file actually exists
            if (fs.existsSync(result.savedPath)) {
                const stats = fs.statSync(result.savedPath);
                console.log(`   File exists. Size: ${stats.size} bytes`);
            } else {
                console.warn(`   ⚠️ Warning: File was supposed to be saved at ${result.savedPath}, but it doesn't seem to exist.`);
            }
            console.log(`   You can open '${result.savedPath}' to view the image.`);
        } else {
            console.error('\n❌ Image generation failed.');
            console.error('   Error:', result.error);
        }
    } catch (error) {
        console.error('\nFatal Error: An unexpected error occurred during image generation:');
        console.error('   ', error);
        if (error.stack) {
            console.error('   Stack Trace:\n', error.stack);
        }
    } finally {
        console.log('\n--- Image Generation Test Complete ---');
    }
}

// Run the test function
testImageGeneration();
