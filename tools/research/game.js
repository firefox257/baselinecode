// game.js

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;
const FOV = Math.PI / 3; // Field of View (60 degrees)

// Player properties
let player = {
    x: 1.5,
    y: 1.5,
    angle: Math.PI / 2, // Looking right initially
    speed: 0.05,
    rotationSpeed: 0.03
};

// Map definition (0 = empty, 1 = wall)
const map = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 1, 1, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 1, 1, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

const MAP_CELL_SIZE = 1; // Each map cell represents 1 unit in game world

let canvas = document.getElementById('gameCanvas');
let ctx = canvas.getContext('2d');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// Texture images
const wallTexture = new Image();
const ceilingTexture = new Image();
const floorTexture = new Image();

let texturesLoaded = 0;
const totalTextures = 3;

function textureLoaded() {
    texturesLoaded++;
    if (texturesLoaded === totalTextures) {
        console.log("All textures loaded.");
        gameLoop(); // Start the game loop after textures are loaded
    }
}

wallTexture.onload = textureLoaded;
ceilingTexture.onload = textureLoaded;
floorTexture.onload = textureLoaded;

wallTexture.src = 'wall_texture.png'; // Make sure this path is correct
ceilingTexture.src = 'ceiling_texture.png'; // Make sure this path is correct
floorTexture.src = 'floor_texture.png'; // Make sure this path is correct

const TEXTURE_SIZE = 512; // Your texture dimensions

// Keyboard input handling
let keys = {};
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
});
document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

function updatePlayer() {
    let moveX = 0;
    let moveY = 0;

    if (keys['KeyW']) { // Move forward
        moveX = player.speed * Math.cos(player.angle);
        moveY = player.speed * Math.sin(player.angle);
    }
    if (keys['KeyS']) { // Move backward
        moveX = -player.speed * Math.cos(player.angle);
        moveY = -player.speed * Math.sin(player.angle);
    }
    if (keys['KeyA']) { // Strafe left (simplified for now, usually rotate + move)
        // For true strafing, you'd calculate perpendicular movement
        // moveX -= player.speed * Math.sin(player.angle);
        // moveY += player.speed * Math.cos(player.angle);
        player.angle -= player.rotationSpeed; // Simple rotation for A/D
    }
    if (keys['KeyD']) { // Strafe right
        // For true strafing, you'd calculate perpendicular movement
        // moveX += player.speed * Math.sin(player.angle);
        // moveY -= player.speed * Math.cos(player.angle);
        player.angle += player.rotationSpeed; // Simple rotation for A/D
    }

    // Check for collisions before updating position
    let newX = player.x + moveX;
    let newY = player.y + moveY;

    // Simple collision detection (check if new position is in a wall)
    let mapX = Math.floor(newX);
    let mapY = Math.floor(newY);

    if (map[mapY] && map[mapY][mapX] === 0) { // Check if new position is not a wall
        player.x = newX;
        player.y = newY;
    } else {
        // Try moving only on one axis if the other is blocked
        mapX = Math.floor(player.x + moveX);
        mapY = Math.floor(player.y);
        if (map[mapY] && map[mapY][mapX] === 0) {
            player.x += moveX;
        }

        mapX = Math.floor(player.x);
        mapY = Math.floor(player.y + moveY);
        if (map[mapY] && map[mapY][mapX] === 0) {
            player.y += moveY;
        }
    }
}

function drawFloorAndCeiling() {
    // Draw ceiling (top half of the screen)
    ctx.drawImage(ceilingTexture,
                  0, 0, TEXTURE_SIZE, TEXTURE_SIZE, // Source rectangle
                  0, 0, CANVAS_WIDTH, CANVAS_HEIGHT / 2); // Destination rectangle

    // Draw floor (bottom half of the screen)
    ctx.drawImage(floorTexture,
                  0, 0, TEXTURE_SIZE, TEXTURE_SIZE, // Source rectangle
                  0, CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT / 2); // Destination rectangle

    // This is a very simplified floor/ceiling. A true Doom-like floor/ceiling
    // would require complex per-pixel rendering or pre-rendered textures based
    // on perspective, which is significantly more complex for a non-WebGL canvas.
    // For a basic look, drawing the full texture stretch can give an idea.
}


function render() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Clear canvas

    drawFloorAndCeiling(); // Draw background before walls

    const angleStep = FOV / CANVAS_WIDTH; // Angle increment for each ray

    for (let x = 0; x < CANVAS_WIDTH; x++) {
        const rayAngle = (player.angle - FOV / 2) + (x * angleStep);

        let hit = false;
        let dist = 0;
        let wallX = 0; // Where on the wall the ray hit (for texture mapping)
        let side = 0; // 0 for horizontal, 1 for vertical hit (for texture mapping)

        while (!hit && dist < 20) { // Max ray distance to prevent infinite loops
            dist += 0.01; // Increment ray distance

            let rayX = player.x + dist * Math.cos(rayAngle);
            let rayY = player.y + dist * Math.sin(rayAngle);

            let mapX = Math.floor(rayX);
            let mapY = Math.floor(rayY);

            // Check if ray hit a wall
            if (map[mapY] && map[mapY][mapX] === 1) {
                hit = true;

                // Determine which side of the wall was hit for texture mapping
                // Check horizontal vs vertical intersection.
                // This is a simplified check, full DDA algorithm would be more precise.
                let dx = rayX - Math.floor(rayX);
                let dy = rayY - Math.floor(rayY);

                if (Math.abs(Math.cos(rayAngle)) > Math.abs(Math.sin(rayAngle))) {
                    // Vertical wall (facing east/west)
                    side = 0; // Horizontal hit
                    wallX = rayY - Math.floor(rayY);
                    if (Math.cos(rayAngle) < 0) { // Facing left (west wall)
                        wallX = 1 - wallX; // Flip texture for consistency
                    }
                } else {
                    // Horizontal wall (facing north/south)
                    side = 1; // Vertical hit
                    wallX = rayX - Math.floor(rayX);
                    if (Math.sin(rayAngle) < 0) { // Facing up (north wall)
                        wallX = 1 - wallX; // Flip texture
                    }
                }

                // Correct fisheye lens distortion
                dist = dist * Math.cos(player.angle - rayAngle);
            }
        }

        if (hit) {
            // Calculate wall height on screen
            const wallHeight = (MAP_CELL_SIZE / dist) * CANVAS_HEIGHT;
            const drawStart = (CANVAS_HEIGHT / 2) - (wallHeight / 2);
            const drawEnd = (CANVAS_HEIGHT / 2) + (wallHeight / 2);

            // Get texture slice X coordinate
            let textureX = Math.floor(wallX * TEXTURE_SIZE);

            // Draw the wall slice
            ctx.drawImage(wallTexture,
                          textureX, 0, 1, TEXTURE_SIZE, // Source rectangle (1 pixel wide slice)
                          x, drawStart, 1, wallHeight); // Destination rectangle (1 pixel wide slice on canvas)

            // Simple shading based on distance (can be expanded)
            let shade = Math.min(1, dist / 10); // Max shade at 10 units distance
            ctx.fillStyle = `rgba(0, 0, 0, ${shade})`;
            ctx.fillRect(x, drawStart, 1, wallHeight);
        }
    }
}

function gameLoop() {
    updatePlayer();
    render();
    requestAnimationFrame(gameLoop);
}

// The game loop will start once all textures are loaded.
