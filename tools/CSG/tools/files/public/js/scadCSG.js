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
	return bufferGeometry;
    // Now `bufferGeometry` is the object you need. You can inspect its `attributes.position.array` to get the desired output.
    //console.log(bufferGeometry.attributes.position.array)
}

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
        item.material = newMaterial;
    })

    // Return the original target object with the new material applied.
    return target
}

// --- Primitive Geometries (Corrected) ---
function sphere({ r, d, fn } = {}) {
    if (d !== undefined) r = d / 2
    r = r || 1
    fn = fn || 32
    const geom =convertGeometry( new THREE.SphereGeometry(r, fn, fn));
	
    return new THREE.Mesh(geom, defaultMaterial.clone())
}

function cube([x = 1, y = 1, z = 1] = [1, 1, 1]) {
    const geom = convertGeometry(new THREE.BoxGeometry(x, z, y));
    
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

    const geom = convertGeometry(new THREE.CylinderGeometry(topRadius, bottomRadius, h, fn));
	
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

function convexHull(...meshes) {
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

function align(config = {}, ...meshes) {
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

function line3d(points2d, start, end, fn = 12) {
    if (!points2d || points2d.length < 3) {
        console.warn(
            'line3d requires at least 3 points to form a closed shape.'
        )
        return null
    }

    const shape = new THREE.Shape()
    shape.moveTo(points2d[0][0], points2d[0][1])
    for (let i = 1; i < points2d.length; i++) {
        shape.lineTo(points2d[i][0], points2d[i][1])
    }

    const extrudePath = new THREE.LineCurve3(
        new THREE.Vector3(start[0], start[1], start[2]),
        new THREE.Vector3(end[0], end[1], end[2])
    )

    const extrudeSettings = {
        steps: 1,
        bevelEnabled: false,
        extrudePath: extrudePath
    }

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings)
    return new THREE.Mesh(geom, defaultMaterial.clone())
}

function linePaths3d(points2d, points3d, fn = 12) {
    if (!points2d || points2d.length < 3) {
        console.warn(
            'linePaths3d requires at least 3 points to form a closed 2D shape.'
        )
        return null
    }
    if (!points3d || points3d.length < 2) {
        console.warn(
            'linePaths3d requires at least 2 points for the 3D extrusion path.'
        )
        return null
    }

    const shape = new THREE.Shape()
    shape.moveTo(points2d[0][0], points2d[0][1])
    for (let i = 1; i < points2d.length; i++) {
        shape.lineTo(points2d[i][0], points2d[i][1])
    }

    const extrudePath = new THREE.CurvePath()
    for (let i = 0; i < points3d.length - 1; i++) {
        const startPoint = points3d[i]
        const endPoint = points3d[i + 1]

        const startVector = new THREE.Vector3(
            startPoint[0],
            startPoint[1],
            startPoint[2]
        )
        const endVector = new THREE.Vector3(
            endPoint[0],
            endPoint[1],
            endPoint[2]
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
function union(...meshes) {
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

function difference(mainMesh, ...subMeshes) {
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

function intersect(...meshes) {
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

// Private object containing all exportable functions
// This is a private, self-contained list within the module.
const _exportedFunctions = {
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
    hide
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
