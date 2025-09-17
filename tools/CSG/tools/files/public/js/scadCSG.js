/*
./js/scadCSG.js
code runs in a browser
*/
import * as THREE from 'three'
import {
    Brush,
    Evaluator,
    ADDITION,
    SUBTRACTION,
    INTERSECTION
} from 'three-bvh-csg'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { api } from '../js/apiCalls.js' // Assuming apiCalls.js is in the same directory

//opentype is IIFE
//settings is on globalThis

globalThis.inch = 25.4

// === CSG Evaluator ===
const csgEvaluator = new Evaluator()
csgEvaluator.useGroups = true

const defaultMaterial = new THREE.MeshStandardMaterial({
    color: 0xffcc00,
    metalness: 0.2,
    roughness: 0.6,
    side: THREE.DoubleSide,
    flatShading: true
})

// Helper function to recursively traverse the target and apply color

function $path(filepath) {
    if (!filepath) return null
    if (filepath.startsWith('/')) return filepath

    const libraryPath =
        typeof settings !== 'undefined' && settings.libraryPath
            ? settings.libraryPath
            : '/csgLib'
    if (filepath.startsWith('$lib/'))
        return libraryPath + '/' + filepath.substring(5)

    const base = globalThis.settings.basePath
    if (!base) {
        alert('Error: Cannot use relative paths. Load or save a project first.')
        return null
    }

    const parts = base.split('/').filter(Boolean)
    const fileParts = filepath.split('/')
    for (const part of fileParts) {
        if (part === '..') {
            if (parts.length > 0) parts.pop()
        } else if (part !== '.' && part !== '') parts.push(part)
    }
    return '/' + parts.join('/')
}

const applyFilter = (item, checkFunction, applyFunction, ...args) => {
    if (item == undefined || item == null) return

    // Case 1: The item is a single mesh (THREE.Mesh or Brush)
    if (checkFunction(item)) {
        applyFunction(item, ...args)
    }
    // Case 2: The item is an array. Recursively process each element.
    else if (Array.isArray(item)) {
        item.forEach((subItem) =>
            applyFilter(subItem, checkFunction, applyFunction, ...args)
        )
    }
    // Case 3: The item is a generic object. Recursively process its properties.
    else if (typeof item === 'object' && item !== null) {
        for (const key in item) {
            if (Object.prototype.hasOwnProperty.call(item, key)) {
                applyFilter(item[key], checkFunction, applyFunction, ...args)
            }
        }
    }
    // All other data types (strings, numbers, etc.) are ignored.
}

function isMesh(item) {
    return item && (item instanceof THREE.Mesh || item instanceof Brush)
}
const applyToMesh = (item, applyFunction, ...args) =>
    applyFilter(item, isMesh, applyFunction, ...args)

function convertGeometry(item) {
    //Create a new BufferGeometry and set its attributes
    const bufferGeometry = new THREE.BufferGeometry()
    bufferGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(item.attributes.position.array, 3)
    )
    bufferGeometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(item.attributes.normal.array, 3)
    )
    bufferGeometry.setAttribute(
        'uv',
        new THREE.BufferAttribute(item.attributes.uv.array, 2)
    )

    // Step 3: Add the index attribute for efficient rendering (optional but recommended)
    if (item.index) {
        bufferGeometry.setIndex(item.index)
    }
    return bufferGeometry
    // Now `bufferGeometry` is the object you need. You can inspect its `attributes.position.array` to get the desired output.
    //console.log(bufferGeometry.attributes.position.array)
}

//////////////


////////////////////////

/**
 * Applies a color to one or more Three.js meshes.
 * This function can handle a single mesh, an array of meshes,
 * or an object containing one or more mesh properties. It is
 * designed to work with both standard THREE.Mesh objects and
 * the Brush objects used by three-bvh-csg.
 *
 * @param {number|string|THREE.Color} c The color to apply.
 * @param {THREE.Mesh|Brush|Array|Object} target The mesh(es) to color.
 * - If a single THREE.Mesh or Brush, its material will be updated.
 * - If an Array, it will iterate through each item, coloring only valid meshes.
 * - If an Object, it will iterate through all properties and apply the
 * color only to properties that are valid meshes or arrays of meshes.
 * @returns {THREE.Mesh|Brush|Array|Object} The original input target with the new material applied.
 */
