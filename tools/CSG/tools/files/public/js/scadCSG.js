/*
./js/scadCSG.js
code runs in a browser
*/

/////

import * as THREE from 'three'
import {
    Brush,
    Evaluator,
    ADDITION,
    SUBTRACTION,
    INTERSECTION
} from 'three-bvh-csg'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { api } from './apiCalls.js' // Assuming apiCalls.js is in the same directory
//import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'

import { BufferGeometry, Float32BufferAttribute } from 'three'

//////

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

function isShape(item) {
    return item && item instanceof THREE.Shape
}
const applyToShape = (item, applyFunction, ...args) =>
    applyFilter(item, isShape, applyFunction, ...args)

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

function color(c, ...target) {
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
function translate([x, y, z], ...target) {
    applyToMesh(target, (item) => {
        //item.position.set(x, z, y)
        item.geometry.translate(x, z, y)
    })
    return target
}

// --- Functional Rotation (Corrected for Z-up) ---
function rotate([x, y, z], ...target) {
    applyToMesh(target, (item) => {
        //item.rotation.set(x, z, y)
        item.geometry.rotateX((x / 180) * -Math.PI)
        item.geometry.rotateZ((y / 180) * -Math.PI)
        item.geometry.rotateY((z / 180) * -Math.PI)
    })

    return target
}

// --- Functional scale (Corrected for Z-up) ---
function scale([x, y, z], ...target) {
    applyToMesh(target, (item) => {
        item.geometry.scale(x, z, y)
    })
    return target
}

function floor(...target) {
    applyToMesh(target, (item) => {
        item.geometry.computeBoundingBox()
        const yMin = item.geometry.boundingBox.min.y
        item.position.y += -(yMin + item.position.y)
    })

    return target
}

function convexHull(...target) {
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
        PrintWarn('Convex hull requires at least 4 vertices. Returning null.')
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
            PrintWarn('Align function requires a valid mesh.')
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

/* eslint-disable */

//*/

//*/

/**
 * @param {object} path - An object containing the path array and default segments.
 * @param {string[]} path.path - An array representing the 3D path commands and parameters.
 * @param {number} path.fn - The default number of segments for curves.
 * @returns {object} An object containing the new path points (p), rotations (r), scales (s), and normals (n).
 */
//old good

function path3d(path) {
    const paths = path.path
    const fn = path.fn
    //PrintLog("here:"+fn)

    var newPath = {
        p: [], // Points (x, y, z)
        r: [], // 2d Rotations
        s: [], // 2d Scales
        n: [] // Normals (Tangents/Up Vectors)
    }

    // ----------------------------------------------------------------------
    // VECTOR MATH FUNCTIONS
    // ----------------------------------------------------------------------
    function vsub(p1, p2) {
        return [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]]
    }

    function vadd(p1, p2) {
        return [p1[0] + p2[0], p1[1] + p2[1], p1[2] + p2[2]]
    }

    function vdot(p1, p2) {
        return p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]
    }

    function vlength(p) {
        return Math.sqrt(vdot(p, p))
    }

    function vnormalize(p) {
        var l = vlength(p)
        return l > 1e-6 ? [p[0] / l, p[1] / l, p[2] / l] : [0, 0, 0]
    }

    function vabs(p) {
        return [Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])]
    }

    function vcross(p1, p2) {
        return [
            p1[1] * p2[2] - p1[2] * p2[1],
            p1[2] * p2[0] - p1[0] * p2[2],
            p1[0] * p2[1] - p1[1] * p2[0]
        ]
    }

    function vscale(p, s) {
        return [p[0] * s, p[1] * s, p[2] * s]
    }

    // ----------------------------------------------------------------------
    // CURVE SEGMENTATION (Bezier)
    // ----------------------------------------------------------------------
    const getPointsAtEqualDistance = (
        startPoint,
        endPoint,
        controlPoints,
        segments
    ) => {
        const getBezierPoint = (t, start, end, ...cps) => {
            if (cps.length === 1) {
                // Quadratic
                const cp1 = cps[0]
                const x =
                    (1 - t) ** 2 * start[0] +
                    2 * (1 - t) * t * cp1[0] +
                    t ** 2 * end[0]
                const y =
                    (1 - t) ** 2 * start[1] +
                    2 * (1 - t) * t * cp1[1] +
                    t ** 2 * end[1]
                const z =
                    (1 - t) ** 2 * start[2] +
                    2 * (1 - t) * t * cp1[2] +
                    t ** 2 * end[2]
                return [x, y, z]
            } else if (cps.length === 2) {
                // Cubic
                const cp1 = cps[0]
                const cp2 = cps[1]
                const x =
                    (1 - t) ** 3 * start[0] +
                    3 * (1 - t) ** 2 * t * cp1[0] +
                    3 * (1 - t) * t ** 2 * cp2[0] +
                    t ** 3 * end[0]
                const y =
                    (1 - t) ** 3 * start[1] +
                    3 * (1 - t) ** 2 * t * cp1[1] +
                    3 * (1 - t) * t ** 2 * cp2[1] +
                    t ** 3 * end[1]
                const z =
                    (1 - t) ** 3 * start[2] +
                    3 * (1 - t) ** 2 * t * cp1[2] +
                    3 * (1 - t) * t ** 2 * cp2[2] +
                    t ** 3 * end[2]
                return [x, y, z]
            }
        }

        const points = []
        const highResPoints = []
        let totalLength = 0
        let prevPoint = startPoint
        const resolution = 1000

        for (let t = 1 / resolution; t <= 1; t += 1 / resolution) {
            const point = getBezierPoint(
                t,
                startPoint,
                endPoint,
                ...controlPoints
            )
            const dist = Math.hypot(
                point[0] - prevPoint[0],
                point[1] - prevPoint[1],
                point[2] - prevPoint[2]
            )
            totalLength += dist
            highResPoints.push(point)
            prevPoint = point
        }

        const segmentLength = totalLength / segments
        let accumulatedLength = 0
        let currentPointIndex = 0
        let lastPoint = startPoint

        for (let j = 0; j < segments; j++) {
            const targetLength = (j + 1) * segmentLength
            while (
                accumulatedLength < targetLength &&
                currentPointIndex < highResPoints.length
            ) {
                const nextPoint = highResPoints[currentPointIndex]
                const dist = Math.hypot(
                    nextPoint[0] - lastPoint[0],
                    nextPoint[1] - lastPoint[1],
                    nextPoint[2] - lastPoint[2]
                )
                accumulatedLength += dist
                lastPoint = nextPoint
                currentPointIndex++

                if (accumulatedLength >= targetLength) {
                    const overshoot = accumulatedLength - targetLength
                    const undershoot = dist - overshoot
                    const ratio = undershoot / dist
                    const prevPoint =
                        highResPoints[currentPointIndex - 2] || startPoint
                    const interpolatedPoint = [
                        prevPoint[0] + ratio * (nextPoint[0] - prevPoint[0]),
                        prevPoint[1] + ratio * (nextPoint[1] - prevPoint[1]),
                        prevPoint[2] + ratio * (nextPoint[2] - prevPoint[2])
                    ]
                    points.push(interpolatedPoint)
                    break
                }
            }
        }
        return points
    }

    // ----------------------------------------------------------------------
    // CORRECTED 3D ARC SEGMENTATION LOGIC
    // ----------------------------------------------------------------------
    const getArcSegmentPoints3D = (p0, p1, p2, segments) => {
        // 1. Find Center C
        const v01 = vsub(p1, p0)
        const v12 = vsub(p2, p1)
        const m01 = vadd(p0, vscale(v01, 0.5))
        const m12 = vadd(p1, vscale(v12, 0.5))

        const A1 = v01[0],
            B1 = v01[1],
            C1 = v01[2],
            D1 = vdot(v01, m01)
        const A2 = v12[0],
            B2 = v12[1],
            C2 = v12[2],
            D2 = vdot(v12, m12)

        const N_arc_unnorm = vcross(v01, v12)

        // CRITICAL FIX: Return [] for degenerate cases, letting the main loop push the final point.
        if (vlength(N_arc_unnorm) < 1e-6) {
            return []
        }

        const N_arc = vnormalize(N_arc_unnorm)
        const A3 = N_arc[0],
            B3 = N_arc[1],
            C3 = N_arc[2],
            D3 = vdot(N_arc, p0)

        // Cramer's Rule for Center
        const detA =
            A1 * (B2 * C3 - C2 * B3) -
            B1 * (A2 * C3 - C2 * A3) +
            C1 * (A2 * B3 - B2 * A3)

        if (Math.abs(detA) < 1e-6) {
            return []
        } // CRITICAL FIX

        const detX =
            D1 * (B2 * C3 - C2 * B3) -
            B1 * (D2 * C3 - C2 * D3) +
            C1 * (D2 * B3 - B2 * D3)
        const detY =
            A1 * (D2 * C3 - C2 * D3) -
            D1 * (A2 * C3 - C2 * A3) +
            C1 * (A2 * D3 - D2 * A3)
        const detZ =
            A1 * (B2 * D3 - D2 * B3) -
            B1 * (A2 * D3 - D2 * A3) +
            D1 * (A2 * B3 - B2 * A3)

        const cx = detX / detA
        const cy = detY / detA
        const cz = detZ / detA
        const center = [cx, cy, cz]

        // 2. Radius R and Basis
        const vC0 = vsub(p0, center)
        const R = vlength(vC0)

        if (R < 1e-6) return [] // CRITICAL FIX

        const X_basis = vnormalize(vC0)
        const Z_basis = N_arc
        const Y_basis = vcross(Z_basis, X_basis)

        // 3. Calculate Angles (Fixed Math.atan2 usage)
        const PI2 = 2 * Math.PI

        const vC2 = vsub(p2, center)
        const x_proj2 = vdot(vC2, X_basis)
        const y_proj2 = vdot(vC2, Y_basis)
        let endAngle = Math.atan2(y_proj2, x_proj2)

        const vC1 = vsub(p1, center)
        const x_proj1 = vdot(vC1, X_basis)
        const y_proj1 = vdot(vC1, Y_basis)
        const controlAngle = Math.atan2(y_proj1, x_proj1)

        endAngle = (endAngle + PI2) % PI2
        const normControlAngle = (controlAngle + PI2) % PI2

        // 4. Determine Sweep (Improved robustness)
        let sweep = endAngle

        const isStartEndCoincident = vlength(vsub(p0, p2)) < 1e-6
        const isControlDistinct = vlength(vsub(p0, p1)) > 1e-6

        if (isStartEndCoincident && isControlDistinct) {
            sweep = PI2
        } else {
            // If control point angle is "beyond" the short arc end angle, take the long arc
            if (normControlAngle > sweep + 1e-6) {
                sweep += PI2
            }
        }

        if (Math.abs(sweep) < 1e-6) {
            return [] // CRITICAL FIX
        }

        // 5. Generate Line Segments
        const segmentPoints = []
        for (let j = 1; j < segments; j++) {
            // Loop up to segments - 1 to exclude endpoint P2
            const angle = (sweep * j) / segments

            const cosA = Math.cos(angle)
            const sinA = Math.sin(angle)

            const termX = vscale(X_basis, R * cosA)
            const termY = vscale(Y_basis, R * sinA)

            const newPoint = vadd(vadd(center, termX), termY)

            segmentPoints.push(newPoint)
        }

        return segmentPoints
    }

    // ----------------------------------------------------------------------
    // MAIN PATH PROCESSING
    // ----------------------------------------------------------------------

    var cp = [0, 0, 0] // Current Point (3D)
    var cr = 0 // Current Rotation (2D)
    var cs = [1, 1] // Current Scale (2D)
    var i = 0

    var atr = 0 // Target Rotation
    var ats = [1, 1] // Target Scale
    var atn = 1 // Number of Segments for next command

    while (i < paths.length) {
        const command = paths[i]

        switch (command) {
            case 'm':
                cp = [paths[i + 1], paths[i + 3], paths[i + 2]]
                newPath.p.push([...cp])
                newPath.r.push(cr)
                newPath.s.push([...cs])
                i += 4
                break
            case 'mr':
                cp = [
                    cp[0] + paths[i + 1],
                    cp[1] + paths[i + 3],
                    cp[2] + paths[i + 2]
                ]
                newPath.p.push([...cp])
                newPath.r.push(cr)
                newPath.s.push([...cs])
                i += 4
                break
            case 'l': {
                const atp = [paths[i + 1], paths[i + 3], paths[i + 2]]
                if (atn === 1) {
                    newPath.p.push([...atp])
                    newPath.r.push(atr)
                    newPath.s.push([...ats])
                } else {
                    for (let v = 1; v <= atn; v++) {
                        const t = v / atn
                        const ix = cp[0] * (1 - t) + atp[0] * t
                        const iy = cp[1] * (1 - t) + atp[1] * t
                        const iz = cp[2] * (1 - t) + atp[2] * t
                        const ir = cr * (1 - t) + atr * t
                        const isx = cs[0] * (1 - t) + ats[0] * t
                        const isy = cs[1] * (1 - t) + ats[1] * t
                        newPath.p.push([ix, iy, iz])
                        newPath.r.push(ir)
                        newPath.s.push([isx, isy])
                    }
                }
                cp = atp
                cr = atr
                cs = ats
                atn = 1
                i += 4
                break
            }
            case 'lr': {
                const endPoint_lr = [
                    cp[0] + paths[i + 1],
                    cp[1] + paths[i + 3],
                    cp[2] + paths[i + 2]
                ]
                if (atn === 1) {
                    newPath.p.push([...endPoint_lr])
                    newPath.r.push(atr)
                    newPath.s.push([...ats])
                } else {
                    for (let v = 1; v <= atn; v++) {
                        const t = v / atn
                        const ix = cp[0] * (1 - t) + endPoint_lr[0] * t
                        const iy = cp[1] * (1 - t) + endPoint_lr[1] * t
                        const iz = cp[2] * (1 - t) + endPoint_lr[2] * t
                        const ir = cr * (1 - t) + atr * t
                        const isx = cs[0] * (1 - t) + ats[0] * t
                        const isy = cs[1] * (1 - t) + ats[1] * t
                        newPath.p.push([ix, iy, iz])
                        newPath.r.push(ir)
                        newPath.s.push([isx, isy])
                    }
                }
                cp = endPoint_lr
                cr = atr
                cs = ats
                atn = 1
                i += 4
                break
            }
            case 'q': {
                const endPoint_q = [paths[i + 4], paths[i + 6], paths[i + 5]]
                const controlPoints_q = [
                    [paths[i + 1], paths[i + 3], paths[i + 2]]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_q = getPointsAtEqualDistance(
                    cp,
                    endPoint_q,
                    controlPoints_q,
                    segmentsToUse
                )

                segmentPoints_q.forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    const interpolatedRotation = cr * (1 - t) + atr * t
                    const interpolatedScale = [
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ]

                    newPath.p.push([...p])
                    newPath.r.push(interpolatedRotation)
                    newPath.s.push([...interpolatedScale])
                })

                cp = endPoint_q
                cr = atr
                cs = ats
                atn = 1
                i += 7
                break
            }
            case 'qr': {
                const endPoint_qr = [
                    cp[0] + paths[i + 4],
                    cp[1] + paths[i + 6],
                    cp[2] + paths[i + 5]
                ]
                const controlPoints_qr = [
                    [
                        cp[0] + paths[i + 1],
                        cp[1] + paths[i + 3],
                        cp[2] + paths[i + 2]
                    ]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_qr = getPointsAtEqualDistance(
                    cp,
                    endPoint_qr,
                    controlPoints_qr,
                    segmentsToUse
                )

                segmentPoints_qr.forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    const interpolatedRotation = cr * (1 - t) + atr * t
                    const interpolatedScale = [
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ]

                    newPath.p.push([...p])
                    newPath.r.push(interpolatedRotation)
                    newPath.s.push([...interpolatedScale])
                })

                cp = endPoint_qr
                cr = atr
                cs = ats
                atn = 1
                i += 7
                break
            }
            case 'c': {
                const endPoint_c = [paths[i + 7], paths[i + 9], paths[i + 8]]
                const controlPoints_c = [
                    [paths[i + 1], paths[i + 3], paths[i + 2]],
                    [paths[i + 4], paths[i + 6], paths[i + 5]]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_c = getPointsAtEqualDistance(
                    cp,
                    endPoint_c,
                    controlPoints_c,
                    segmentsToUse
                )

                segmentPoints_c.forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    const interpolatedRotation = cr * (1 - t) + atr * t
                    const interpolatedScale = [
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ]

                    newPath.p.push([...p])
                    newPath.r.push(interpolatedRotation)
                    newPath.s.push([...interpolatedScale])
                })

                cp = endPoint_c
                cr = atr
                cs = ats
                atn = 1
                i += 10
                break
            }
            case 'cr': {
                const endPoint_cr = [
                    cp[0] + paths[i + 7],
                    cp[1] + paths[i + 9],
                    cp[2] + paths[i + 8]
                ]
                const controlPoints_cr = [
                    [
                        cp[0] + paths[i + 1],
                        cp[1] + paths[i + 3],
                        cp[2] + paths[i + 2]
                    ],
                    [
                        cp[0] + paths[i + 4],
                        cp[1] + paths[i + 6],
                        cp[2] + paths[i + 5]
                    ]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_cr = getPointsAtEqualDistance(
                    cp,
                    endPoint_cr,
                    controlPoints_cr,
                    segmentsToUse
                )

                segmentPoints_cr.forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    const interpolatedRotation = cr * (1 - t) + atr * t
                    const interpolatedScale = [
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ]

                    newPath.p.push([...p])
                    newPath.r.push(interpolatedRotation)
                    newPath.s.push([...interpolatedScale])
                })

                cp = endPoint_cr
                cr = atr
                cs = ats
                atn = 1
                i += 10
                break
            }
            case 'x': {
                // Absolute 3D Arc
                const controlPoint_x = [
                    paths[i + 1],
                    paths[i + 3],
                    paths[i + 2]
                ]
                const endPoint_x = [paths[i + 4], paths[i + 6], paths[i + 5]]

                const segmentsToUse = atn > 1 ? atn : fn || 16

                getArcSegmentPoints3D(
                    cp,
                    controlPoint_x,
                    endPoint_x,
                    segmentsToUse
                ).forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    newPath.p.push([...p])
                    newPath.r.push(cr * (1 - t) + atr * t)
                    newPath.s.push([
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ])
                })

                // CRITICAL FIX: Explicitly push the final endpoint P2 after the segments
                newPath.p.push([...endPoint_x])
                newPath.r.push(atr)
                newPath.s.push([...ats])

                cp = endPoint_x
                cr = atr
                cs = ats
                atn = 1
                i += 7
                break
            }
            case 'xr': {
                // Relative 3D Arc
                const controlPoint_xr = [
                    cp[0] + paths[i + 1],
                    cp[1] + paths[i + 3],
                    cp[2] + paths[i + 2]
                ]
                const endPoint_xr = [
                    cp[0] + paths[i + 4],
                    cp[1] + paths[i + 6],
                    cp[2] + paths[i + 5]
                ]

                //PrintLog("fn:"+fn)
                const segmentsToUse = atn > 1 ? atn : fn || 16

                getArcSegmentPoints3D(
                    cp,
                    controlPoint_xr,
                    endPoint_xr,
                    segmentsToUse
                ).forEach((p, j) => {
                    const t = (j + 1) / segmentsToUse
                    newPath.p.push([...p])
                    newPath.r.push(cr * (1 - t) + atr * t)
                    newPath.s.push([
                        cs[0] * (1 - t) + ats[0] * t,
                        cs[1] * (1 - t) + ats[1] * t
                    ])
                })

                // CRITICAL FIX: Explicitly push the final endpoint P2 after the segments
                newPath.p.push([...endPoint_xr])
                newPath.r.push(atr)
                newPath.s.push([...ats])

                cp = endPoint_xr
                cr = atr
                cs = ats
                atn = 1
                i += 7
                break
            }
            case 'r':
                atr = paths[i + 1]
                i += 2
                break
            case 's':
                ats = [paths[i + 1], paths[i + 2]]
                i += 3
                break
            case 'n':
                atn = paths[i + 1]
                i += 2
                break
            default:
                i = paths.length
                break
        }
    }

    // ----------------------------------------------------------------------
    // TANGENT/NORMAL CALCULATION
    // ----------------------------------------------------------------------

    const calculateAverageTangent = (p0, p1, p2) => {
        if (p0 == undefined) {
            return vnormalize(vsub(p2, p1))
        } else if (p2 == undefined) {
            return vnormalize(vsub(p1, p0))
        } else {
            var v1 = vsub(p1, p0)
            var v2 = vsub(p2, p1)
            return vnormalize(vadd(v1, v2))
        }
    }

    var isClosed = false
    var fp = newPath.p[0]
    var lp = newPath.p[newPath.p.length - 1]

    const tol = 0.001
    if (fp && lp) {
        var check = vabs(vsub(fp, lp))
        if (check[0] <= tol && check[1] <= tol && check[2] <= tol) {
            isClosed = true
        }
    }

    if (newPath.p.length > 1) {
        // First point
        if (isClosed) {
            newPath.n.push(calculateAverageTangent(lp, fp, newPath.p[1]))
        } else {
            newPath.n.push(calculateAverageTangent(undefined, fp, newPath.p[1]))
        }

        // Intermediate points
        for (let j = 1; j < newPath.p.length - 1; j++) {
            newPath.n.push(
                calculateAverageTangent(
                    newPath.p[j - 1],
                    newPath.p[j],
                    newPath.p[j + 1]
                )
            )
        }

        // Last point
        if (isClosed) {
            // Tangent for a closed loop is the same as the first point's tangent
            newPath.n.push(newPath.n[0])
        } else {
            newPath.n.push(
                calculateAverageTangent(
                    newPath.p[newPath.p.length - 2],
                    lp,
                    undefined
                )
            )
        }
    } else if (newPath.p.length === 1) {
        newPath.n.push([1, 0, 0])
    }

    return newPath
}

