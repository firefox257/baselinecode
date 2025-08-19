// Edit and save to update!

// 1. Define the 2D cross-section shape
// A star shape with 5 points
const starPoints = [];
const outerRadius = 15;
const innerRadius = 7;
for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI / 5) * i;
    starPoints.push([
        Math.cos(angle) * radius,
        Math.sin(angle) * radius
    ]);
}

// 2. Define the 3D extrusion path
// A circular path in the XZ plane
const extrusionPath = [];
const pathRadius = 50; // Radius of the circular path
const pathHeight = 20; // Z-height of the path
const segments = 60;   // Number of points to create the circle

for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * pathRadius;
    const y = Math.sin(angle) * pathRadius;
    const z = pathHeight; // Keep the path at a fixed Z-height

    extrusionPath.push([x, y, z]);
}

// 3. Use linePaths3d to create the object
return linePaths3d(starPoints, extrusionPath);