function color(c, target) {
    const colorVal = new THREE.Color(c)

    // Define a new material to apply to the meshes
    const newMaterial = new THREE.MeshStandardMaterial({
        color: colorVal,
        metalness: 0.2,
        roughness: 0.6,
        side: THREE.DoubleSide,
        flatShading: true
    })

    applyToMesh(target, (item) => {
        item.material = newMaterial
    })

    // Return the original target object with the new material applied.
    return target
}

 

// --- Primitive Geometries (Corrected) ---
function sphere({ r, d, fn } = {}) {
    if (d !== undefined) r = d / 2
    r = r || 1
    fn = fn || 32
    const geom = convertGeometry(new THREE.SphereGeometry(r, fn, fn))

    return new THREE.Mesh(geom, defaultMaterial.clone())
}

function cube([x = 1, y = 1, z = 1] = [1, 1, 1]) {
    const geom = convertGeometry(new THREE.BoxGeometry(x, z, y))

    return new THREE.Mesh(geom, defaultMaterial.clone())
}

function cylinder({ d, dt, db, r, rt, rb, h, fn } = {}) {
    let topRadius, bottomRadius

    if (rt !== undefined) {
        topRadius = rt
    }
    if (rb !== undefined) {
        bottomRadius = rb
    }

    if (topRadius === undefined && dt !== undefined) {
        topRadius = dt / 2
    }
    if (bottomRadius === undefined && db !== undefined) {
        bottomRadius = db / 2
    }

    if (
        topRadius === undefined &&
        bottomRadius === undefined &&
        r !== undefined
    ) {
        topRadius = r
        bottomRadius = r
    }

    if (
        topRadius === undefined &&
        bottomRadius === undefined &&
        d !== undefined
    ) {
        topRadius = d / 2
        bottomRadius = d / 2
    }

    topRadius = topRadius || 0.5
    bottomRadius = bottomRadius || 0.5
    h = h || 1
    fn = fn || 32

    const geom = convertGeometry(
        new THREE.CylinderGeometry(topRadius, bottomRadius, h, fn)
    )

    return new THREE.Mesh(geom, defaultMaterial.clone())
}

// --- Functional Transforms (Corrected for Z-up) ---
function translate([x, y, z], target) {
    applyToMesh(target, (item) => {
        //item.position.set(x, z, y)
        item.geometry.translate(x, z, y)
    })
    return target
}

// --- Functional Rotation (Corrected for Z-up) ---
function rotate([x, y, z], target) {
    applyToMesh(target, (item) => {
        //item.rotation.set(x, z, y)
        item.geometry.rotateX(x)
        item.geometry.rotateZ(y)
        item.geometry.rotateY(z)
    })

    return target
}

// --- Functional scale (Corrected for Z-up) ---
function scale([x, y, z], target) {
    applyToMesh(target, (item) => {
        item.geometry.scale(x, z, y)
    })
    return target
}

function floor(target) {
    applyToMesh(target, (item) => {
        item.geometry.computeBoundingBox()
        const yMin = item.geometry.boundingBox.min.y
        item.position.y += -(yMin + item.position.y)
    })

    return target
}

function convexHull(target) {
    //...meshes) {

    var meshes = []
    applyToMesh(target, (item) => {
        meshes.push(item)
    })

    if (meshes.length === 0) {
        return null
    }

    const vertices = []
    meshes.forEach((mesh) => {
        if (mesh && mesh.geometry && mesh.geometry.isBufferGeometry) {
            mesh.updateMatrixWorld(true)
            const positionAttribute = mesh.geometry.getAttribute('position')
            const tempVector = new THREE.Vector3()
            for (let i = 0; i < positionAttribute.count; i++) {
                tempVector
                    .fromBufferAttribute(positionAttribute, i)
                    .applyMatrix4(mesh.matrixWorld)
                vertices.push(tempVector.clone())
            }
        }
    })

    if (vertices.length < 4) {
        console.warn(
            'Convex hull requires at least 4 vertices. Returning null.'
        )
        return null
    }

    const hullGeometry = new ConvexGeometry(vertices)
    return new THREE.Mesh(hullGeometry, defaultMaterial.clone())
}

