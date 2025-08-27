

/*
./js/scadCSG.js
code runs in a browser
*/
import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';


globalThis.inch=25.4;

// === CSG Evaluator ===
const csgEvaluator = new Evaluator();
csgEvaluator.useGroups = true;

const defaultMaterial = new THREE.MeshStandardMaterial({
    color: 0xffcc00,
    metalness: 0.2,
    roughness: 0.6,
    side: THREE.DoubleSide,
    flatShading: true
});

// --- Functional Primitives & Operations ---
function color(c, ...meshes) {
  const colorVal = new THREE.Color(c);
  const newMeshes = [];
  const applyColor = (mesh) => {
    if (mesh instanceof Brush) {
      const newMaterial = new THREE.MeshStandardMaterial({
        color: colorVal,
        metalness: 0.2,
        roughness: 0.6,
        side: THREE.DoubleSide,
        flatShading: true
      });
      mesh.material = newMaterial;
      newMeshes.push(mesh);
    } else if (mesh && mesh.isMesh) {
      const newMaterial = new THREE.MeshStandardMaterial({
        color: colorVal,
        metalness: 0.2,
        roughness: 0.6,
        side: THREE.DoubleSide,
        flatShading: true
      });
      mesh.material = newMaterial;
      newMeshes.push(mesh);
    } else if (Array.isArray(mesh)) {
      mesh.forEach(applyColor);
    }
  };
  meshes.forEach(applyColor);
  return newMeshes.length === 1 ? newMeshes[0] : newMeshes;
}

// --- Primitive Geometries (Corrected) ---
function sphere({ r, d, fn } = {}) {
  if (d !== undefined) r = d / 2;
  r = r || 1;
  fn = fn || 32;
  const geom = new THREE.SphereGeometry(r, fn, fn);
  return new THREE.Mesh(geom, defaultMaterial.clone());
}

function cube([x = 1, y = 1, z = 1] = [1, 1, 1]) {
  const geom = new THREE.BoxGeometry(x, z, y);
  return new THREE.Mesh(geom, defaultMaterial.clone());
}

function cylinder({ d, dt, db, r, rt, rb, h, fn } = {}) {
    let topRadius, bottomRadius;

    if (rt !== undefined) {
        topRadius = rt;
    }
    if (rb !== undefined) {
        bottomRadius = rb;
    }

    if (topRadius === undefined && dt !== undefined) {
        topRadius = dt / 2;
    }
    if (bottomRadius === undefined && db !== undefined) {
        bottomRadius = db / 2;
    }

    if (topRadius === undefined && bottomRadius === undefined && r !== undefined) {
        topRadius = r;
        bottomRadius = r;
    }

    if (topRadius === undefined && bottomRadius === undefined && d !== undefined) {
        topRadius = d / 2;
        bottomRadius = d / 2;
    }
    
    topRadius = topRadius || 0.5;
    bottomRadius = bottomRadius || 0.5;
    h = h || 1;
    fn = fn || 32;

    const geom = new THREE.CylinderGeometry(topRadius, bottomRadius, h, fn);
    return new THREE.Mesh(geom, defaultMaterial.clone());
}

// --- Functional Transforms (Corrected for Z-up) ---
function translate([x, y, z], mesh) {
  if (Array.isArray(x)) {
    console.warn("Translate now takes a single mesh. Please use: translate([x,y,z], mesh)");
    return x.map(m => translate([x, y, z], m));
  }
  // Swapping y and z to match Z-up convention
  mesh.position.set(x, z, y);
  return mesh;
}

function rotate([x, y, z], mesh) {
  if (Array.isArray(x)) {
    console.warn("Rotate now takes a single mesh. Please use: rotate([x,y,z], mesh)");
    return x.map(m => rotate([x, y, z], m));
  }
  // Swapping y and z to match Z-up convention
  mesh.rotation.set(x, z, y);
  return mesh;
}

function scale([x, y, z], mesh) {
  if (Array.isArray(x)) {
    console.warn("Scale now takes a single mesh. Please use: scale([x,y,z], mesh)");
    return x.map(m => scale([x, y, z], m));
  }
  // Swapping y and z to match Z-up convention
  mesh.scale.set(x, z, y);
  return mesh;
}

function floor(mesh) {
    if (!mesh || !mesh.geometry) {
        console.warn("Floor function requires a valid mesh.");
        return mesh;
    }

    mesh.geometry.computeBoundingBox();
    const yMin = mesh.geometry.boundingBox.min.y;
    mesh.position.y += -yMin;

    return mesh;
}

function convexHull(...meshes) {
    if (meshes.length === 0) {
        return null;
    }

    const vertices = [];
    meshes.forEach(mesh => {
        if (mesh && mesh.geometry && mesh.geometry.isBufferGeometry) {
            mesh.updateMatrixWorld(true);
            const positionAttribute = mesh.geometry.getAttribute('position');
            const tempVector = new THREE.Vector3();
            for (let i = 0; i < positionAttribute.count; i++) {
                tempVector.fromBufferAttribute(positionAttribute, i).applyMatrix4(mesh.matrixWorld);
                vertices.push(tempVector.clone());
            }
        }
    });

    if (vertices.length < 4) {
        console.warn("Convex hull requires at least 4 vertices. Returning null.");
        return null;
    }

    const hullGeometry = new ConvexGeometry(vertices);
    return new THREE.Mesh(hullGeometry, defaultMaterial.clone());
}

