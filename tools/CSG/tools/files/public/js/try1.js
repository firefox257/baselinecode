<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Three.js Text Generator</title>
    <style>
        body { margin: 0; overflow: hidden; background-color: #222; }
        canvas { display: block; }
    </style>
</head>
<body>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/opentype.js@latest/dist/opentype.min.js"></script>
    <script>
        // Global variables for the scene
        let scene, camera, renderer, mesh;

        /**
         * Creates a THREE.Shape from a custom SVG-like path data format.
         * This function parses a JSON object to build a complex 2D shape,
         * including its outer paths and any internal holes.
         *
         * @param {object} shapeData - The data object containing paths, holes, and fn.
         * @param {Array<Array<string|number>>} shapeData.paths - An array of path commands.
         * @param {Array<Array<string|number>>} shapeData.holes - An array of hole path commands.
         * @returns {THREE.Shape} The constructed Three.js shape object.
         */
        function newShape(shapeData) {
            // Create a new THREE.Shape object
            const shape = new THREE.Shape()

            // Helper function to parse a single path array and add it to a given THREE.Shape or THREE.Path
            function parsePath(pathArray, targetObject) {
                let i = 0
                while (i < pathArray.length) {
                    const command = pathArray[i]
                    i++

                    switch (command) {
                        case 'm': // moveto
                            targetObject.moveTo(pathArray[i], pathArray[i + 1])
                            i += 2
                            break
                        case 'l': // lineto
                            targetObject.lineTo(pathArray[i], pathArray[i + 1])
                            i += 2
                            break
                        case 'q': // quadraticCurve
                            targetObject.quadraticCurveTo(
                                pathArray[i],
                                pathArray[i + 1],
                                pathArray[i + 2],
                                pathArray[i + 3]
                            )
                            i += 4
                            break
                        case 'c': // cubicCurve
                            targetObject.bezierCurveTo(
                                pathArray[i],
                                pathArray[i + 1],
                                pathArray[i + 2],
                                pathArray[i + 3],
                                pathArray[i + 4],
                                pathArray[i + 5]
                            )
                            i += 6
                            break
                        case 'a': // arc: x, y, radius, startAngle, endAngle
                            // Note: Assuming a simple format for demonstration
                            targetObject.absarc(
                                pathArray[i],
                                pathArray[i + 1],
                                pathArray[i + 2],
                                pathArray[i + 3],
                                pathArray[i + 4]
                            )
                            i += 5
                            break
                        case 'e': // ellipse: x, y, xRadius, yRadius, rotation, startAngle, endAngle
                            // Note: Assuming a simple format for demonstration
                            targetObject.absellipse(
                                pathArray[i],
                                pathArray[i + 1],
                                pathArray[i + 2],
                                pathArray[i + 3],
                                pathArray[i + 4],
                                pathArray[i + 5],
                                pathArray[i + 6]
                            )
                            i += 7
                            break
                        default:
                            console.error(`Unknown command: ${command}`)
                            return
                    }
                }
            }

            // Parse and add all main paths
            if (shapeData.paths && shapeData.paths.length > 0) {
                parsePath(shapeData.paths[0], shape)
            }

            // Parse and add all holes
            if (shapeData.holes && shapeData.holes.length > 0) {
                shapeData.holes.forEach((holeArray) => {
                    const holePath = new THREE.Path()
                    parsePath(holeArray, holePath)
                    shape.holes.push(holePath)
                })
            }

            // This is crucial: the fn parameter is for the extractPoints method.
            // We must extract the points to use the fn value.
            const shapePoints = shape.extractPoints(shapeData.fn)

            const finalShape = new THREE.Shape(shapePoints.shape)
            shapePoints.holes.forEach((hole) => {
                finalShape.holes.push(new THREE.Path(hole))
            })

            return finalShape
        }

        /**
         * Converts text to a path and holes data object using opentype.js.
         * The function returns the raw path data in the format
         * { paths: [[...]], holes: [[...]] }.
         *
         * @param {object} textData - The object containing font, text, fn, and fontSize.
         * @param {object} textData.font - The opentype.js font object.
         * @param {string} textData.text - The text string to render.
         * @param {number} textData.fn - The number of facets for the shape's curves.
         * @param {number} textData.fontSize - The font size.
         * @returns {object} The object containing path and hole data arrays.
         */
        function text(textData) {
            const pathData = {
                paths: [],
                holes: []
            };

            const opentypePath = textData.font.getPath(
                textData.text,
                0,
                0,
                textData.fontSize
            );
            
            // Helper function to calculate the signed area of a path.
            // This determines the winding order (clockwise vs. counter-clockwise).
            function getSignedArea(path) {
                let area = 0;
                let pathPoints = [];
                let x = 0;
                let y = 0;

                for (const cmd of path) {
                    switch (cmd.type) {
                        case 'M':
                        case 'L':
                            x = cmd.x;
                            y = cmd.y;
                            pathPoints.push({ x, y });
                            break;
                        case 'Q':
                        case 'C':
                            x = cmd.x;
                            y = cmd.y;
                            pathPoints.push({ x, y });
                            break;
                        case 'Z':
                            // Don't add a point for Z, it just closes the path
                            break;
                    }
                }

                for (let i = 0; i < pathPoints.length; i++) {
                    const p1 = pathPoints[i];
                    const p2 = pathPoints[(i + 1) % pathPoints.length];
                    area += p1.x * p2.y - p2.x * p1.y;
                }
                return area / 2;
            }

            // A helper function to convert the opentype.js path format to our custom format,
            // with inverted Y-coordinates to match Three.js.
            function convertPathToCustomFormat(path) {
                const customFormatPath = [];
                for (const cmd of path) {
                    switch (cmd.type) {
                        case 'M':
                            customFormatPath.push('m', cmd.x, -cmd.y);
                            break;
                        case 'L':
                            customFormatPath.push('l', cmd.x, -cmd.y);
                            break;
                        case 'Q':
                            customFormatPath.push('q', cmd.x1, -cmd.y1, cmd.x, -cmd.y);
                            break;
                        case 'C':
                            customFormatPath.push(
                                'c',
                                cmd.x1,
                                -cmd.y1,
                                cmd.x2,
                                -cmd.y2,
                                cmd.x,
                                -cmd.y
                            );
                            break;
                        case 'Z':
                             // This is a crucial command. A 'Z' command closes the path. We'll simply ignore it
                             // in the converted format, as the logic for newPath will handle it.
                             break;
                        default:
                            console.warn(`Unsupported command type: ${cmd.type}`);
                    }
                }
                return customFormatPath;
            }

            let subPaths = [];
            let currentPath = [];
            let i = 0;

            // Iterate over commands to separate sub-paths
            while (i < opentypePath.commands.length) {
                let command = opentypePath.commands[i];
                currentPath.push(command);
                i++;
                if (command.type === 'Z' && currentPath.length > 0) {
                    subPaths.push(currentPath);
                    currentPath = [];
                } else if (command.type === 'M' && currentPath.length > 1) {
                    subPaths.push(currentPath.slice(0, currentPath.length - 1));
                    currentPath = [command];
                }
            }
            if (currentPath.length > 0) {
                subPaths.push(currentPath);
            }

            // Classify paths into main shapes and holes based on winding order
            if (subPaths.length > 0) {
                subPaths.forEach(path => {
                    const signedArea = getSignedArea(path);
                    
                    // After Y-inversion, a negative area is clockwise (paths) and a positive area is counter-clockwise (holes).
                    const isClockwise = signedArea < 0;

                    if (isClockwise) {
                        pathData.paths.push(convertPathToCustomFormat(path));
                    } else {
                        pathData.holes.push(convertPathToCustomFormat(path));
                    }
                });
            }

            return pathData;
        }

        // Initialize the Three.js scene on window load
        window.onload = function () {
            // Load a sample font for the text example
            const fontUrl = 'https://fonts.gstatic.com/s/roboto/v20/KFOmCnqEu92Fr1Mu4mxK.woff';
            opentype.load(fontUrl, function (err, font) {
                if (err) {
                    console.error('Font could not be loaded: ' + err);
                    return;
                }
                
                init(font);
                animate();
            });
        };

        function init(font) {
            // Scene setup
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x222222);

            // Camera setup
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.z = 200;

            // Renderer setup
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            document.body.appendChild(renderer.domElement);

            // 1. Create the text data object with fontSize
            const textData = {
                font: font,
                text: "B", // This text has holes
                fn: 50,
                fontSize: 100
            };

            // 2. Use the new text() function to get the raw path data
            const pathData = text(textData);

            // 3. Combine the path data with fn for newShape function
            const shapeData = {
                ...pathData,
                fn: textData.fn
            };

            // 4. Use the newShape function to create the THREE.Shape
            const shape = newShape(shapeData);

            if (!shape) {
                console.error("Failed to create shape. Aborting.");
                return;
            }

            // Create geometry and material
            const geometry = new THREE.ShapeGeometry(shape);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
            
            // Create the mesh and add to the scene
            mesh = new THREE.Mesh(geometry, material);
            
            // Center the mesh in the scene
            const bbox = new THREE.Box3().setFromObject(mesh);
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            mesh.position.sub(center);
            
            scene.add(mesh);

            // Handle window resizing
            window.addEventListener('resize', onWindowResize, false);
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function animate() {
            requestAnimationFrame(animate);
            if (mesh) {
                mesh.rotation.x += 0.005;
                mesh.rotation.y += 0.005;
            }
            renderer.render(scene, camera);
        }
    </script>
</body>
</html>