function align(config = {}, target) {
    // ...meshes) {

    var meshes = []

    applyToMesh(target, (item) => {
        meshes.push(item)
    })

    const newMeshes = []

    const alignMesh = (mesh) => {
        if (!mesh || !mesh.geometry) {
            console.warn('Align function requires a valid mesh.')
            return
        }

        mesh.geometry.computeBoundingBox()
        const bbox = mesh.geometry.boundingBox
        const center = new THREE.Vector3()
        bbox.getCenter(center)

        const offset = new THREE.Vector3()

        if (config.bx !== undefined) {
            offset.x = config.bx - bbox.min.x
        } else if (config.tx !== undefined) {
            offset.x = config.tx - bbox.max.x
        } else if (config.cx !== undefined) {
            offset.x = config.cx - center.x
        }

        if (config.by !== undefined) {
            offset.z = config.by - bbox.min.z
        } else if (config.ty !== undefined) {
            offset.z = config.ty - bbox.max.z
        } else if (config.cy !== undefined) {
            offset.z = config.cy - center.z
        }

        if (config.bz !== undefined) {
            offset.y = config.bz - bbox.min.y
        } else if (config.tz !== undefined) {
            offset.y = config.tz - bbox.max.y
        } else if (config.cz !== undefined) {
            offset.y = config.cz - center.y
        }

        mesh.position.add(offset)
        newMeshes.push(mesh)
    }

    meshes.forEach(alignMesh)
    return newMeshes.length === 1 ? newMeshes[0] : newMeshes
}










function line3d(shapes, start, end) {
    const meshes = [] // An array to store all the created meshes

    // Iterate through each shape in the input array.
    for (const shape of shapes) {
        // Get the fn value from the shape's userData, defaulting to 30.
        const fn = shape.userData && shape.userData.fn ? shape.userData.fn : 30

        // Create the 3D extrusion path.
        const extrudePath = new THREE.LineCurve3(
            new THREE.Vector3(start[0], start[2], start[1]),
            new THREE.Vector3(end[0], end[2], end[1])
        )

        // Manually extract points from the shape using the fn value.
        const shapePoints = shape.extractPoints(fn)

        const extrudeSettings = {
            steps: 1,
            bevelEnabled: false,
            extrudePath: extrudePath
        }

        // Create a new Shape with the extracted points.
        const extrudedShape = new THREE.Shape(shapePoints.shape)

        // Add the holes, also extracting their points with the correct fn.
        extrudedShape.holes = shapePoints.holes.map((hole) => new THREE.Path(hole))

        // Create the geometry from the new shape.
        const geometry = new THREE.ExtrudeGeometry(extrudedShape, extrudeSettings)

        // Create a mesh and add it to our list.
        const mesh = new THREE.Mesh(geometry, defaultMaterial.clone())
        meshes.push(mesh)
    }

    // Return the array of meshes instead of a single mesh.
    return meshes
}