//------------------------------------------------------------------------------------------------------

/**
 * @param {object} path - An object containing the 2D path and default segment number.
 * @returns {object} An object containing the new path with curves and lines converted to line segments.
 */

function path2d(path) {
    const paths = path.path
    const fn = path.fn

    const newPath = []

    // Helper function to get points at equal distance along a curve (kept as is)
    const getPointsAtEqualDistance = (
        startPoint,
        endPoint,
        controlPoints,
        segments
    ) => {
        const getBezierPoint = (t, start, end, ...cps) => {
            if (cps.length === 1) {
                // Quadratic Bezier
                const cp1 = cps[0]
                const x =
                    (1 - t) ** 2 * start[0] +
                    2 * (1 - t) * t * cp1[0] +
                    t ** 2 * end[0]
                const y =
                    (1 - t) ** 2 * start[1] +
                    2 * (1 - t) * t * cp1[1] +
                    t ** 2 * end[1]
                return [x, y]
            } else if (cps.length === 2) {
                // Cubic Bezier
                const cp1 = cps[0]
                const cp2 = cps[1]
                const x =
                    (1 - t) ** 3 * start[0] +
                    3 * (1 - t) ** 2 * t * cp1[0] +
                    3 * (1 - t) * t ** 2 * cp2[0] +
                    t ** 3 * end[0]
                const y =
                    (1 - t) ** 3 * start[1] +
                    3 * (1 - t) ** 2 * t * cp1[1] +
                    3 * (1 - t) * t ** 2 * cp2[1] +
                    t ** 3 * end[1]
                return [x, y]
            }
        }

        const points = []
        const highResPoints = []
        let totalLength = 0
        let prevPoint = startPoint
        const resolution = 1000

        for (let t = 1 / resolution; t <= 1; t += 1 / resolution) {
            const point = getBezierPoint(
                t,
                startPoint,
                endPoint,
                ...controlPoints
            )
            const dist = Math.hypot(
                point[0] - prevPoint[0],
                point[1] - prevPoint[1]
            )
            totalLength += dist
            highResPoints.push(point)
            prevPoint = point
        }

        const segmentLength = totalLength / segments
        let accumulatedLength = 0
        let currentPointIndex = 0
        let lastPoint = startPoint

        for (let j = 0; j < segments; j++) {
            const targetLength = (j + 1) * segmentLength
            while (
                accumulatedLength < targetLength &&
                currentPointIndex < highResPoints.length
            ) {
                const nextPoint = highResPoints[currentPointIndex]
                const dist = Math.hypot(
                    nextPoint[0] - lastPoint[0],
                    nextPoint[1] - lastPoint[1]
                )
                accumulatedLength += dist
                lastPoint = nextPoint
                currentPointIndex++

                if (accumulatedLength >= targetLength) {
                    const overshoot = accumulatedLength - targetLength
                    const undershoot = dist - overshoot
                    const ratio = undershoot / dist
                    const prevPoint =
                        highResPoints[currentPointIndex - 2] || startPoint
                    const interpolatedPoint = [
                        prevPoint[0] + ratio * (nextPoint[0] - prevPoint[0]),
                        prevPoint[1] + ratio * (nextPoint[1] - prevPoint[1])
                    ]
                    points.push(interpolatedPoint)
                    break
                }
            }
        }
        return points
    }

    // ----------------------------------------------------------------------
    // CORRECTED ARC SEGMENTATION LOGIC
    // ----------------------------------------------------------------------
    /**
     * Finds the center, radius, and segments for a circular arc defined by three points.
     * P0 (start), P1 (control on arc), P2 (end).
     * @param {number[]} p0 - Start point [x, y].
     * @param {number[]} p1 - Control point [x, y].
     * @param {number[]} p2 - End point [x, y].
     * @param {number} segments - Number of line segments to use.
     * @returns {number[][]} An array of [x, y] segment points.
     */
    const getArcSegmentPoints = (p0, p1, p2, segments) => {
        // Fallback for collinear or degenerate points
        const crossProduct =
            (p1[1] - p0[1]) * (p2[0] - p1[0]) -
            (p1[0] - p0[0]) * (p2[1] - p1[1])
        if (Math.abs(crossProduct) < 1e-6) {
            // Points are too close or collinear, fall back to a single line segment
            return [p2]
        }

        // 1. Get Midpoints M01 and M12
        const m01 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
        const m12 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]

        // 2. Get Slopes of Perpendicular Bisectors
        // General form of a line: Ax + By = C
        // Perpendicular bisector of P_a P_b: (x_b - x_a)x + (y_b - y_a)y = (x_b^2 - x_a^2 + y_b^2 - y_a^2) / 2

        const A1 = p1[0] - p0[0]
        const B1 = p1[1] - p0[1]
        const C1 = (p1[0] ** 2 - p0[0] ** 2 + p1[1] ** 2 - p0[1] ** 2) / 2

        const A2 = p2[0] - p1[0]
        const B2 = p2[1] - p1[1]
        const C2 = (p2[0] ** 2 - p1[0] ** 2 + p2[1] ** 2 - p1[1] ** 2) / 2

        const det = A1 * B2 - A2 * B1

        // 3. Find Center (Intersection Point)
        const cx = (C1 * B2 - C2 * B1) / det
        const cy = (A1 * C2 - A2 * C1) / det
        const center = [cx, cy]

        // 4. Calculate Radius
        const r = Math.hypot(p0[0] - cx, p0[1] - cy)

        // 5. Calculate Start, End, and Control Angles (normalized to 0 to 2*PI)
        const PI2 = 2 * Math.PI
        const startAngle = (Math.atan2(p0[1] - cy, p0[0] - cx) + PI2) % PI2
        let endAngle = (Math.atan2(p2[1] - cy, p2[0] - cx) + PI2) % PI2
        const controlAngle = (Math.atan2(p1[1] - cy, p1[0] - cx) + PI2) % PI2

        // 6. Determine Arc Sweep
        // 'sweep' is the angle from startAngle to endAngle in the CCW direction (0 to 2*PI)
        let sweep = (endAngle - startAngle + PI2) % PI2

        // controlAngle_rel is the angle of P1 relative to P0 in the CCW direction (0 to 2*PI)
        const controlAngle_rel = (controlAngle - startAngle + PI2) % PI2

        // Check if the short sweep includes P1.
        // If controlAngle_rel > sweep, it means P1 is on the *longer* arc.
        // We need to add 2*PI to the sweep (or use the complementary angle).
        if (controlAngle_rel > sweep) {
            // The shortest arc does not contain P1. We need the long arc.
            // We extend the sweep by 2*PI.
            // For a full circle: P0=P2, P1 is not at P0. P1_rel > sweep (which is 0).
            sweep = (endAngle - startAngle + PI2 * 3) % PI2 // This calculates the long sweep (sweep + 2*PI)
        }

        // This ensures the arc is drawn in a counter-clockwise direction.
        // If the path needs to be clockwise, swap P0 and P2 or negate the sweep.
        // For standard path commands, we assume CCW is the desired path unless otherwise specified.

        // If sweep is 0 (i.e., P0=P2, P1 is not P0), force a full 2*PI circle.
        if (sweep < 1e-6 && Math.hypot(p0[0] - p2[0], p0[1] - p2[1]) < 1e-6) {
            sweep = PI2
        }

        // 7. Generate Line Segments
        const segmentPoints = []
        for (let j = 1; j <= segments; j++) {
            const angle = startAngle + (sweep * j) / segments
            const x = cx + r * Math.cos(angle)
            const y = cy + r * Math.sin(angle)
            segmentPoints.push([x, y])
        }

        return segmentPoints
    }
    // ----------------------------------------------------------------------
    // END OF CORRECTED ARC SEGMENTATION LOGIC
    // ----------------------------------------------------------------------

    let cp = [0, 0] // Current point [x, y]
    let atn = 1 // Number of segments for the *next* command

    let i = 0
    while (i < paths.length) {
        const command = paths[i]
        switch (command) {
            case 'm':
                cp = [paths[i + 1], paths[i + 2]]
                newPath.push('m', cp[0], cp[1])

                i += 3
                break
            case 'mr':
                cp = [cp[0] + paths[i + 1], cp[1] + paths[i + 2]]
                newPath.push('m', cp[0], cp[1])
                i += 3
                break
            case 'l':
                const endPoint_l = [paths[i + 1], paths[i + 2]]

                if (atn === 1) {
                    newPath.push('l', endPoint_l[0], endPoint_l[1])
                } else {
                    for (let v = 1; v <= atn; v++) {
                        const t = v / atn
                        const ix = cp[0] * (1 - t) + endPoint_l[0] * t
                        const iy = cp[1] * (1 - t) + endPoint_l[1] * t
                        newPath.push('l', ix, iy)
                    }
                }
                cp = endPoint_l
                atn = 1
                i += 3
                break
            case 'lr':
                const endPoint_lr = [cp[0] + paths[i + 1], cp[1] + paths[i + 2]]

                if (atn === 1) {
                    newPath.push('l', endPoint_lr[0], endPoint_lr[1])
                } else {
                    for (let v = 1; v <= atn; v++) {
                        const t = v / atn
                        const ix = cp[0] * (1 - t) + endPoint_lr[0] * t
                        const iy = cp[1] * (1 - t) + endPoint_lr[1] * t
                        newPath.push('l', ix, iy)
                    }
                }
                cp = endPoint_lr
                atn = 1
                i += 3
                break
            case 'q': {
                const endPoint_q = [paths[i + 3], paths[i + 4]]
                const controlPoints_q = [[paths[i + 1], paths[i + 2]]]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_q = getPointsAtEqualDistance(
                    cp,
                    endPoint_q,
                    controlPoints_q,
                    segmentsToUse
                )

                segmentPoints_q.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_q
                atn = 1
                i += 5
                break
            }
            case 'qr': {
                const endPoint_qr = [cp[0] + paths[i + 3], cp[1] + paths[i + 4]]
                const controlPoints_qr = [
                    [cp[0] + paths[i + 1], cp[1] + paths[i + 2]]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_qr = getPointsAtEqualDistance(
                    cp,
                    endPoint_qr,
                    controlPoints_qr,
                    segmentsToUse
                )

                segmentPoints_qr.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_qr
                atn = 1
                i += 5
                break
            }
            case 'c': {
                const endPoint_c = [paths[i + 5], paths[i + 6]]
                const controlPoints_c = [
                    [paths[i + 1], paths[i + 2]],
                    [paths[i + 3], paths[i + 4]]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_c = getPointsAtEqualDistance(
                    cp,
                    endPoint_c,
                    controlPoints_c,
                    segmentsToUse
                )

                segmentPoints_c.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_c
                atn = 1
                i += 7
                break
            }
            case 'cr': {
                const endPoint_cr = [cp[0] + paths[i + 5], cp[1] + paths[i + 6]]
                const controlPoints_cr = [
                    [cp[0] + paths[i + 1], cp[1] + paths[i + 2]],
                    [cp[0] + paths[i + 3], cp[1] + paths[i + 4]]
                ]
                const segmentsToUse = atn > 1 ? atn : fn
                const segmentPoints_cr = getPointsAtEqualDistance(
                    cp,
                    endPoint_cr,
                    controlPoints_cr,
                    segmentsToUse
                )

                segmentPoints_cr.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_cr
                atn = 1
                i += 7
                break
            }
            case 'x': {
                // Absolute Arc Command (P0: cp, P1: Ctr, P2: End)
                const controlPoint_x = [paths[i + 1], paths[i + 2]]
                const endPoint_x = [paths[i + 3], paths[i + 4]]
                const segmentsToUse = atn > 1 ? atn : fn

                const segmentPoints_x = getArcSegmentPoints(
                    cp,
                    controlPoint_x,
                    endPoint_x,
                    segmentsToUse
                )

                segmentPoints_x.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_x
                atn = 1
                i += 5
                break
            }
            case 'xr': {
                // Relative Arc Command (P0: cp, P1: Ctr + cp, P2: End + cp)
                const controlPoint_xr = [
                    cp[0] + paths[i + 1],
                    cp[1] + paths[i + 2]
                ]
                const endPoint_xr = [cp[0] + paths[i + 3], cp[1] + paths[i + 4]]
                const segmentsToUse = atn > 1 ? atn : fn

                const segmentPoints_xr = getArcSegmentPoints(
                    cp,
                    controlPoint_xr,
                    endPoint_xr,
                    segmentsToUse
                )

                segmentPoints_xr.forEach((p) => {
                    newPath.push('l', p[0], p[1])
                })

                cp = endPoint_xr
                atn = 1
                i += 5
                break
            }
            case 'n':
                atn = paths[i + 1]
                i += 2
                break

            case 'r':
            case 's':
                // Ignore these commands
                i += command === 'r' ? 2 : 3
                break

            default:
                // Assuming PrintWarn is defined elsewhere, if not, use console.warn
                // PrintWarn(`Unknown path command: ${command}`)
                i = paths.length
                break
        }
    }

    return {
        path: newPath,
        fn: fn
    }
}

//*/

function convertTo2d(path) {
    const newPath = []
    let i = 0
    while (i < path.length) {
        const command = path[i]
        newPath.push(command)
        switch (command) {
            case 'm':
            case 'mr':
            case 'l':
            case 'lr':
                newPath.push(path[i + 1], path[i + 3]) // Add X and Y, ignore Z
                i += 4
                break
            case 'q':
            case 'qr':
            case 'x':
            case 'xr':
                newPath.push(path[i + 1], path[i + 3], path[i + 4], path[i + 6]) // Add CPs and EP, ignore Z
                i += 7
                break
            case 'c':
            case 'cr':
                newPath.push(
                    path[i + 1],
                    path[i + 3],
                    path[i + 4],
                    path[i + 6],
                    path[i + 7],
                    path[i + 9]
                ) // Add CPs and EP, ignore Z
                i += 10
                break
            case 'r':
            case 'n':
                newPath.push(path[i + 1])
                i += 2
                break
            case 's':
                newPath.push(path[i + 1], path[i + 2])
                i += 3
                break
            default:
                i++
                break
        }
    }
    return newPath
}

function convertTo3d(path, z = 0) {
    const newPath = []
    let i = 0
    while (i < path.length) {
        const command = path[i]
        newPath.push(command)
        switch (command) {
            case 'm':
            case 'mr':
            case 'l':
            case 'lr':
                newPath.push(path[i + 1], z, path[i + 2]) // Add X, Z, and Y
                i += 3
                break
            case 'q':
            case 'qr':
            case 'x':
            case 'xr':
                newPath.push(
                    path[i + 1],
                    z,
                    path[i + 2],
                    path[i + 3],
                    z,
                    path[i + 4]
                ) // Add Z for CPs and EP
                i += 5
                break
            case 'c':
            case 'cr':
                newPath.push(
                    path[i + 1],
                    z,
                    path[i + 2],
                    path[i + 3],
                    z,
                    path[i + 4],
                    path[i + 5],
                    z,
                    path[i + 6]
                ) // Add Z for CPs and EP
                i += 7
                break
            case 'r':
            case 'n':
                newPath.push(path[i + 1])
                i += 2
                break
            case 's':
                newPath.push(path[i + 1], path[i + 2])
                i += 3
                break
            default:
                i++
                break
        }
    }
    return newPath
}

//*/

/* eslint-disable */
function arcPath3d(config) {
    const { startAng, endAng, fn, d } = config

    // Determine radius from either 'd' (diameter) or 'r' (radius)
    let radius
    if (d !== undefined) {
        radius = d / 2
    } else {
        radius = config.r
    }

    const degToRad = (degrees) => (degrees * Math.PI) / 180
    const startRad = degToRad(startAng)
    const endRad = degToRad(endAng)

    const path = []
    const segments = fn || 30

    const startX = radius * Math.cos(startRad)
    const startY = radius * Math.sin(startRad)
    path.push('m', startX, 0, startY)

    for (let i = 1; i <= segments; i++) {
        const t = i / segments
        const currentRad = startRad + (endRad - startRad) * t
        const x = radius * Math.cos(currentRad)
        const y = radius * Math.sin(currentRad)
        path.push('l', x, y, 0)
    }

    return {
        path: path,
        fn: fn
    }
}

/**
 * @param {object} target - The parent object to which the shapes are applied.
 * @param {object} path - The pre-processed path data containing points, rotations, and normals.
 * @param {boolean} close - A flag to indicate if the path should be closed.
 * @returns {THREE.Mesh[]} An array of THREE.js meshes.
 */
//old good

function linePaths3d(target, commandPath, close) {
    var path = path3d(commandPath)
    // This part of the code is not being modified, but it's included for context
    var shapes = []
    applyToShape(target, (item) => {
        shapes.push(item)
    })

    var points3d = []

    var preCalc = []

    var upVector = new THREE.Vector3(0, 1, 0)

    // --- Calculation for Initial Rotation from path.p ---

    // Get the first two points from the path.p array
    // path.p[i] is [x, y, z] in 3D printer coordinates,
    // where x and y are the planar coordinates (ground plane).
    const p1 = path.p[0]
    const p2 = path.p[1]

    // Calculate delta x (dx) and delta y (dy)
    const dx = p2[0] - p1[0] // x2 - x1
    const dy = p2[2] - p1[2] // z2 - z1

    // Calculate the angle using Math.atan2(dy, dx).
    // This gives the angle in radians on the X-Y plane (3D printer coordinates).
    // This angle corresponds to rotating the shape around the Y-axis.
    const initialRotationRadians = -Math.atan2(dy, dx) + Math.PI / 2

    const cosR = Math.cos(initialRotationRadians)
    const sinR = Math.sin(initialRotationRadians)
    // --- End of Calculation ---

    for (var i = 0; i < path.p.length; i++) {
        points3d.push(...[0, 0, i])

        // Apply 2D rotation on X and Z
        const rotation = path.r[i]

        var o = {}
        o.cosR = Math.cos((rotation / 180) * Math.PI)
        o.sinR = Math.sin((rotation / 180) * Math.PI)

        // Now, we need to apply the 3D rotation from the normals and translation.
        // Create a quaternion to handle the 3D orientation.
        const normal = new THREE.Vector3().fromArray(path.n[i])
        //const upVector = new THREE.Vector3(0, 1, 0);
        o.quaternion = new THREE.Quaternion().setFromUnitVectors(
            upVector,
            normal
        )

        upVector.applyQuaternion(o.quaternion)

        preCalc.push(o)
    }

    const meshes = [] // An array to store all the created meshes

    if (!points3d || points3d.length < 6) {
        PrintWarn(
            'linePaths3d requires at least 6 numbers (2 points) for the 3D extrusion path.'
        )
        return null
    }

    const extrudePath = new THREE.CurvePath()

    // Iterate through the flattened array, jumping by 3 for each point
    for (let i = 0; i < points3d.length - 3; i += 3) {
        const startPointIndex = i
        const endPointIndex = i + 3

        const startVector = new THREE.Vector3(
            points3d[startPointIndex],
            points3d[startPointIndex + 2],
            points3d[startPointIndex + 1]
        )
        const endVector = new THREE.Vector3(
            points3d[endPointIndex],
            points3d[endPointIndex + 2],
            points3d[endPointIndex + 1]
        )

        extrudePath.add(new THREE.LineCurve3(startVector, endVector))
    }

    // Add a closing segment if the 'close' parameter is true
    if (close && points3d.length > 6) {
        const startPointIndex = points3d.length - 3
        const endPointIndex = 0

        const startVector = new THREE.Vector3(
            points3d[startPointIndex],
            points3d[startPointIndex + 2],
            points3d[startPointIndex + 1]
        )
        const endVector = new THREE.Vector3(
            points3d[endPointIndex],
            points3d[endPointIndex + 2],
            points3d[endPointIndex + 1]
        )

        extrudePath.add(new THREE.LineCurve3(startVector, endVector))
    }

    const numPoints = points3d.length / 3

    const extrudeSettings = {
        steps: close ? numPoints : numPoints - 1,
        bevelEnabled: false,
        extrudePath: extrudePath
    }

    // --- Mesh Creation Loop (Applying Shape Rotation) ---
    for (const shape of shapes) {
        const fn = shape.userData && shape.userData.fn ? shape.userData.fn : 30
        const shapePoints = shape.extractPoints(fn)

        // --- NEW: Rotate Shape Points ---
        // Rotate the primary shape points
        for (const point of shapePoints.shape) {
            const x = point.x
            const y = point.y
            point.x = x * cosR - y * sinR
            point.y = x * sinR + y * cosR
        }

        // Rotate the hole points
        for (const hole of shapePoints.holes) {
            for (const point of hole) {
                const x = point.x
                const y = point.y
                point.x = x * cosR - y * sinR
                point.y = x * sinR + y * cosR
            }
        }
        // --- END NEW: Rotate Shape Points ---

        const extrudedShape = new THREE.Shape(shapePoints.shape)
        extrudedShape.holes = shapePoints.holes.map(
            (hole) => new THREE.Path(hole)
        )
        const geometry = new THREE.ExtrudeGeometry(
            extrudedShape,
            extrudeSettings
        )
        const mesh = new THREE.Mesh(geometry, defaultMaterial.clone())

        // OLD: mesh.rotateY(initialRotationRadians); is REMOVED

        meshes.push(mesh)
    }

    // The completed section starts here.
    for (const mesh of meshes) {
        const sp = mesh.geometry.attributes.position
        for (var i = 0; i < sp.count; i++) {
            var yindex = sp.getY(i)
            //PrintLog('yinde:' + yindex)
            // Get the local cross-section coordinates from the extruded geometry.
            var x = sp.getX(i)
            var y = 0 // This is set to 0 to flatten out the cross section.
            var z = sp.getZ(i)

            // Apply path.s for scale
            x = x * path.s[yindex][0]
            z = z * path.s[yindex][1]

            // Apply 2D rotation on X and Z
            //const rotation = path.r[yindex];
            var o = preCalc[yindex]
            //const cosR = Math.cos(rotation/180*Math.PI);
            //const sinR = Math.sin(rotation/180*Math.PI);

            let rotatedX = x * o.cosR - z * o.sinR
            let rotatedZ = x * o.sinR + z * o.cosR

            x = rotatedX
            z = rotatedZ

            // Now, we need to apply the 3D rotation from the normals and translation.
            // Create a quaternion to handle the 3D orientation.
            //const normal = new THREE.Vector3().fromArray(path.n[yindex]);
            //const upVector = new THREE.Vector3(0, 1, 0);
            //const quaternion = new THREE.Quaternion().setFromUnitVectors(upVector, normal);

            // Create a point in local space.
            const point = new THREE.Vector3(x, y, z)

            // Apply the 3D rotation to the point using the quaternion.

            for (var k = 0; k <= yindex; k++) {
                //point.applyQuaternion(o.quaternion)

                point.applyQuaternion(preCalc[k].quaternion)
            }

            // Apply the 3D translation from path.p[yindex]
            point.x += path.p[yindex][0]
            point.y += path.p[yindex][1]
            point.z += path.p[yindex][2]

            // Update the geometry's attributes.
            sp.setX(i, point.x)
            sp.setY(i, point.y)
            sp.setZ(i, point.z)
        }
    }

    // Return the array of meshes.
    return meshes
}

//*/

// === Multi-Argument CSG Operations (Corrected) ===
function union(...target) {
    //...meshes) {

    var meshes = []

    applyToMesh(target, (item) => {
        meshes.push(item)
    })
    PrintLog('len:' + meshes.length)

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

function difference(meshes, ...target) {
    //...subMeshes) {
    var mainMesh
    if (Array.isArray(meshes) || typeof item === 'object') {
        mainMesh = union(meshes)
    } else {
        mainMesh = meshes
    }

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

    //return new THREE.Mesh(result.geometry, defaultMaterial.clone());
}

function intersect(...target) {
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

/**
 * Computes the symmetric difference of two or more meshes.
 * This operation returns the parts of the meshes that do not overlap.
 *
 * @param {THREE.Mesh|Brush|Array|Object} target The mesh(es) to operate on.
 * @returns {THREE.Mesh|Brush} The resulting mesh representing the symmetric difference.
 */
function inverseIntersect(...target) {
    var meshes = []

    applyToMesh(target, (item) => {
        meshes.push(item)
    })

    if (meshes.length < 2) {
        throw new Error('Symmetric difference requires at least 2 meshes.')
    }

    // Step 1: Get the intersection of all meshes.
    const intersectionResult = intersect(meshes)

    // Step 2: Subtract the intersection from the union of all meshes.
    const unionResult = union(meshes)

    // The result is the union of all parts that don't overlap.
    const result = difference(unionResult, [intersectionResult])

    return result
}

/**
 * Subdivides a mesh's geometry to increase its resolution.
 * This function iteratively subdivides faces until all edge lengths are below the specified resolution.
 *
 * @param {object} config - Configuration object with a 'resolution' property.
 * @param {number} config.resolution - The maximum desired edge length. A lower value means more detail.
 * @param {THREE.Mesh} target - The mesh to subdivide.
 * @returns {THREE.Mesh} The subdivided mesh.
 */
function subdivide({ resolution = 0.2 }, ...target) {
    applyToMesh(target, (item) => {
        let geometry = item.geometry
        if (!geometry.isBufferGeometry || !geometry.index) {
            console.error('Subdivide requires indexed BufferGeometry.')
            return
        }

        let needsSubdivision = true
        let iteration = 0
        const maxIterations = 10 // Safety break to prevent infinite loops

        while (needsSubdivision && iteration < maxIterations) {
            needsSubdivision = false
            const positions = geometry.attributes.position.array
            const indices = geometry.getIndex().array

            // Using a Map to store unique new vertices to avoid duplicates
            const vertexMap = new Map()
            const getMidpoint = (idxA, idxB) => {
                const key = `${Math.min(idxA, idxB)}_${Math.max(idxA, idxB)}`
                if (vertexMap.has(key)) {
                    return vertexMap.get(key)
                }

                const a = new THREE.Vector3().fromArray(positions, idxA * 3)
                const b = new THREE.Vector3().fromArray(positions, idxB * 3)
                const midpoint = a.lerp(b, 0.5)

                const newIdx = positions.length / 3 + vertexMap.size // Calculate the new index
                vertexMap.set(key, { index: newIdx, position: midpoint })
                return vertexMap.get(key)
            }

            const newIndices = []
            for (let i = 0; i < indices.length; i += 3) {
                const iA = indices[i]
                const iB = indices[i + 1]
                const iC = indices[i + 2]

                const posA = new THREE.Vector3().fromArray(positions, iA * 3)
                const posB = new THREE.Vector3().fromArray(positions, iB * 3)
                const posC = new THREE.Vector3().fromArray(positions, iC * 3)

                const edgeAB_length = posA.distanceTo(posB)
                const edgeBC_length = posB.distanceTo(posC)
                const edgeCA_length = posC.distanceTo(posA)

                if (
                    edgeAB_length > resolution ||
                    edgeBC_length > resolution ||
                    edgeCA_length > resolution
                ) {
                    needsSubdivision = true

                    const midAB = getMidpoint(iA, iB)
                    const midBC = getMidpoint(iB, iC)
                    const midCA = getMidpoint(iC, iA)

                    // Add the 4 new triangles
                    newIndices.push(iA, midAB.index, midCA.index)
                    newIndices.push(iB, midBC.index, midAB.index)
                    newIndices.push(iC, midCA.index, midBC.index)
                    newIndices.push(midAB.index, midBC.index, midCA.index)
                } else {
                    newIndices.push(iA, iB, iC)
                }
            }

            if (needsSubdivision) {
                const newPositionsArray = Array.from(positions)
                for (const midpoint of vertexMap.values()) {
                    newPositionsArray.push(
                        midpoint.position.x,
                        midpoint.position.y,
                        midpoint.position.z
                    )
                }

                const newGeometry = new THREE.BufferGeometry()
                newGeometry.setAttribute(
                    'position',
                    new THREE.Float32BufferAttribute(newPositionsArray, 3)
                )
                newGeometry.setIndex(
                    new THREE.Uint32BufferAttribute(newIndices, 1)
                )
                newGeometry.computeVertexNormals()

                geometry.dispose()
                geometry = newGeometry
                item.geometry = geometry
            }
            iteration++
        }
        item.geometry.computeVertexNormals() // Final compute for clean normals
    })
    return target
}

// --- New `scaleTo` Function ---
function scaleTo(config = {}, ...target) {
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

function scaleAdd(config = {}, ...target) {
    applyToMesh(target, (item) => {
        let geo = item.geometry
        geo.computeBoundingBox()
        let size = new THREE.Vector3()
        geo.boundingBox.getSize(size)

        let scaleX = 1
        let scaleY = 1
        let scaleZ = 1

        if (config.x != undefined) {
            scaleX = (size.x + config.x) / size.x
        }

        if (config.y != undefined) {
            scaleY = (size.y + config.y) / size.y
        }

        if (config.z != undefined) {
            scaleZ = (size.z + config.z) / size.z
        }

        geo.scale(scaleX, scaleY, scaleZ)
    })

    return target
}

function show(...target) {
    applyToMesh(target, (item) => {
        item.userData.$csgShow = true
    })
    return target
}

function hide(...target) {
    applyToMesh(target, (item) => {
        item.userData.$csgShow = false
    })
    return target
}

/**
 * Calculates the collective world-space bounding box for an array of THREE.Object3D objects.
 * NOTE: This function requires that the THREE namespace (e.g., THREE.Box3, THREE.Vector3)
 * is available in the execution scope (meaning you must have imported Three.js).
 *
 * @param {THREE.Object3D[]} objectsArray - An array of Three.js objects (e.g., Meshes or Brushes).
 * @returns {{min: THREE.Vector3, max: THREE.Vector3} | null} The combined bounding box in world coordinates, or null if the array is empty/invalid.
 */
function boundingBox(...target) {
    //var objectsArray=[];

    const masterBox = new THREE.Box3()

    applyToMesh(target, (item) => {
        //objectsArray.push(item)
        item.geometry.computeBoundingBox()
        // 2. Calculate the object's world-space bounding box (tempBox).
        const tempBox = new THREE.Box3().setFromObject(item)

        // 3. Expand the master box to include the temporary box.
        masterBox.union(tempBox)
    })

    if (masterBox.isEmpty()) {
        console.warn(
            'Combined bounding box calculation resulted in an empty box.'
        )
        return null
    }

    // Return the result with min and max vectors.
    //3d printer cordinates.

    return {
        min: {
            x: masterBox.min.x,
            y: masterBox.min.z,
            z: masterBox.min.y
        },
        max: {
            x: masterBox.max.x,
            y: masterBox.max.z,
            z: masterBox.max.y
        }
    }
}








/**
 * Calculates the bounding box of a path by first flattening curves 
 * into line segments using path2d.
 * * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} An object containing the min and max {x, y} coordinates.
 */
function boundingBoxPath(pathObject) {
    // 1. Flatten the path using path2d to ensure all segments are 'm' or 'l'
    const { path: flattenedPath } = path2d(pathObject);
    
    // Initialize min/max values
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // 2. Iterate through the flattened path
    let i = 0;
    while (i < flattenedPath.length) {
        const command = flattenedPath[i];
        i++;

        if (command === 'm' || command === 'l') {
            const x = flattenedPath[i];
            const y = flattenedPath[i + 1];

            // Update min/max
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);

            i += 2;
        } else if (command === 'n' || command === 'r' || command === 's') {
            // Skip non-coordinate commands (n: 1 arg, r: 1 arg, s: 2 args)
            const numArgs = command === 'n' || command === 'r' ? 1 : command === 's' ? 2 : 0;
            i += numArgs;
        } else {
            // Since path2d should only return 'm', 'l', 'n', 'r', 's', 
            // any other command here is an error or a command with arguments 
            // that path2d failed to remove/flatten.
            // In a robust implementation, you might log a warning or handle 
            // the coordinate counts for the original commands (e.g., q, c, x).
            // For this design, we trust path2d.
            break; 
        }
    }

    // 3. Return the bounding box object
    return {
        min: { x: minX, y: minY },
        max: { x: maxX, y: maxY }
    };
}




// Function definitions for 'boundingBox', 'align', 'translate', and 'applyToMesh'
// are assumed to be available in the execution scope.

/**
 * Aligns and translates target objects relative to a primary reference object (obj)
 * based on a three-character command structure (e.g., 'ttx' = Top-of-Obj, Top-of-Target in X).
 *
 * * --- AXIS COORDINATE SYSTEM (Z-UP BOUNDS LOGIC) ---
 * The bounding box calculation follows a standard Z-Up orientation.
 *
 * * --- COMMAND STRUCTURE [REF-ANCHOR][TARGET-ALIGN][AXIS] ---
 *
 * 1. REF-ANCHOR (Reference Object Boundary):
 * - 't': **Top/Min** boundary on X/Y axes, **Top/Max** boundary on Z axis (The "highest" value in the Z-Up system).
 * - 'b': **Bottom/Max** boundary on X/Y axes, **Bottom/Min** boundary on Z axis (The "lowest" value in the Z-Up system).
 * - 'c': **Center** of the reference object.
 *
 * * 2. TARGET-ALIGN (Target Object Alignment Point):
 * - 't': Aligns the target's **Top/Min** boundary on X/Y axes, **Top/Max** boundary on Z axis.
 * - 'b': Aligns the target's **Bottom/Max** boundary on X/Y axes, **Bottom/Min** boundary on Z axis.
 * - 'c': Aligns the target's **Center**.
 *
 * * 3. AXIS (Placement Axis):
 * - 'x': X-axis (Lateral)
 * - 'y': Y-axis (Depth/Lateral)
 * - 'z': Z-axis (Vertical / Up-Down)
 *
 * * --- ALL SUPPORTED COMMANDS ---
 * * | X-Axis (Lateral) | Y-Axis (Depth/Lateral) | Z-Axis (Vertical) |
 * | :--------------- | :--------------------- | :---------------- |
 * | ttx, tbx, tcx    | tty, tby, tcy          | ttz, tbz, tcz     |
 * | btx, bbx, bcx    | bty, bby, bcy          | btz, bbz, bcz     |
 * | ctx, cbx, ccx    | cty, cby, ccy          | ctz, cbz, ccz     |
 *
 * * @param {object} offsets - Commands defining the desired alignment/offset relative to 'obj'.
 * e.g., { 'ttx': 10 } (Aligns obj's min-X with target's min-X, then adds a +10 offset)
 * @param {object} obj - The primary reference object. This object's position remains unchanged.
 * @param {...object} target - The objects to be moved (aligned and translated).
 */

function placement(offsets = {}, obj, ...target) {
    if (!obj) {
        PrintError(
            'Placement function requires a valid reference object (obj).'
        )
        return []
    }

    // [ ... function body from the previous response ... ]

    // 1. Calculate the Z-up world bounding box of the reference object (obj).
    const objBounds = boundingBox(obj)
    const targetBounds = boundingBox(...target)
    //PrintLog(JSON.stringify(objBounds))
    //PrintLog(JSON.stringify(objBounds))

    if (!objBounds) {
        PrintWarn(
            'Reference object bounding box is empty, cannot place target.'
        )
        return
    }
    if (!targetBounds) {
        PrintWarn(
            'Reference targets bounding box is empty, cannot place target.'
        )
        return
    }

    // 2. Process the first valid command in the offsets object
    var ox, oy, oz
    var tx, ty, tz
    var xx, yy, zz
    xx = yy = zz = 0

    for (const cmd in offsets) {
        if (offsets.hasOwnProperty(cmd)) {
            const offsetValue = offsets[cmd]

            // Command structure: [Obj-Anchor][Target-Align][Axis]
            const objAnchor = cmd[0]
            const targetAnchor = cmd[1]
            const axisLetter = cmd[2]
			//PrintLog(objAnchor+targetAnchor+)
            if (axisLetter === 'x') {
				
                if (objAnchor === 't') {
                    ox = objBounds.min.x
                } else if (objAnchor === 'c') {
                    ox = (objBounds.min.x + objBounds.max.x) / 2
                } else if (objAnchor === 'b') {
                    ox = objBounds.max.x
                } else continue

                if (targetAnchor === 't') {
                    tx = targetBounds.min.x
                } else if (targetAnchor === 'c') {
                    tx = (targetBounds.min.x + targetBounds.max.x) / 2
                } else if (targetAnchor === 'b') {
                    tx = targetBounds.max.x
                } else continue

                xx = offsetValue
            } else if (axisLetter === 'y') {
                if (objAnchor === 't') {
                    oy = objBounds.min.y
                } else if (objAnchor === 'c') {
                    oy = (objBounds.min.y + objBounds.max.y) / 2
                } else if (objAnchor === 'b') {
                    oy = objBounds.max.y
                } else continue

                if (targetAnchor === 't') {
                    ty = targetBounds.min.y
                } else if (targetAnchor === 'c') {
                    ty = (targetBounds.min.y + targetBounds.max.y) / 2
                } else if (targetAnchor === 'b') {
                    ty = targetBounds.max.y
                } else continue

                yy = offsetValue
            } else if (axisLetter === 'z') {
                if (objAnchor === 't') {
                    oz = objBounds.max.z
                } else if (objAnchor === 'c') {
                    oz = (objBounds.min.z + objBounds.max.z) / 2
                } else if (objAnchor === 'b') {
                    oz = objBounds.min.z
                } else continue

                if (targetAnchor === 't') {
                    tz = targetBounds.max.z
                } else if (targetAnchor === 'c') {
                    tz = (targetBounds.min.z + targetBounds.max.z) / 2
                } else if (targetAnchor === 'b') {
                    tz = targetBounds.min.z
                } else continue
                zz = offsetValue
            } else continue
        }
    }

    if (
        ox === undefined ||
        oy === undefined ||
        oz === undefined ||
        tx === undefined ||
        ty === undefined ||
        tz === undefined
    ) {
		
		
        PrintError('All placment offsets need to be defined.')
        return
    }

    translate([ox - tx + xx, oy - ty + yy, oz - tz + zz], ...target)
    
	return[obj,...target]
}



/**
 * Translates a path data object.
 * @param {Array<number>} offset - An array containing the [x, y] offset.
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object with translated coordinates.
 */
function translatePath([x, y], pathObject) {
    const newPath = []
    let i = 0
    while (i < pathObject.path.length) {
        const command = pathObject.path[i]
        newPath.push(command)
        i++
        switch (command) {
            // Absolute commands with 1 point: m, l
            case 'm':
            case 'l':
                newPath.push(pathObject.path[i] + x, pathObject.path[i + 1] + y)
                i += 2
                break

            // Absolute commands with 2 points: q, x
            case 'q':
            case 'x':
                newPath.push(
                    pathObject.path[i] + x,      // Point 1 X (Control for q, Ctr for x)
                    pathObject.path[i + 1] + y,  // Point 1 Y
                    pathObject.path[i + 2] + x,  // Point 2 X (End for q, End for x)
                    pathObject.path[i + 3] + y
                )
                i += 4
                break

            // Absolute command with 3 points: c
            case 'c':
                newPath.push(
                    pathObject.path[i] + x,      // Control Point 1 X
                    pathObject.path[i + 1] + y,  // Control Point 1 Y
                    pathObject.path[i + 2] + x,  // Control Point 2 X
                    pathObject.path[i + 3] + y,  // Control Point 2 Y
                    pathObject.path[i + 4] + x,  // End Point X
                    pathObject.path[i + 5] + y
                )
                i += 6
                break

            // Relative commands: mr, lr, qr, cr, xr
            // Relative coordinates are invariant under translation, so they are pushed as is.
            case 'mr':
            case 'lr': {
                newPath.push(pathObject.path[i], pathObject.path[i + 1])
                i += 2
                break
            }
            case 'qr':
            case 'xr': {
                newPath.push(
                    pathObject.path[i], pathObject.path[i + 1],
                    pathObject.path[i + 2], pathObject.path[i + 3]
                )
                i += 4
                break
            }
            case 'cr': {
                newPath.push(
                    pathObject.path[i], pathObject.path[i + 1],
                    pathObject.path[i + 2], pathObject.path[i + 3],
                    pathObject.path[i + 4], pathObject.path[i + 5]
                )
                i += 6
                break
            }

            case 'n':
            case 'r':
            case 's':
                // Non-coordinate commands
                const numArgs = command === 'n' || command === 'r' ? 1 : command === 's' ? 2 : 0
                for (let k = 0; k < numArgs; k++) {
                    newPath.push(pathObject.path[i + k])
                }
                i += numArgs
                break
            default:
                break
        }
    }
    return { path: newPath, fn: pathObject.fn }
}

// ----------------------------------------------------------------------------------------------------------------------

/**
 * Rotates a path data object by a given angle around the origin (0,0).
 * @param {number} angle - The rotation angle (in degrees, as the original conversion to radians is preserved).
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object with rotated coordinates.
 */
function rotatePath(angle, pathObject) {
    const newPath = []
    // Angle conversion (assuming angle is in degrees based on original code)
    const rotationAngle = (angle / 180) * Math.PI
    const cos = Math.cos(rotationAngle)
    const sin = Math.sin(rotationAngle)
    let i = 0

    // Helper function for rotation: x' = x cos + y sin, y' = -x sin + y cos
    const rotate = (x, y) => [x * cos + y * sin, -x * sin + y * cos]

    while (i < pathObject.path.length) {
        const command = pathObject.path[i]
        newPath.push(command)
        i++
        let x, y, x1, y1, x2, y2, rotated

        switch (command) {
            // Commands with one point: m, mr, l, lr (Absolute and Relative points must be rotated)
            case 'm':
            case 'mr':
            case 'l':
            case 'lr':
                x = pathObject.path[i]
                y = pathObject.path[i + 1]
                rotated = rotate(x, y)
                newPath.push(rotated[0], rotated[1])
                i += 2
                break

            // Commands with two points: q, qr, x, xr (Absolute and Relative points must be rotated)
            case 'q':
            case 'qr':
            case 'x':
            case 'xr':
                x1 = pathObject.path[i]     // Point 1 X
                y1 = pathObject.path[i + 1] // Point 1 Y
                x = pathObject.path[i + 2]  // Point 2 X
                y = pathObject.path[i + 3]  // Point 2 Y

                const rotated1 = rotate(x1, y1)
                const rotatedEnd = rotate(x, y)

                newPath.push(
                    rotated1[0], rotated1[1], // Point 1 (Control/Center)
                    rotatedEnd[0], rotatedEnd[1] // Point 2 (End)
                )
                i += 4
                break

            // Commands with three points: c, cr (Absolute and Relative points must be rotated)
            case 'c':
            case 'cr':
                x1 = pathObject.path[i]     // Control Point 1 X
                y1 = pathObject.path[i + 1] // Control Point 1 Y
                x2 = pathObject.path[i + 2] // Control Point 2 X
                y2 = pathObject.path[i + 3] // Control Point 2 Y
                x = pathObject.path[i + 4]  // End Point X
                y = pathObject.path[i + 5]  // End Point Y

                const rotatedA = rotate(x1, y1)
                const rotatedB = rotate(x2, y2)
                const rotatedC = rotate(x, y)

                newPath.push(
                    rotatedA[0], rotatedA[1], // Control Point 1
                    rotatedB[0], rotatedB[1], // Control Point 2
                    rotatedC[0], rotatedC[1]  // End Point
                )
                i += 6
                break

            case 'n':
            case 'r':
            case 's':
                // Non-coordinate commands
                const numArgs = command === 'n' || command === 'r' ? 1 : command === 's' ? 2 : 0
                for (let k = 0; k < numArgs; k++) {
                    newPath.push(pathObject.path[i + k])
                }
                i += numArgs
                break
            default:
                break
        }
    }
    return { path: newPath, fn: pathObject.fn }
}



/**
 * Scales a path data object by a given factor.
 * @param {Array<number>} scaleFactors - An array containing the [scaleX, scaleY] factors.
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object with scaled coordinates.
 */
function scalePath([scaleX, scaleY], pathObject) {
    const newPath = []
    let i = 0

    // Helper function to scale a single coordinate pair
    const scalePoint = (x, y) => [x * scaleX, y * scaleY]

    while (i < pathObject.path.length) {
        const command = pathObject.path[i]
        newPath.push(command)
        i++
        let x, y, x1, y1, x2, y2, scaledPoint

        switch (command) {
            // Commands with one point: m, mr, l, lr (Absolute and Relative points are scaled)
            case 'm':
            case 'mr':
            case 'l':
            case 'lr':
                x = pathObject.path[i]
                y = pathObject.path[i + 1]
                scaledPoint = scalePoint(x, y)
                newPath.push(scaledPoint[0], scaledPoint[1])
                i += 2
                break

            // Commands with two points: q, qr, x, xr (Absolute and Relative points are scaled)
            case 'q':
            case 'qr':
            case 'x': // Absolute Arc with 3 points: P0 (cp), P1 (Ctr), P2 (End). Arguments are P1, P2.
            case 'xr': // Relative Arc with 3 points. Arguments are P1_rel, P2_rel.
                x1 = pathObject.path[i]     // Point 1 X
                y1 = pathObject.path[i + 1] // Point 1 Y
                x = pathObject.path[i + 2]  // Point 2 X
                y = pathObject.path[i + 3]  // Point 2 Y

                const scaled1 = scalePoint(x1, y1)
                const scaledEnd = scalePoint(x, y)

                newPath.push(
                    scaled1[0], scaled1[1],     // Point 1 (Control/Center)
                    scaledEnd[0], scaledEnd[1]  // Point 2 (End)
                )
                i += 4
                break

            // Commands with three points: c, cr (Absolute and Relative points are scaled)
            case 'c':
            case 'cr':
                x1 = pathObject.path[i]     // Control Point 1 X
                y1 = pathObject.path[i + 1] // Control Point 1 Y
                x2 = pathObject.path[i + 2] // Control Point 2 X
                y2 = pathObject.path[i + 3] // Control Point 2 Y
                x = pathObject.path[i + 4]  // End Point X
                y = pathObject.path[i + 5]  // End Point Y

                const scaledA = scalePoint(x1, y1)
                const scaledB = scalePoint(x2, y2)
                const scaledC = scalePoint(x, y)

                newPath.push(
                    scaledA[0], scaledA[1], // Control Point 1
                    scaledB[0], scaledB[1], // Control Point 2
                    scaledC[0], scaledC[1]  // End Point
                )
                i += 6
                break

            // Elliptical Arc commands (a, e): center and radii are scaled
            case 'a':
            case 'e':
                const centerX = pathObject.path[i]
                const centerY = pathObject.path[i + 1]
                const radiusX = pathObject.path[i + 2]
                const radiusY = pathObject.path[i + 3]

                newPath.push(
                    centerX * scaleX,         // Scaled Center X
                    centerY * scaleY,         // Scaled Center Y
                    radiusX * scaleX,         // Scaled Radius X
                    radiusY * scaleY,         // Scaled Radius Y
                    pathObject.path[i + 4],   // Start Angle (Angles are invariant to uniform scaling)
                    pathObject.path[i + 5],   // End Angle
                    ...(command === 'e' ? [pathObject.path[i + 6]] : []) // flags
                )
                i += command === 'a' ? 6 : 7
                break

            // Non-coordinate commands (n, r, s): push the value(s) as is
            case 'n':
            case 'r':
            case 's':
                const numArgs = command === 'n' || command === 'r' ? 1 : command === 's' ? 2 : 0
                for (let k = 0; k < numArgs; k++) {
                    newPath.push(pathObject.path[i + k])
                }
                i += numArgs
                break

            default:
                break
        }
    }
    return { path: newPath, fn: pathObject.fn }
}





/**
 * Scales a path data object to a specific dimension.
 * @param {object} config - The target dimensions. Can include x or y.
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object scaled to the target dimensions.
 */
function scaleToPath(config = {}, pathObject) {
    const bbox = boundingBoxPath(pathObject)
    const currentWidth = bbox.maxX - bbox.minX
    const currentHeight = bbox.maxY - bbox.minY

    let scaleFactor = 1
    if (config.x !== undefined && currentWidth > 0) {
        scaleFactor = config.x / currentWidth
    } else if (config.y !== undefined && currentHeight > 0) {
        scaleFactor = config.y / currentHeight
    }

    return scalePath([scaleFactor, scaleFactor], pathObject)
}

/**
 * Scales a path data object by adding a dimension to its bounding box.
 * @param {object} config - The dimensions to add. Can include x or y.
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object scaled by the added dimensions.
 */
function scaleAddPath(config = {}, pathObject) {
    const bbox = boundingBoxPath(pathObject)
    const currentWidth = bbox.maxX - bbox.minX
    const currentHeight = bbox.maxY - bbox.minY

    let scaleX = 1
    let scaleY = 1

    if (config.x !== undefined && currentWidth > 0) {
        scaleX = (currentWidth + config.x) / currentWidth
    }

    if (config.y !== undefined && currentHeight > 0) {
        scaleY = (currentHeight + config.y) / currentHeight
    }

    return scalePath([scaleX, scaleY], pathObject)
}

/**
 * Aligns a path data object based on its bounding box.
 * @param {object} config - An object with alignment properties (e.g., {bx: 10, cy: 0}).
 * @param {object} pathObject - An object with {path: Array, fn: number}.
 * @returns {object} A new path data object that is aligned.
 */
function alignPath(config = {}, pathObject) {
    const bbox = boundingBoxPath(pathObject)
    const currentCx = (bbox.minX + bbox.maxX) / 2
    const currentCy = (bbox.minY + bbox.maxY) / 2

    let offsetX = 0
    let offsetY = 0

    // Determine the X offset using bx, tx, or cx
    if (config.bx !== undefined) {
        offsetX = config.bx - bbox.minX
    } else if (config.tx !== undefined) {
        offsetX = config.tx - bbox.maxX
    } else if (config.cx !== undefined) {
        offsetX = config.cx - currentCx
    }

    // Determine the Y offset using by, ty, or cy
    if (config.by !== undefined) {
        offsetY = config.by - bbox.minY
    } else if (config.ty !== undefined) {
        offsetY = config.ty - bbox.maxY
    } else if (config.cy !== undefined) {
        offsetY = config.cy - currentCy
    }

    return translatePath([offsetX, offsetY], pathObject)
}

/**
 * Creates a THREE.Shape from a custom SVG-like path data format.
 * @param {object} shapeData - The data object containing path and fn.
 * @returns {Array<THREE.Shape>} An array of constructed Three.js shape objects.
 */
function shape(shapeDataPath) {
    var shapeData = path2d(shapeDataPath)
    //console.log("here:"+JSON.stringify(shapeData));
    const rawPath = shapeData.path
    const allPaths = []

    // Get fn from input data
    const fnValue = shapeData.fn || 30 // Use provided fn, or default to 30

    function getBoundingBox(path) {
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity
        let i = 0
        let currentX = 0,
            currentY = 0

        while (i < path.length) {
            const command = path[i]
            i++

            switch (command) {
                case 'm':
                case 'l':
                    currentX = path[i]
                    currentY = path[i + 1]
                    minX = Math.min(minX, currentX)
                    minY = Math.min(minY, currentY)
                    maxX = Math.max(maxX, currentX)
                    maxY = Math.max(maxY, currentY)
                    i += 2
                    break
                case 'q':
                    currentX = path[i + 2]
                    currentY = path[i + 3]
                    minX = Math.min(minX, currentX)
                    minY = Math.min(minY, currentY)
                    maxX = Math.max(maxX, currentX)
                    maxY = Math.max(maxY, currentY)
                    i += 4
                    break
                case 'c':
                    currentX = path[i + 4]
                    currentY = path[i + 5]
                    minX = Math.min(minX, currentX)
                    minY = Math.min(minY, currentY)
                    maxX = Math.max(maxX, currentX)
                    maxY = Math.max(maxY, currentY)
                    i += 6
                    break
                case 'a':
                case 'e':
                    currentX = path[i]
                    currentY = path[i + 1]
                    if (command === 'a') i += 6
                    else i += 7
                    break
            }
        }
        return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) }
    }

    function isInside(boxA, boxB) {
        const epsilon = 1e-6
        return (
            boxA.minX >= boxB.minX - epsilon &&
            boxA.maxX <= boxB.maxX + epsilon &&
            boxA.minY >= boxB.minY - epsilon &&
            boxA.maxY <= boxB.maxY + epsilon
        )
    }

    function getTestPoint(path) {
        let i = 0
        while (i < path.length) {
            const command = path[i]
            if (command === 'm' || command === 'l') {
                return { x: path[i + 1], y: path[i + 2] }
            }
            i++
        }
        return { x: 0, y: 0 }
    }

    /**
     * Helper function to get a series of points along a curve.
     * This is a simplified flattening method.
     */
    function getCurvePoints(command, currentX, currentY, pathArray, i) {
        const points = []
        const numSegments = 30 // Adjust for desired accuracy

        switch (command) {
            case 'q':
                const cpX_q = pathArray[i]
                const cpY_q = pathArray[i + 1]
                const endX_q = pathArray[i + 2]
                const endY_q = pathArray[i + 3]

                for (let t = 0; t <= 1; t += 1 / numSegments) {
                    const x =
                        (1 - t) ** 2 * currentX +
                        2 * (1 - t) * t * cpX_q +
                        t ** 2 * endX_q
                    const y =
                        (1 - t) ** 2 * currentY +
                        2 * (1 - t) * t * cpY_q +
                        t ** 2 * endY_q
                    points.push({ x, y })
                }
                break
            case 'c':
                const cp1X = pathArray[i]
                const cp1Y = pathArray[i + 1]
                const cp2X = pathArray[i + 2]
                const cp2Y = pathArray[i + 3]
                const endX_c = pathArray[i + 4]
                const endY_c = pathArray[i + 5]

                for (let t = 0; t <= 1; t += 1 / numSegments) {
                    const x =
                        (1 - t) ** 3 * currentX +
                        3 * (1 - t) ** 2 * t * cp1X +
                        3 * (1 - t) * t ** 2 * cp2X +
                        t ** 3 * endX_c
                    const y =
                        (1 - t) ** 3 * currentY +
                        3 * (1 - t) ** 2 * t * cp1Y +
                        3 * (1 - t) * t ** 2 * cp2Y +
                        t ** 3 * endY_c
                    points.push({ x, y })
                }
                break
            case 'a': // Arc approximation
            case 'e': // Ellipse approximation
                const centerX = pathArray[i]
                const centerY = pathArray[i + 1]
                const radiusX = pathArray[i + 2]
                const radiusY = pathArray[i + 3]
                const startAngle = pathArray[i + 4]
                const endAngle = pathArray[i + 5]
                const clockwise =
                    command === 'a' ? pathArray[i + 5] : pathArray[i + 6]

                const angleDiff = endAngle - startAngle
                const angleStep =
                    ((clockwise ? -1 : 1) * angleDiff) / numSegments

                for (let j = 0; j <= numSegments; j++) {
                    const angle = startAngle + j * angleStep
                    const x = centerX + radiusX * Math.cos(angle)
                    const y = centerY + radiusY * Math.sin(angle)
                    points.push({ x, y })
                }
                break
        }
        return points
    }

    function scanlineIsInside(point, testPath) {
        if (!testPath || testPath.length === 0) {
            return false
        }

        let intersections = 0
        let i = 0
        let currentX = 0,
            currentY = 0

        while (i < testPath.length) {
            const command = testPath[i]
            i++

            if (command === 'm') {
                currentX = testPath[i]
                currentY = testPath[i + 1]
                i += 2
            } else if (command === 'l') {
                const nextX = testPath[i]
                const nextY = testPath[i + 1]

                if (
                    ((currentY <= point.y && nextY > point.y) ||
                        (currentY > point.y && nextY <= point.y)) &&
                    point.x <
                        ((nextX - currentX) * (point.y - currentY)) /
                            (nextY - currentY) +
                            currentX
                ) {
                    intersections++
                }

                currentX = nextX
                currentY = nextY
                i += 2
            } else if (
                command === 'q' ||
                command === 'c' ||
                command === 'a' ||
                command === 'e'
            ) {
                const curvePoints = getCurvePoints(
                    command,
                    currentX,
                    currentY,
                    testPath,
                    i
                )

                for (let j = 0; j < curvePoints.length - 1; j++) {
                    const p1 = curvePoints[j]
                    const p2 = curvePoints[j + 1]

                    if (
                        ((p1.y <= point.y && p2.y > point.y) ||
                            (p1.y > point.y && p2.y <= point.y)) &&
                        point.x <
                            ((p2.x - p1.x) * (point.y - p1.y)) / (p2.y - p1.y) +
                                p1.x
                    ) {
                        intersections++
                    }
                }

                currentX = curvePoints[curvePoints.length - 1].x
                currentY = curvePoints[curvePoints.length - 1].y
                i +=
                    command === 'q'
                        ? 4
                        : command === 'c'
                        ? 6
                        : command === 'a'
                        ? 6
                        : 7
            }
        }
        return intersections % 2 === 1
    }

    function parseCommands(pathArray, threeObject) {
        let i = 0
        while (i < pathArray.length) {
            const command = pathArray[i]
            i++

            switch (command) {
                case 'm':
                    threeObject.moveTo(pathArray[i + 1], -pathArray[i])
                    i += 2
                    break
                case 'l':
                    threeObject.lineTo(pathArray[i + 1], -pathArray[i])
                    i += 2
                    break
                case 'q':
                    threeObject.quadraticCurveTo(
                        pathArray[i + 1],
                        -pathArray[i],
                        pathArray[i + 3],
                        -pathArray[i + 2]
                    )
                    i += 4
                    break
                case 'c':
                    threeObject.bezierCurveTo(
                        pathArray[i + 1],
                        -pathArray[i],
                        pathArray[i + 3],
                        -pathArray[i + 2],
                        pathArray[i + 5],
                        -pathArray[i + 4]
                    )
                    i += 6
                    break
                case 'a':
                    threeObject.absarc(
                        pathArray[i + 1],
                        -pathArray[i],
                        pathArray[i + 2],
                        pathArray[i + 3],
                        pathArray[i + 4],
                        pathArray[i + 5]
                    )
                    i += 6
                    break
                case 'e':
                    threeObject.absellipse(
                        pathArray[i + 1],
                        -pathArray[i],
                        pathArray[i + 3],
                        pathArray[i + 2],
                        pathArray[i + 4],
                        pathArray[i + 5],
                        pathArray[i + 6]
                    )
                    i += 7
                    break
            }
        }
    }

    // Step 1: Deconstruct raw path into individual sub-paths and get bounding boxes.
    let currentPath = []
    for (let i = 0; i < rawPath.length; ) {
        const command = rawPath[i]
        if (command === 'm' && currentPath.length > 0) {
            allPaths.push({
                path: currentPath,
                box: getBoundingBox(currentPath),
                children: []
            })
            currentPath = []
        }
        let commandLength = 0
        switch (command) {
            case 'm':
            case 'l':
                commandLength = 3
                break
            case 'q':
                commandLength = 5
                break
            case 'c':
                commandLength = 7
                break
            case 'a':
                commandLength = 7
                break
            case 'e':
                commandLength = 8
                break
            default:
                commandLength = 1
        }
        for (let j = 0; j < commandLength && i < rawPath.length; j++) {
            currentPath.push(rawPath[i])
            i++
        }
    }
    if (currentPath.length > 0) {
        allPaths.push({
            path: currentPath,
            box: getBoundingBox(currentPath),
            children: []
        })
    }

    // Step 2: Build parent-child hierarchy using bounding box containment.
    const hierarchy = []
    allPaths.sort((a, b) => a.box.area - b.box.area)

    // New Step 1.5: Remove duplicate paths
    const uniquePaths = []
    const pathStrings = new Set()

    allPaths.forEach((pathObj) => {
        const pathStr = JSON.stringify(pathObj.path)
        if (!pathStrings.has(pathStr)) {
            uniquePaths.push(pathObj)
            pathStrings.add(pathStr)
        }
    })

    for (let i = 0; i < uniquePaths.length; i++) {
        const childPath = uniquePaths[i]
        let parent = null
        for (let j = i + 1; j < uniquePaths.length; j++) {
            const potentialParent = uniquePaths[j]
            if (isInside(childPath.box, potentialParent.box)) {
                parent = potentialParent
                break
            }
        }
        if (parent) {
            parent.children.push(childPath)
        } else {
            hierarchy.push(childPath)
        }
    }

    // Step 3: Classify paths and build THREE.Shapes using recursion.
    const finalShapes = []

    /**
     * @param {object} pathObj - The current path object from the hierarchy.
     * @param {THREE.Shape} parentThreeShape - The THREE.Shape object of the immediate solid parent.
     * @param {boolean} isParentHole - True if the immediate parent path is a hole.
     */
    function processPath(pathObj, parentThreeShape, isParentHole) {
        const testPoint = getTestPoint(pathObj.path)
        const isInsideImmediateParent = scanlineIsInside(
            testPoint,
            pathObj.parent ? pathObj.parent.path : null
        )

        // The classification flips based on whether the parent is a hole.
        const isHole = isInsideImmediateParent !== isParentHole

        if (isHole) {
            // This path is a hole, so add it to the parent's holes array.
            const holePath = new THREE.Path()
            parseCommands(pathObj.path, holePath)
            parentThreeShape.holes.push(holePath)

            // Pass the flipped status to children.
            pathObj.children.forEach((child) => {
                child.parent = pathObj
                processPath(child, parentThreeShape, true)
            })
        } else {
            // This path is a solid shape. Create a new THREE.Shape object.
            const solidShape = new THREE.Shape()
            parseCommands(pathObj.path, solidShape)
            solidShape.userData = { fn: fnValue }
            finalShapes.push(solidShape)

            // Children of this solid shape are now potentially holes.
            pathObj.children.forEach((child) => {
                child.parent = pathObj
                processPath(child, solidShape, false)
            })
        }
    }

    // Start processing from the top-level shapes.
    hierarchy.forEach((mainPathObj) => {
        // Top-level shapes are always solid.
        const topLevelShape = new THREE.Shape()
        parseCommands(mainPathObj.path, topLevelShape)
        topLevelShape.userData = { fn: fnValue }
        finalShapes.push(topLevelShape)

        // Process children of this top-level solid shape.
        mainPathObj.children.forEach((child) => {
            child.parent = mainPathObj
            // The top-level parent is not a hole, so pass false.
            processPath(child, topLevelShape, false)
        })
    })

    return finalShapes
}

/**
 * Fetches and loads a font file using opentype.js.
 * @param {string} fontPath - The path to the font file.
 * @returns {Promise<opentype.Font>} A promise that resolves to the loaded font object.
 */
async function font(fontPath) {
    try {
        const buffer = await api.readFileBinary($path(fontPath))
        const font = opentype.parse(buffer)
        PrintLog(`Successfully loaded font from ${fontPath}`)
        return font
    } catch (error) {
        PrintError('Font loading error:', error)
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
    let xOffset = 0
    const allCommands = []
    if (textData.fontSize == undefined) {
        textData.fontSize = 3
    }

    // Helper function to convert opentype.js commands to the custom format
    function convertPathToCustomFormat(pathCommands) {
        const customFormatPath = []
        for (const cmd of pathCommands) {
            switch (cmd.type) {
                case 'M':
                    customFormatPath.push('m', cmd.x, -cmd.y)
                    break
                case 'L':
                    customFormatPath.push('l', cmd.x, -cmd.y)
                    break
                case 'Q':
                    customFormatPath.push('q', cmd.x1, -cmd.y1, cmd.x, -cmd.y)
                    break
                case 'C':
                    customFormatPath.push(
                        'c',
                        cmd.x1,
                        -cmd.y1,
                        cmd.x2,
                        -cmd.y2,
                        cmd.x,
                        -cmd.y
                    )
                    break
                // 'Z' commands are implicitly handled by the next 'M'
            }
        }
        return customFormatPath
    }

    const glyphs = textData.font.stringToGlyphs(textData.text)

    for (const glyph of glyphs) {
        const opentypePath = glyph.getPath(xOffset, 0, textData.fontSize)
        const commands = opentypePath.commands
        let currentPathCommands = []

        for (let i = 0; i < commands.length; i++) {
            const command = commands[i]
            if (command.type === 'M' && currentPathCommands.length > 0) {
                allCommands.push(
                    ...convertPathToCustomFormat(currentPathCommands)
                )
                currentPathCommands = [command]
            } else {
                currentPathCommands.push(command)
            }
        }
        if (currentPathCommands.length > 0) {
            allCommands.push(...convertPathToCustomFormat(currentPathCommands))
        }

        xOffset +=
            glyph.advanceWidth * (textData.fontSize / textData.font.unitsPerEm)
    }

    return { path: allCommands, fn: textData.fn || 40 } // Include fn here for consistency
}
//*/

// A new ASCII STL parser that ignores normals and just gets vertices
function parseAsciiStl(text) {
    const vertices = []
    const lines = text.split('\n')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('vertex')) {
            const parts = line.split(/\s+/)
            vertices.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            )
        }
    }

    if (vertices.length === 0) {
        throw new Error('No vertices found in the ASCII STL file.')
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))

    // Recalculate normals to ensure they're consistent and correct for the geometry
    geometry.computeVertexNormals()

    // Generate and add UV data
    generateUVs(geometry)

    return geometry
}

