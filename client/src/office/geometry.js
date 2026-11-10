import * as THREE from "three";

const FLOOR_W = 48;
const FLOOR_D = 28;

function addBox(scene, size, position, color, roughness = 0.75) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness })
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addWall(scene, size, position, color = 0xd8ddd5) {
  addBox(scene, size, position, color, 0.9);
  addBox(
    scene,
    [size[0] + 0.04, 0.1, size[2] + 0.04],
    [position[0], 0.09, position[2]],
    0x657168,
    0.9
  );
}

function addDesk(scene, x, z, flip = false) {
  addBox(scene, [2.6, 0.12, 1.15], [x, 0.78, z], flip ? 0xb78456 : 0xc59867);
  addBox(scene, [0.1, 0.72, 0.1], [x - 1.05, 0.39, z - 0.4], 0x4a514d);
  addBox(scene, [0.1, 0.72, 0.1], [x + 1.05, 0.39, z - 0.4], 0x4a514d);
  addBox(scene, [0.1, 0.72, 0.1], [x - 1.05, 0.39, z + 0.4], 0x4a514d);
  addBox(scene, [0.1, 0.72, 0.1], [x + 1.05, 0.39, z + 0.4], 0x4a514d);
  addBox(scene, [0.85, 0.55, 0.08], [x, 1.22, z - 0.28], 0x26312f, 0.3);
  addBox(scene, [0.68, 0.4, 0.03], [x, 1.23, z - 0.33], 0x6fa09d, 0.25);
  addBox(scene, [0.08, 0.38, 0.08], [x, 0.98, z - 0.22], 0x323b38);
  addBox(scene, [0.62, 0.08, 0.62], [x, 0.42, z + 0.95], 0x49675d);
  addBox(scene, [0.12, 0.46, 0.12], [x, 0.2, z + 0.95], 0x39463f);
}

function addPlant(scene, x, z) {
  addBox(scene, [0.7, 0.55, 0.7], [x, 0.28, z], 0x78664f);
  const plant = new THREE.Mesh(
    new THREE.ConeGeometry(0.85, 2.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x397150 })
  );
  plant.position.set(x, 1.45, z);
  plant.castShadow = true;
  scene.add(plant);
}