function linePaths3d(shape, points3d) {
    /*if (!points2d || points2d.length < 3) {
        console.warn(
            'linePaths3d requires at least 3 points to form a closed 2D shape.'
        )
        return null
    }*/
    if (!points3d || points3d.length < 2) {
        console.warn(
            'linePaths3d requires at least 2 points for the 3D extrusion path.'
        )
        return null
    }

    /*
	const shape = new THREE.Shape()
    shape.moveTo(points2d[0][0], points2d[0][1])
    for (let i = 1; i < points2d.length; i++) {
        shape.lineTo(points2d[i][0], points2d[i][1])
    }
	*/

    const extrudePath = new THREE.CurvePath()
    for (let i = 0; i < points3d.length - 1; i++) {
        const startPoint = points3d[i]
        const endPoint = points3d[i + 1]

        const startVector = new THREE.Vector3(
            startPoint[0],
            startPoint[2],
            startPoint[1]
        )
        const endVector = new THREE.Vector3(
            endPoint[0],
            endPoint[2],
            endPoint[1]
        )

        extrudePath.add(new THREE.LineCurve3(startVector, endVector))
    }

    const extrudeSettings = {
        steps: points3d.length - 1,
        bevelEnabled: false,
        extrudePath: extrudePath
    }

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings)
    return new THREE.Mesh(geom, defaultMaterial.clone())
}

// === Multi-Argument CSG Operations (Corrected) ===
function union(target) {
    //...meshes) {

    var meshes = []

    applyToMesh(target, (item) => {
        meshes.push(item)
    })

    if (meshes.length === 0) return null
    if (meshes.length === 1) return meshes[0]
    const brushA = new Brush(meshes[0].geometry, meshes[0].material)
    brushA.position.copy(meshes[0].position)
    brushA.rotation.copy(meshes[0].rotation)
    brushA.scale.copy(meshes[0].scale)
    brushA.updateMatrixWorld(true)

    let result = brushA
    for (let i = 1; i < meshes.length; i++) {
        const mesh = meshes[i]
        const brushB = new Brush(mesh.geometry, mesh.material)
        brushB.position.copy(mesh.position)
        brushB.rotation.copy(mesh.rotation)
        brushB.scale.copy(mesh.scale)
        brushB.updateMatrixWorld(true)
        result = csgEvaluator.evaluate(result, brushB, ADDITION)
    }
    return result
}

function difference(mainMesh, target) {
    //...subMeshes) {

    var subMeshes = []

    applyToMesh(target, (item) => {
        subMeshes.push(item)
    })

    if (!mainMesh || subMeshes.length === 0)
        throw new Error('Difference: need base and one or more subtrahends')
    const brushA = new Brush(mainMesh.geometry, mainMesh.material)
    brushA.position.copy(mainMesh.position)
    brushA.rotation.copy(mainMesh.rotation)
    brushA.scale.copy(mainMesh.scale)
    brushA.updateMatrixWorld(true)

    let result = brushA
    for (const sub of subMeshes) {
        const brushB = new Brush(sub.geometry, sub.material)
        brushB.position.copy(sub.position)
        brushB.rotation.copy(sub.rotation)
        brushB.scale.copy(sub.scale)
        brushB.updateMatrixWorld(true)
        result = csgEvaluator.evaluate(result, brushB, SUBTRACTION)
    }
    return result
}

function intersect(target) {
    //...meshes) {

    var meshes = []

    applyToMesh(target, (item) => {
        meshes.push(item)
    })

    if (meshes.length < 2)
        throw new Error('Intersect requires at least 2 meshes')
    const brushA = new Brush(meshes[0].geometry, meshes[0].material)
    brushA.position.copy(meshes[0].position)
    brushA.rotation.copy(meshes[0].rotation)
    brushA.scale.copy(meshes[0].scale)
    brushA.updateMatrixWorld(true)

    let result = brushA
    for (let i = 1; i < meshes.length; i++) {
        const mesh = meshes[i]
        const brushB = new Brush(mesh.geometry, mesh.material)
        brushB.position.copy(mesh.position)
        brushB.rotation.copy(mesh.rotation)
        brushB.scale.copy(mesh.scale)
        brushB.updateMatrixWorld(true)
        result = csgEvaluator.evaluate(result, brushB, INTERSECTION)
    }
    return result
}