// A new binary STL parser that ignores normals and just gets vertices
function parseBinaryStl(buffer) {
    const dataView = new DataView(buffer)
    let offset = 80

    const triangleCount = dataView.getUint32(offset, true)
    offset += 4

    const vertices = new Float32Array(triangleCount * 3 * 3)
    let vertexIndex = 0

    for (let i = 0; i < triangleCount; i++) {
        offset += 12 // Skip the 12-byte normal vector

        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4

        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4

        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4
        vertices[vertexIndex++] = dataView.getFloat32(offset, true)
        offset += 4

        offset += 2 // Skip the 2-byte attribute byte count
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))

    // Recalculate normals
    geometry.computeVertexNormals()

    // Generate and add UV data
    generateUVs(geometry)

    return geometry
}

// Function to generate a simple planar UV map
function generateUVs(geometry) {
    const positions = geometry.attributes.position.array
    const uvArray = new Float32Array((positions.length / 3) * 2)
    const box = new THREE.Box3().setFromBufferAttribute(
        geometry.attributes.position
    )
    const size = box.getSize(new THREE.Vector3())

    // A simple planar projection based on the bounding box
    for (let i = 0; i < positions.length / 3; i++) {
        const x = positions[i * 3]
        const y = positions[i * 3 + 1]
        const z = positions[i * 3 + 2]

        uvArray[i * 2] = (x - box.min.x) / size.x
        uvArray[i * 2 + 1] = (y - box.min.y) / size.y
    }

    geometry.setAttribute('uv', new Float32BufferAttribute(uvArray, 2))
}

