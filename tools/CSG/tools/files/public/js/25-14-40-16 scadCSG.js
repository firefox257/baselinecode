
/*
./js/scadCSG.js
code runs in a browser
*/
import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

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
  mesh.geometry.translate(x, z, y);
  return mesh;
}

function rotate([x, y, z], mesh) {
  if (Array.isArray(x)) {
    console.warn("Rotate now takes a single mesh. Please use: rotate([x,y,z], mesh)");
    return x.map(m => rotate([x, y, z], m));
  }
  const tempQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, z, y));
  mesh.geometry.applyQuaternion(tempQuaternion);
  return mesh;
}

function scale([x, y, z], mesh) {
  if (Array.isArray(x)) {
    console.warn("Scale now takes a single mesh. Please use: scale([x,y,z], mesh)");
    return x.map(m => scale([x, y, z], m));
  }
  mesh.geometry.scale(x, y, z);
  return mesh;
}

function floor(mesh) {
    if (!mesh || !mesh.geometry) {
        console.warn("Floor function requires a valid mesh.");
        return mesh;
    }

    mesh.geometry.computeBoundingBox();
    const yMin = mesh.geometry.boundingBox.min.y;
    const translationY = -yMin;
    mesh.geometry.translate(0, translationY, 0);

    return mesh;
}

function convexHull(...meshes) {
    if (meshes.length === 0) {
        return null;
    }

    const vertices = [];
    meshes.forEach(mesh => {
        if (mesh && mesh.geometry && mesh.geometry.isBufferGeometry) {
            const positionAttribute = mesh.geometry.getAttribute('position');
            if (positionAttribute) {
                for (let i = 0; i < positionAttribute.count; i++) {
                    const x = positionAttribute.getX(i);
                    const y = positionAttribute.getY(i);
                    const z = positionAttribute.getZ(i);
                    vertices.push(new THREE.Vector3(x, y, z));
                }
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

        mesh.geometry.translate(offset.x, offset.y, offset.z);
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
        new THREE.Vector3(start[0], start[2], start[1]), 
        new THREE.Vector3(end[0], end[2], end[1])
    );

    const extrudeSettings = {
        steps: 1, 
        bevelEnabled: false,
        extrudePath: extrudePath
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    return new THREE.Mesh(geometry, defaultMaterial.clone());
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
        
        const startVector = new THREE.Vector3(startPoint[0], startPoint[2], startPoint[1]);
        const endVector = new THREE.Vector3(endPoint[0], endPoint[2], endPoint[1]);
        
        extrudePath.add(new THREE.LineCurve3(startVector, endVector));
    }

    const extrudeSettings = {
        steps: points3d.length - 1,
        bevelEnabled: false,
        extrudePath: extrudePath
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    return new THREE.Mesh(geometry, defaultMaterial.clone());
}

// === Multi-Argument CSG Operations (Corrected) ===
function union(...meshes) {
  if (meshes.length === 0) return null;
  if (meshes.length === 1) return meshes[0];
  let result = new Brush(meshes[0].geometry, meshes[0].material);
  for (let i = 1; i < meshes.length; i++) {
    const brushB = new Brush(meshes[i].geometry, meshes[i].material);
    result = csgEvaluator.evaluate(result, brushB, ADDITION);
  }
  return result;
}

function difference(mainMesh, ...subMeshes) {
  if (!mainMesh || subMeshes.length === 0) throw new Error('Difference: need base and one or more subtrahends');
  let result = new Brush(mainMesh.geometry, mainMesh.material);
  for (const sub of subMeshes) {
    const brushB = new Brush(sub.geometry, sub.material);
    result = csgEvaluator.evaluate(result, brushB, SUBTRACTION);
  }
  return result;
}

function intersect(...meshes) {
  if (meshes.length < 2) throw new Error('Intersect requires at least 2 meshes');
  let result = new Brush(meshes[0].geometry, meshes[0].material);
  for (let i = 1; i < meshes.length; i++) {
    const brushB = new Brush(meshes[i].geometry, meshes[i].material);
    result = csgEvaluator.evaluate(result, brushB, INTERSECTION);
  }
  return result;
}

// Export all functions for use in the main script
export { 
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
  linePaths3d 
};