// --- New `scaleTo` Function ---
function scaleTo(config = {}, target) {
    applyToMesh(target, (item) => {
        let geo = item.geometry
        geo.computeBoundingBox()
        let size = new THREE.Vector3()
        geo.boundingBox.getSize(size)

        //console.log("size" + size.x + " " + size.z +" "+size.y);

        let sizeto = 1

        if (config.z != undefined) {
            sizeto = config.z / size.y
        } else if (config.y != undefined) {
            sizeto = config.y / size.z
        } else if (config.x != undefined) {
            sizeto = config.x / size.x
        }

        //console.log("here: " + sx + " " + sy + " " + sz)
        geo.scale(sizeto, sizeto, sizeto)
    })

    return target
}

function show(target) {
    applyToMesh(target, (item) => {
        item.userData.$csgShow = true
    })
    return target
}

function hide(target) {
    applyToMesh(target, (item) => {
        item.userData.$csgShow = false
    })
    return target
}





/**
 * Creates a THREE.Shape from a custom SVG-like path data format.
 * @param {object} shapeData - The data object containing path and fn.
 * @returns {Array<THREE.Shape>} An array of constructed Three.js shape objects.
 */
function shape(shapeData) {
    const rawPath = shapeData.path;
    const allPaths = [];

    // Get fn from input data
    const fnValue = shapeData.fn || 30; // Use provided fn, or default to 30

    function getBoundingBox(path) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let i = 0;
        let currentX = 0, currentY = 0;

        while (i < path.length) {
            const command = path[i];
            i++;

            switch (command) {
                case 'm':
                case 'l':
                    currentX = path[i];
                    currentY = path[i + 1];
                    minX = Math.min(minX, currentX);
                    minY = Math.min(minY, currentY);
                    maxX = Math.max(maxX, currentX);
                    maxY = Math.max(maxY, currentY);
                    i += 2;
                    break;
                case 'q':
                    currentX = path[i + 2];
                    currentY = path[i + 3];
                    minX = Math.min(minX, currentX);
                    minY = Math.min(minY, currentY);
                    maxX = Math.max(maxX, currentX);
                    maxY = Math.max(maxY, currentY);
                    i += 4;
                    break;
                case 'c':
                    currentX = path[i + 4];
                    currentY = path[i + 5];
                    minX = Math.min(minX, currentX);
                    minY = Math.min(minY, currentY);
                    maxX = Math.max(maxX, currentX);
                    maxY = Math.max(maxY, currentY);
                    i += 6;
                    break;
                case 'a':
                case 'e':
                    currentX = path[i];
                    currentY = path[i + 1];
                    if (command === 'a') i += 6;
                    else i += 7;
                    break;
            }
        }
        return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) };
    }

    function isInside(boxA, boxB) {
        const epsilon = 1e-6;
        return boxA.minX >= boxB.minX - epsilon &&
               boxA.maxX <= boxB.maxX + epsilon &&
               boxA.minY >= boxB.minY - epsilon &&
               boxA.maxY <= boxB.maxY + epsilon;
    }

    function getTestPoint(path) {
        let i = 0;
        while (i < path.length) {
            const command = path[i];
            if (command === 'm' || command === 'l') {
                return { x: path[i + 1], y: path[i + 2] };
            }
            i++;
        }
        return { x: 0, y: 0 };
    }
    
    /**
     * Helper function to get a series of points along a curve.
     * This is a simplified flattening method.
     */
    function getCurvePoints(command, currentX, currentY, pathArray, i) {
        const points = [];
        const numSegments = 30; // Adjust for desired accuracy

        switch (command) {
            case 'q':
                const cpX_q = pathArray[i];
                const cpY_q = pathArray[i + 1];
                const endX_q = pathArray[i + 2];
                const endY_q = pathArray[i + 3];

                for (let t = 0; t <= 1; t += 1 / numSegments) {
                    const x = (1 - t) ** 2 * currentX + 2 * (1 - t) * t * cpX_q + t ** 2 * endX_q;
                    const y = (1 - t) ** 2 * currentY + 2 * (1 - t) * t * cpY_q + t ** 2 * endY_q;
                    points.push({ x, y });
                }
                break;
            case 'c':
                const cp1X = pathArray[i];
                const cp1Y = pathArray[i + 1];
                const cp2X = pathArray[i + 2];
                const cp2Y = pathArray[i + 3];
                const endX_c = pathArray[i + 4];
                const endY_c = pathArray[i + 5];

                for (let t = 0; t <= 1; t += 1 / numSegments) {
                    const x = (1 - t) ** 3 * currentX + 3 * (1 - t) ** 2 * t * cp1X + 3 * (1 - t) * t ** 2 * cp2X + t ** 3 * endX_c;
                    const y = (1 - t) ** 3 * currentY + 3 * (1 - t) ** 2 * t * cp1Y + 3 * (1 - t) * t ** 2 * cp2Y + t ** 3 * endY_c;
                    points.push({ x, y });
                }
                break;
            case 'a': // Arc approximation
            case 'e': // Ellipse approximation
                const centerX = pathArray[i];
                const centerY = pathArray[i + 1];
                const radiusX = pathArray[i + 2];
                const radiusY = pathArray[i + 3];
                const startAngle = pathArray[i + 4];
                const endAngle = pathArray[i + 5];
                const clockwise = command === 'a' ? pathArray[i + 5] : pathArray[i + 6];

                const angleDiff = endAngle - startAngle;
                const angleStep = (clockwise ? -1 : 1) * angleDiff / numSegments;

                for (let j = 0; j <= numSegments; j++) {
                    const angle = startAngle + j * angleStep;
                    const x = centerX + radiusX * Math.cos(angle);
                    const y = centerY + radiusY * Math.sin(angle);
                    points.push({ x, y });
                }
                break;
        }
        return points;
    }

    function scanlineIsInside(point, testPath) {
        if (!testPath || testPath.length === 0) {
            return false;
        }

        let intersections = 0;
        let i = 0;
        let currentX = 0, currentY = 0;

        while (i < testPath.length) {
            const command = testPath[i];
            i++;

            if (command === 'm') {
                currentX = testPath[i];
                currentY = testPath[i + 1];
                i += 2;
            } else if (command === 'l') {
                const nextX = testPath[i];
                const nextY = testPath[i + 1];

                if (((currentY <= point.y && nextY > point.y) || (currentY > point.y && nextY <= point.y)) &&
                    (point.x < (nextX - currentX) * (point.y - currentY) / (nextY - currentY) + currentX)) {
                    intersections++;
                }

                currentX = nextX;
                currentY = nextY;
                i += 2;
            } else if (command === 'q' || command === 'c' || command === 'a' || command === 'e') {
                const curvePoints = getCurvePoints(command, currentX, currentY, testPath, i);

                for (let j = 0; j < curvePoints.length - 1; j++) {
                    const p1 = curvePoints[j];
                    const p2 = curvePoints[j + 1];

                    if (((p1.y <= point.y && p2.y > point.y) || (p1.y > point.y && p2.y <= point.y)) &&
                        (point.x < (p2.x - p1.x) * (point.y - p1.y) / (p2.y - p1.y) + p1.x)) {
                        intersections++;
                    }
                }

                currentX = curvePoints[curvePoints.length - 1].x;
                currentY = curvePoints[curvePoints.length - 1].y;
                i += (command === 'q' ? 4 : (command === 'c' ? 6 : (command === 'a' ? 6 : 7)));
            }
        }
        return intersections % 2 === 1;
    }

    function parseCommands(pathArray, threeObject) {
        let i = 0;
        while (i < pathArray.length) {
            const command = pathArray[i];
            i++;

            switch (command) {
                case 'm':
                    threeObject.moveTo(pathArray[i], pathArray[i + 1]);
                    i += 2;
                    break;
                case 'l':
                    threeObject.lineTo(pathArray[i], pathArray[i + 1]);
                    i += 2;
                    break;
                case 'q':
                    threeObject.quadraticCurveTo(pathArray[i], pathArray[i + 1], pathArray[i + 2], pathArray[i + 3]);
                    i += 4;
                    break;
                case 'c':
                    threeObject.bezierCurveTo(pathArray[i], pathArray[i + 1], pathArray[i + 2], pathArray[i + 3], pathArray[i + 4], pathArray[i + 5]);
                    i += 6;
                    break;
                case 'a':
                    threeObject.absarc(pathArray[i], pathArray[i + 1], pathArray[i + 2], pathArray[i + 3], pathArray[i + 4], pathArray[i + 5]);
                    i += 6;
                    break;
                case 'e':
                    threeObject.absellipse(pathArray[i], pathArray[i + 1], pathArray[i + 2], pathArray[i + 3], pathArray[i + 4], pathArray[i + 5], pathArray[i + 6]);
                    i += 7;
                    break;
            }
        }
    }

    // Step 1: Deconstruct raw path into individual sub-paths and get bounding boxes.
    let currentPath = [];
    for (let i = 0; i < rawPath.length; ) {
        const command = rawPath[i];
        if (command === 'm' && currentPath.length > 0) {
            allPaths.push({ path: currentPath, box: getBoundingBox(currentPath), children: [] });
            currentPath = [];
        }
        let commandLength = 0;
        switch (command) {
            case 'm': case 'l': commandLength = 3; break;
            case 'q': commandLength = 5; break;
            case 'c': commandLength = 7; break;
            case 'a': commandLength = 7; break;
            case 'e': commandLength = 8; break;
            default: commandLength = 1;
        }
        for (let j = 0; j < commandLength && i < rawPath.length; j++) {
            currentPath.push(rawPath[i]);
            i++;
        }
    }
    if (currentPath.length > 0) {
        allPaths.push({ path: currentPath, box: getBoundingBox(currentPath), children: [] });
    }

    // Step 2: Build parent-child hierarchy using bounding box containment.
    const hierarchy = [];
    allPaths.sort((a, b) => a.box.area - b.box.area);

    // New Step 1.5: Remove duplicate paths
    const uniquePaths = [];
    const pathStrings = new Set();
    
    allPaths.forEach(pathObj => {
        const pathStr = JSON.stringify(pathObj.path);
        if (!pathStrings.has(pathStr)) {
            uniquePaths.push(pathObj);
            pathStrings.add(pathStr);
        }
    });
    
    
    for (let i = 0; i < uniquePaths.length; i++) {
        const childPath = uniquePaths[i];
        let parent = null;
        for (let j = i + 1; j < uniquePaths.length; j++) {
            const potentialParent = uniquePaths[j];
            if (isInside(childPath.box, potentialParent.box)) {
                parent = potentialParent;
                break;
            }
        }
        if (parent) {
            parent.children.push(childPath);
        } else {
            hierarchy.push(childPath);
        }
    }

    // Step 3: Classify paths and build THREE.Shapes using recursion.
    const finalShapes = [];
    
    /**
     * @param {object} pathObj - The current path object from the hierarchy.
     * @param {THREE.Shape} parentThreeShape - The THREE.Shape object of the immediate solid parent.
     * @param {boolean} isParentHole - True if the immediate parent path is a hole.
     */
    function processPath(pathObj, parentThreeShape, isParentHole) {
        const testPoint = getTestPoint(pathObj.path);
        const isInsideImmediateParent = scanlineIsInside(testPoint, pathObj.parent ? pathObj.parent.path : null);
        
        // The classification flips based on whether the parent is a hole.
        const isHole = isInsideImmediateParent !== isParentHole;

        if (isHole) {
            // This path is a hole, so add it to the parent's holes array.
            const holePath = new THREE.Path();
            parseCommands(pathObj.path, holePath);
            parentThreeShape.holes.push(holePath);

            // Pass the flipped status to children.
            pathObj.children.forEach(child => {
                child.parent = pathObj;
                processPath(child, parentThreeShape, true);
            });

        } else {
            // This path is a solid shape. Create a new THREE.Shape object.
            const solidShape = new THREE.Shape();
            parseCommands(pathObj.path, solidShape);
            solidShape.userData = { fn: fnValue };
            finalShapes.push(solidShape);

            // Children of this solid shape are now potentially holes.
            pathObj.children.forEach(child => {
                child.parent = pathObj;
                processPath(child, solidShape, false);
            });
        }
    }

    // Start processing from the top-level shapes.
    hierarchy.forEach(mainPathObj => {
        // Top-level shapes are always solid.
        const topLevelShape = new THREE.Shape();
        parseCommands(mainPathObj.path, topLevelShape);
        topLevelShape.userData = { fn: fnValue };
        finalShapes.push(topLevelShape);
        
        // Process children of this top-level solid shape.
        mainPathObj.children.forEach(child => {
            child.parent = mainPathObj;
            // The top-level parent is not a hole, so pass false.
            processPath(child, topLevelShape, false);
        });
    });

    return finalShapes;
}