/**
 * Imports an STL file (binary or ASCII) and returns a three-bvh-csg Brush.
 * @param {string} filePath - The path to the STL file.
 * @returns {Promise<Brush>} A Promise resolving to a Brush object.
 */
async function importStl(filePath) {
    try {
        const buffer = await api.readFileBinary($path(filePath))

        const header = new TextDecoder().decode(buffer.slice(0, 5))
        let geometry

        if (header.toLowerCase() === 'solid') {
            const text = new TextDecoder().decode(buffer)
            geometry = parseAsciiStl(text)
        } else {
            geometry = parseBinaryStl(buffer)
        }

        if (!geometry.attributes.position || !geometry.attributes.uv) {
            throw new Error(
                'Parsed geometry is missing required attributes (position or uv).'
            )
        }

        //const brush = new Brush(geometry);
        //return brush;
        return new THREE.Mesh(geometry, defaultMaterial.clone())
    } catch (error) {
        PrintError('STL loading error:', error)
        throw error
    }
}

/**
 * Loads a GLB file and returns an array of three-bvh-csg Brush objects.
 * It removes all textures and applies a clone of the default material.
 * @param {string} filePath - The path to the GLB file.
 * @param {THREE.Material} defaultMaterial - The default material to apply to all meshes.
 * @returns {Promise<Brush[]>} A promise that resolves to an array of Brush objects.
 */