function align(config = {}, ...meshes) {
    const newMeshes = [];

    const alignMesh = (mesh) => {
        if (!mesh || !mesh.geometry) {
            console.warn("Align function requires a valid mesh.");
            return;
        }

        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        const offset = new THREE.Vector3();

        if (config.bx !== undefined) {
            offset.x = config.bx - bbox.min.x;
        } else if (config.tx !== undefined) {
            offset.x = config.tx - bbox.max.x;
        } else if (config.cx !== undefined) {
            offset.x = config.cx - center.x;
        }

        if (config.by !== undefined) {
            offset.z = config.by - bbox.min.z;
        } else if (config.ty !== undefined) {
            offset.z = config.ty - bbox.max.z;
        } else if (config.cy !== undefined) {
            offset.z = config.cy - center.z;
        }

        if (config.bz !== undefined) {
            offset.y = config.bz - bbox.min.y;
        } else if (config.tz !== undefined) {
            offset.y = config.tz - bbox.max.y;
        } else if (config.cz !== undefined) {
            offset.y = config.cz - center.y;
        }

        mesh.position.add(offset);
        newMeshes.push(mesh);
    };

    meshes.forEach(alignMesh);
    return newMeshes.length === 1 ? newMeshes[0] : newMeshes;
}

function line3d(points2d, start, end, fn = 12) {
    if (!points2d || points2d.length < 3) {
        console.warn("line3d requires at least 3 points to form a closed shape.");
        return null;
    }

    const shape = new THREE.Shape();
    shape.moveTo(points2d[0][0], points2d[0][1]);
    for (let i = 1; i < points2d.length; i++) {
        shape.lineTo(points2d[i][0], points2d[i][1]);
    }

    const extrudePath = new THREE.LineCurve3(
        new THREE.Vector3(start[0], start[1], start[2]),
        new THREE.Vector3(end[0], end[1], end[2])
    );

    const extrudeSettings = {
        steps: 1,
        bevelEnabled: false,
        extrudePath: extrudePath
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    return new THREE.Mesh(geom, defaultMaterial.clone());
}

function linePaths3d(points2d, points3d, fn = 12) {
    if (!points2d || points2d.length < 3) {
        console.warn("linePaths3d requires at least 3 points to form a closed 2D shape.");
        return null;
    }
    if (!points3d || points3d.length < 2) {
        console.warn("linePaths3d requires at least 2 points for the 3D extrusion path.");
        return null;
    }

    const shape = new THREE.Shape();
    shape.moveTo(points2d[0][0], points2d[0][1]);
    for (let i = 1; i < points2d.length; i++) {
        shape.lineTo(points2d[i][0], points2d[i][1]);
    }

    const extrudePath = new THREE.CurvePath();
    for (let i = 0; i < points3d.length - 1; i++) {
        const startPoint = points3d[i];
        const endPoint = points3d[i + 1];

        const startVector = new THREE.Vector3(startPoint[0], startPoint[1], startPoint[2]);
        const endVector = new THREE.Vector3(endPoint[0], endPoint[1], endPoint[2]);

        extrudePath.add(new THREE.LineCurve3(startVector, endVector));
    }

    const extrudeSettings = {
        steps: points3d.length - 1,
        bevelEnabled: false,
        extrudePath: extrudePath
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    return new THREE.Mesh(geom, defaultMaterial.clone());
}

// === Multi-Argument CSG Operations (Corrected) ===
function union(...meshes) {
  if (meshes.length === 0) return null;
  if (meshes.length === 1) return meshes[0];
  const brushA = new Brush(meshes[0].geometry, meshes[0].material);
  brushA.position.copy(meshes[0].position);
  brushA.rotation.copy(meshes[0].rotation);
  brushA.scale.copy(meshes[0].scale);
  brushA.updateMatrixWorld(true);

  let result = brushA;
  for (let i = 1; i < meshes.length; i++) {
    const mesh = meshes[i];
    const brushB = new Brush(mesh.geometry, mesh.material);
    brushB.position.copy(mesh.position);
    brushB.rotation.copy(mesh.rotation);
    brushB.scale.copy(mesh.scale);
    brushB.updateMatrixWorld(true);
    result = csgEvaluator.evaluate(result, brushB, ADDITION);
  }
  return result;
}

function difference(mainMesh, ...subMeshes) {
  if (!mainMesh || subMeshes.length === 0) throw new Error('Difference: need base and one or more subtrahends');
  const brushA = new Brush(mainMesh.geometry, mainMesh.material);
  brushA.position.copy(mainMesh.position);
  brushA.rotation.copy(mainMesh.rotation);
  brushA.scale.copy(mainMesh.scale);
  brushA.updateMatrixWorld(true);

  let result = brushA;
  for (const sub of subMeshes) {
    const brushB = new Brush(sub.geometry, sub.material);
    brushB.position.copy(sub.position);
    brushB.rotation.copy(sub.rotation);
    brushB.scale.copy(sub.scale);
    brushB.updateMatrixWorld(true);
    result = csgEvaluator.evaluate(result, brushB, SUBTRACTION);
  }
  return result;
}

function intersect(...meshes) {
  if (meshes.length < 2) throw new Error('Intersect requires at least 2 meshes');
  const brushA = new Brush(meshes[0].geometry, meshes[0].material);
  brushA.position.copy(meshes[0].position);
  brushA.rotation.copy(meshes[0].rotation);
  brushA.scale.copy(meshes[0].scale);
  brushA.updateMatrixWorld(true);

  let result = brushA;
  for (let i = 1; i < meshes.length; i++) {
    const mesh = meshes[i];
    const brushB = new Brush(mesh.geometry, mesh.material);
    brushB.position.copy(mesh.position);
    brushB.rotation.copy(mesh.rotation);
    brushB.scale.copy(mesh.scale);
    brushB.updateMatrixWorld(true);
    result = csgEvaluator.evaluate(result, brushB, INTERSECTION);
  }
  return result;
}

// --- New `scaleTo` Function ---
function scaleTo(config = {}, ...meshes) {
    const newMeshes = [];
    const scaleMesh = (mesh) => {
        if (!mesh || !mesh.geometry) {
            console.warn("scaleTo requires a valid mesh.");
            return;
        }

        // 1. Ensure the mesh's transformations are up-to-date
        mesh.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        
        // Swapping y and z for the Z-up convention
        const currentX = size.x;
        const currentY = size.z;
        const currentZ = size.y;

        const targetX = config.x;
        const targetY = config.y;
        const targetZ = config.z;

        let scaleFactorX = 1;
        let scaleFactorY = 1;
        let scaleFactorZ = 1;
        
        // Calculate scale factors for defined dimensions
        if (targetX !== undefined && currentX !== 0) {
            scaleFactorX = targetX / currentX;
        }
        if (targetY !== undefined && currentY !== 0) {
            scaleFactorY = targetY / currentY;
        }
        if (targetZ !== undefined && currentZ !== 0) {
            scaleFactorZ = targetZ / currentZ;
        }

        // Determine the base scale factor for aspect ratio
        let baseScaleFactor;
        if (targetX !== undefined) {
            baseScaleFactor = scaleFactorX;
        } else if (targetY !== undefined) {
            baseScaleFactor = scaleFactorY;
        } else if (targetZ !== undefined) {
            baseScaleFactor = scaleFactorZ;
        }

        // Apply aspect ratio to undefined dimensions
        if (targetX === undefined && baseScaleFactor !== undefined) {
            scaleFactorX = baseScaleFactor;
        }
        if (targetY === undefined && baseScaleFactor !== undefined) {
            scaleFactorY = baseScaleFactor;
        }
        if (targetZ === undefined && baseScaleFactor !== undefined) {
            scaleFactorZ = baseScaleFactor;
        }

        // Create a new, scaled geometry
        const oldGeometry = mesh.geometry;
        const scaledGeometry = oldGeometry.clone();

        // Apply the scaling directly to the geometry's vertex data
        const positionAttribute = scaledGeometry.getAttribute('position');
        const vertex = new THREE.Vector3();
        for (let i = 0; i < positionAttribute.count; i++) {
            vertex.fromBufferAttribute(positionAttribute, i);
            // Apply scale, considering Z-up
            vertex.x *= scaleFactorX;
            vertex.y *= scaleFactorZ; // Corresponds to Z-axis in world space
            vertex.z *= scaleFactorY; // Corresponds to Y-axis in world space
            positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        // Replace the old geometry and update bounding info
        scaledGeometry.computeBoundingBox();
        scaledGeometry.computeBoundingSphere();
        mesh.geometry = scaledGeometry;
        
        // Reset the mesh's local scale to [1,1,1] to avoid double-scaling
        mesh.scale.set(1, 1, 1);
        
        newMeshes.push(mesh);
    };

    meshes.forEach(scaleMesh);
    return newMeshes.length === 1 ? newMeshes[0] : newMeshes;
}

// Private object containing all exportable functions
// This is a private, self-contained list within the module.
const _exportedFunctions = {
  sphere, cube, cylinder, union, difference, intersect, 
  translate, rotate, scale, color, floor, convexHull, align, 
  line3d, linePaths3d, scaleTo
};

// --- Revised `ezport` function ---
// This function returns an object containing both the function names and the functions themselves.
function ezport() {
  const funcNames = Object.keys(_exportedFunctions);
  const funcs = Object.values(_exportedFunctions);
  return { names: funcNames, funcs: funcs };
}

// Export only the ezport function
export { ezport };