/**
 * Fetches and loads a font file using opentype.js.
 * @param {string} fontPath - The path to the font file.
 * @returns {Promise<opentype.Font>} A promise that resolves to the loaded font object.
 */
async function font(fontPath) {
    try {
        const buffer = await api.readFileBinary(fontPath)
        const font = opentype.parse(buffer)
        console.log(`Successfully loaded font from ${fontPath}`)
        return font
    } catch (error) {
        console.error('Font loading error:', error)
        throw error
    }
}


/**
 * Converts text to a single, flattened path data array using opentype.js.
 * All sub-paths are concatenated into one long array, with 'm' commands
 * marking the start of each new sub-path.
 *
 * @param {object} textData - The object containing font, text, and fontSize.
 * @param {object} textData.font - The opentype.js font object.
 * @param {string} textData.text - The text string to render.
 * @param {number} textData.fontSize - The font size.
 * @returns {Array<string|number>} A single array of all path commands.
 */
function text(textData) {
    let xOffset = 0;
    const allCommands = [];

    // Helper function to convert opentype.js commands to the custom format
    function convertPathToCustomFormat(pathCommands) {
        const customFormatPath = [];
        for (const cmd of pathCommands) {
            switch (cmd.type) {
                case 'M': customFormatPath.push('m', cmd.x, -cmd.y); break;
                case 'L': customFormatPath.push('l', cmd.x, -cmd.y); break;
                case 'Q': customFormatPath.push('q', cmd.x1, -cmd.y1, cmd.x, -cmd.y); break;
                case 'C': customFormatPath.push('c', cmd.x1, -cmd.y1, cmd.x2, -cmd.y2, cmd.x, -cmd.y); break;
                // 'Z' commands are implicitly handled by the next 'M'
            }
        }
        return customFormatPath;
    }

    const glyphs = textData.font.stringToGlyphs(textData.text);

    for (const glyph of glyphs) {
        const opentypePath = glyph.getPath(xOffset, 0, textData.fontSize);
        const commands = opentypePath.commands;
        let currentPathCommands = [];

        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];
            if (command.type === 'M' && currentPathCommands.length > 0) {
                allCommands.push(...convertPathToCustomFormat(currentPathCommands));
                currentPathCommands = [command];
            } else {
                currentPathCommands.push(command);
            }
        }
        if (currentPathCommands.length > 0) {
            allCommands.push(...convertPathToCustomFormat(currentPathCommands));
        }
        
        xOffset += glyph.advanceWidth * (textData.fontSize / textData.font.unitsPerEm);
    }

    return { path: allCommands, fn: textData.fn || 40 }; // Include fn here for consistency
}


// Private object containing all exportable functions
// This is a private, self-contained list within the module.
const _exportedFunctions = {
    THREE,
    sphere,
    cube,
    cylinder,
    union,
    difference,
    intersect,
    translate,
    rotate,
    scale,
    color,
    floor,
    convexHull,
    align,
    line3d,
    linePaths3d,
    scaleTo,
    show,
    hide,
    font,
    text,
    shape
}

// --- Revised `ezport` function ---
// This function returns an object containing both the function names and the functions themselves.
function ezport() {
    const funcNames = Object.keys(_exportedFunctions)
    const funcs = Object.values(_exportedFunctions)
    return { names: funcNames, funcs: funcs }
}

// Export only the ezport function
export { ezport }