async function importGlb(filePath) {
    try {
        const buffer = await api.readFileBinary($path(filePath))
        const loader = new GLTFLoader()

        // Wrap the callback-based loader.parse in a Promise
        const gltf = await new Promise((resolve, reject) => {
            loader.parse(buffer, '', resolve, reject)
        })

        PrintLog(`Successfully loaded GLB from ${filePath}`)

        const brushes = []
        // Traverse the loaded scene to find all meshes
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                const geometry = child.geometry

                // Ensure the geometry has all the attributes required by three-bvh-csg
                if (
                    !geometry.attributes.position ||
                    !geometry.attributes.normal ||
                    !geometry.attributes.uv
                ) {
                    PrintWarn(
                        `Mesh in GLB file is missing required attributes. Attempting to generate them.`
                    )

                    // Recalculate normals if they're missing
                    if (!geometry.attributes.normal) {
                        geometry.computeVertexNormals()
                    }

                    // Generate simple planar UVs if they're missing
                    if (!geometry.attributes.uv) {
                        generateUVs(geometry)
                    }
                }
                //console.log('here: ' + defaultMaterial)

                // Create a new Brush object from the mesh's geometry and a cloned default material
                const brush = new Brush(geometry, defaultMaterial.clone())

                // Copy the mesh's original transform (position, rotation, scale) to the brush
                brush.position.copy(child.position)
                brush.quaternion.copy(child.quaternion)
                brush.scale.copy(child.scale)

                brushes.push(brush)
            }
        })

        if (brushes.length === 0) {
            throw new Error('No meshes found in the GLB file.')
        }

        return brushes
    } catch (error) {
        PrintError('GLB loading error:', error)
        throw error
    }
}