export function buildOffice(scene) {
  scene.background = new THREE.Color(0xbcc9c1);
  scene.fog = new THREE.Fog(0xbcc9c1, 36, 92);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_W, FLOOR_D),
    new THREE.MeshStandardMaterial({ color: 0xe7e8df, roughness: 0.94 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(FLOOR_D, 28, 0xb4bcb5, 0xd6dad4);
  grid.scale.x = FLOOR_W / FLOOR_D;
  grid.position.y = 0.012;
  scene.add(grid);

  addWall(scene, [FLOOR_W, 0.9, 0.28], [0, 0.45, -14]);
  addWall(scene, [FLOOR_W, 0.9, 0.28], [0, 0.45, 14]);
  addWall(scene, [0.28, 0.9, FLOOR_D], [-24, 0.45, 0]);
  addWall(scene, [0.28, 0.9, FLOOR_D], [24, 0.45, 0]);

  // North rooms. Wide gaps between them are the north halls.
  addWall(scene, [0.22, 2.7, 8.2], [-16, 1.35, -9.6]);
  addWall(scene, [6.2, 2.7, 0.22], [-19.7, 1.35, -5.5]);
  addWall(scene, [2.2, 2.7, 0.22], [-15.1, 1.35, -5.5]);
  addBox(scene, [2.4, 0.22, 0.28], [-17.3, 2.55, -5.5], 0x52625a);

  addWall(scene, [0.22, 2.7, 8.2], [-8, 1.35, -9.6]);
  addWall(scene, [0.22, 2.7, 8.2], [0.5, 1.35, -9.6]);
  addWall(scene, [5.4, 2.7, 0.22], [-5.2, 1.35, -5.5]);
  addWall(scene, [1.6, 2.7, 0.22], [-0.3, 1.35, -5.5]);
  addBox(scene, [2.2, 0.22, 0.28], [-2.4, 2.55, -5.5], 0x52625a);

  addWall(scene, [0.22, 2.7, 8.2], [6, 1.35, -9.6]);
  addWall(scene, [7.2, 2.7, 0.22], [9.7, 1.35, -5.5]);
  addWall(scene, [6.4, 2.7, 0.22], [19.6, 1.35, -5.5]);
  addBox(scene, [3.2, 0.22, 0.28], [14.6, 2.55, -5.5], 0x52625a);

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fc7c2,
    transparent: true,
    opacity: 0.28,
    roughness: 0.12,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  for (const [x, w] of [
    [8.2, 2.6],
    [11.4, 2.6],
    [17.8, 2.8],
    [21.2, 2.6],
  ]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, 2.5, 0.06), glass);
    pane.position.set(x, 1.35, -5.52);
    scene.add(pane);
  }

  // Glass meeting table.
  addBox(scene, [8.4, 0.16, 2.4], [14.8, 0.82, -9.4], 0xad7c4d);
  addBox(scene, [0.18, 0.72, 0.18], [11.2, 0.4, -9.4], 0x4c514d);
  addBox(scene, [0.18, 0.72, 0.18], [18.4, 0.4, -9.4], 0x4c514d);
  for (let x = 11.6; x <= 18; x += 1.6) {
    addBox(scene, [0.7, 0.1, 0.6], [x, 0.46, -7.7], 0x41645a);
    addBox(scene, [0.7, 0.1, 0.6], [x, 0.46, -11.1], 0x41645a);
  }

  // Desks inside the two focus rooms, set apart.
  addDesk(scene, -20.2, -10.4, false);
  addDesk(scene, -20.2, -7.6, true);
  addDesk(scene, -4.2, -10.2, false);
  addDesk(scene, -4.2, -7.4, true);

  // Central hall. The middle stays open; desks sit on the sides.
  addDesk(scene, -20.5, -2.2, false);
  addDesk(scene, -20.5, 1.6, true);
  addDesk(scene, 20.5, -2.2, false);
  addDesk(scene, 20.5, 1.6, true);

  // Low divider into the south wing, with a wide opening in the middle.
  addWall(scene, [16, 1.35, 0.2], [-15.2, 0.7, 5.2], 0xe4e6df);
  addWall(scene, [16, 1.35, 0.2], [15.2, 0.7, 5.2], 0xe4e6df);

  // Kitchen, west.
  addBox(scene, [12, 0.9, 1.3], [-16.5, 0.48, 12.4], 0x91a49a);
  addBox(scene, [10.5, 0.1, 1.05], [-16.5, 0.98, 12.4], 0xd3b077);
  addBox(scene, [4.2, 0.9, 1.6], [-16.2, 0.48, 8.2], 0x91a49a);
  addBox(scene, [3.4, 0.1, 1.2], [-16.2, 0.98, 8.2], 0xd3b077);

  // Lounge, south center.
  addBox(scene, [5.4, 0.7, 1.5], [-1.2, 0.38, 10.6], 0x648d78);
  addBox(scene, [4.6, 0.16, 0.45], [-1.2, 0.82, 10.15], 0x9ab4a4);
  addBox(scene, [1.5, 0.55, 3.2], [3.6, 0.3, 9.2], 0xc38b5c);
  addBox(scene, [2.4, 0.35, 1.3], [1.2, 0.28, 8], 0xc4a27a);

  // East work bay.
  addDesk(scene, 16.5, 7.4, false);
  addDesk(scene, 20.4, 7.4, true);
  addDesk(scene, 16.5, 11.2, false);
  addDesk(scene, 20.4, 11.2, true);

  for (const [x, z] of [
    [-22.4, -12.4],
    [-12.2, -2.8],
    [3.2, -12.6],
    [22.2, -12.4],
    [-22.2, 6.4],
    [12.4, 6.2],
    [22.2, 12.2],
    [-6.5, 12.4],
  ]) {
    addPlant(scene, x, z);
  }

  scene.add(new THREE.HemisphereLight(0xeaf5ee, 0x59635b, 2.15));
  const sun = new THREE.DirectionalLight(0xfff4df, 2.35);
  sun.position.set(-10, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  scene.add(sun);

  const hall = new THREE.PointLight(0xfff4e5, 40, 28);
  hall.position.set(0, 6, 0);
  scene.add(hall);
  const warm = new THREE.PointLight(0xffd7a3, 36, 18);
  warm.position.set(-16, 4, 10);
  scene.add(warm);
  const cool = new THREE.PointLight(0xb9e2dc, 34, 20);
  cool.position.set(14, 4, -9);
  scene.add(cool);
}
