
alert(1);

// Get the canvas element and its 2D rendering context
const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');

// Set canvas dimensions
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Array to hold the star objects
let stars = [];
const numStars = 500; // Number of stars

// Star object constructor
function Star() {
    // Initial position
    this.x = Math.random() * canvas.width - canvas.width / 2;
    this.y = Math.random() * canvas.height - canvas.height / 2;
    this.z = Math.random() * canvas.width;

    // Previous position (for drawing the warp trail)
    this.x_prev = this.x;
    this.y_prev = this.y;

    this.draw = function() {
        // Calculate the star's position in 2D space
        let x2d = this.x / this.z + canvas.width / 2;
        let y2d = this.y / this.z + canvas.height / 2;
        
        // Calculate the star's previous position in 2D space
        let x2d_prev = this.x_prev / this.z + canvas.width / 2;
        let y2d_prev = this.y_prev / this.z + canvas.height / 2;

        // Reset the star if it goes off-screen
        if (x2d < 0 || x2d > canvas.width || y2d < 0 || y2d > canvas.height) {
            this.x = Math.random() * canvas.width - canvas.width / 2;
            this.y = Math.random() * canvas.height - canvas.height / 2;
            this.z = Math.random() * canvas.width;
            this.x_prev = this.x;
            this.y_prev = this.y;
        }

        // Star's size is proportional to its distance (closer stars are bigger)
        let size = (1 - this.z / canvas.width) * 5;

        // Draw the star trail (a line from the previous to the current position)
        ctx.beginPath();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = size;
        ctx.moveTo(x2d, y2d);
        ctx.lineTo(x2d_prev, y2d_prev);
        ctx.stroke();

        // Update previous position
        this.x_prev = this.x;
        this.y_prev = this.y;
    }
    
    // Update the star's position for the warp effect
    this.update = function() {
        this.z -= 0.5; // Controls the speed of the warp
    }
}

// Create the stars
for (let i = 0; i < numStars; i++) {
    stars.push(new Star());
}

// Animation loop
function animate() {
    // Clear the canvas
    ctx.fillStyle = 'rgba(13, 13, 26, 0.4)'; // A semi-transparent dark color to create a fading trail effect
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw and update each star
    for (let i = 0; i < stars.length; i++) {
        stars[i].update();
        stars[i].draw();
    }

    // Call the next frame
    requestAnimationFrame(animate);
}

// Handle window resizing
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Start the animation
animate();