async function importObj(filePath) {
    try {
        const text = await api.readFileBinary($path(filePath))
        const loader = new OBJLoader()
        const object = loader.parse(new TextDecoder().decode(text))

        const brushes = []
        object.traverse((child) => {
            if (child.isMesh) {
                const geometry = child.geometry
                if (
                    !geometry.attributes.position ||
                    !geometry.attributes.normal ||
                    !geometry.attributes.uv
                ) {
                    geometry.computeVertexNormals()
                    if (!geometry.attributes.uv) {
                        generateUVs(geometry)
                    }
                }
                const brush = new Brush(child.geometry, child.material)
                brush.position.copy(child.position)
                brush.quaternion.copy(child.quaternion)
                brush.scale.copy(child.scale)
                brushes.push(brush)
            }
        })

        if (brushes.length === 0) {
            throw new Error('No meshes found in the OBJ file.')
        }

        return brushes
    } catch (error) {
        PrintError('OBJ loading error:', error)
        throw error
    }
}

async function importFbx(filePath) {
    try {
        const buffer = await api.readFileBinary($path(filePath))
        const loader = new FBXLoader()
        const object = loader.parse(buffer, '')

        const brushes = []
        object.traverse((child) => {
            if (child.isMesh) {
                const geometry = child.geometry
                if (
                    !geometry.attributes.position ||
                    !geometry.attributes.normal ||
                    !geometry.attributes.uv
                ) {
                    geometry.computeVertexNormals()
                    if (!geometry.attributes.uv) {
                        generateUVs(geometry)
                    }
                }
                const brush = new Brush(child.geometry, child.material)
                brush.position.copy(child.position)
                brush.quaternion.copy(child.quaternion)
                brush.scale.copy(child.scale)
                brushes.push(brush)
            }
        })

        if (brushes.length === 0) {
            throw new Error('No meshes found in the FBX file.')
        }

        return brushes
    } catch (error) {
        PrintError('FBX loading error:', error)
        throw error
    }
}

//*/

/**
 * Recursively deep clones a THREE.js object, THREE.Shape, three-bvh-csg Brush,
 * or an array/object containing them.
 *
 * It ensures a "true clone" for THREE.Mesh by also cloning its geometry
 * to guarantee independence of geometry (including normals) and materials.
 *
 * @param {THREE.Mesh | THREE.Shape | Brush | Array | Object} source - The object to clone.
 * @returns {THREE.Mesh | THREE.Shape | Brush | Array | Object} The cloned object.
 */
export function clone(source) {
    // 1. Handle primitives (base case for recursion)
    if (source === null || typeof source !== 'object') {
        return source
    }

    const typeName = source.constructor.name

    // 2. Handle Arrays
    if (Array.isArray(source)) {
        const clonedArray = []
        for (let i = 0; i < source.length; i++) {
            clonedArray[i] = clone(source[i])
        }
        return clonedArray
    }

    // 3. Handle specific THREE.js objects and Brush (objects with a .clone() method)
    if (
        typeName === 'Mesh' ||
        typeName === 'Shape' ||
        typeName === 'Brush' ||
        typeName === 'Group' ||
        typeName === 'Object3D'
    ) {
        // Use the built-in clone() method first.
        const clonedObject = source.clone()

        // 💡 CRITICAL ADDITION for "true clone": Deeply clone geometry for THREE.Mesh.
        // This ensures the cloned object has its own, independent geometry and normals.
        // It relies on BufferGeometry having a .clone() method.
        if (typeName === 'Mesh' && clonedObject.geometry) {
            // Check if the geometry itself has a .clone method (e.g., BufferGeometry)
            if (typeof clonedObject.geometry.clone === 'function') {
                clonedObject.geometry = clonedObject.geometry.clone()
            } else {
                console.warn(
                    `clone: Mesh geometry of type ${clonedObject.geometry.constructor.name} does not have a .clone() method. Geometry is shared.`
                )
            }
        }

        // THREE.js built-in clone already deep-clones materials for Mesh.
        // The children of Groups/Object3D are also handled by the built-in clone.

        return clonedObject
    }

    // 4. Handle generic Objects ({} structures)
    if (typeName === 'Object') {
        const clonedObject = {}
        for (const key in source) {
            // Ensure we only process own properties
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                // Recursively clone the property value
                clonedObject[key] = clone(source[key])
            }
        }
        return clonedObject
    }

    // 5. Fallback for other non-clonable objects
    console.warn(
        `clone: Cannot deep clone object of type: ${typeName}. Returning original reference.`
    )
    return source
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
    inverseIntersect,
    subdivide,
    translate,
    rotate,
    scale,
    color,
    floor,
    convexHull,
    align,
    convertTo2d,
    convertTo3d,
    arcPath3d,
    linePaths3d, // this is the new linePaths3dEx
    scaleTo,
    scaleAdd,
    show,
    hide,
    boundingBox,
    placement,
    font,
    text,
    translatePath,
    rotatePath,
	boundingBoxPath,
    scalePath,
    scaleToPath,
    scaleAddPath,
    alignPath,
    shape,
    importStl,
    importGlb,
    importObj,
    importFbx,
    clone
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
