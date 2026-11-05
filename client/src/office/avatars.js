import * as THREE from "three";

function makeLabel(name, isMe) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = isMe ? "rgba(35,73,57,0.94)" : "rgba(24,32,29,0.9)";
  ctx.beginPath();
  ctx.roundRect(12, 8, 232, 48, 20);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 22px Segoe UI, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = name.length > 16 ? `${name.slice(0, 15)}…` : name;
  ctx.fillText(isMe ? `${text} · you` : text, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  );
  sprite.scale.set(2.4, 0.6, 1);
  sprite.position.y = 2.7;
  sprite.renderOrder = 2;
  return sprite;
}

function makeLimb(group, x, y, material, length) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, length, 4, 8), material);
  mesh.position.y = -length * 0.55;
  mesh.castShadow = true;
  pivot.add(mesh);
  group.add(pivot);
  return pivot;
}

export function createAvatar(user, isMe) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: user.color || "#2f9e6b", roughness: 0.72 });
  const dark = new THREE.MeshStandardMaterial({ color: isMe ? 0x243a31 : 0x33413b, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9916e, roughness: 0.85 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x18201d, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.62, 5, 10), shirt);
  torso.position.y = 1.35;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), skin);
  head.position.y = 2.05;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.285, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
    dark
  );
  hair.position.y = 2.12;
  group.add(hair);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x202522 });
  for (const x of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), eyeMaterial);
    eye.position.set(x, 2.07, 0.26);
    group.add(eye);
  }

  const leftArm = makeLimb(group, -0.43, 1.65, shirt, 0.58);
  const rightArm = makeLimb(group, 0.43, 1.65, shirt, 0.58);
  const leftLeg = makeLimb(group, -0.16, 0.92, dark, 0.7);
  const rightLeg = makeLimb(group, 0.16, 0.92, dark, 0.7);

  for (const x of [-0.16, 0.16]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.34), shoe);
    foot.position.set(x, 0.06, 0.06);
    foot.castShadow = true;
    group.add(foot);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.64, 40),
    new THREE.MeshBasicMaterial({
      color: isMe ? 0x56c78f : 0x7ccda8,
      transparent: true,
      opacity: isMe ? 0.9 : 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);
  group.add(makeLabel(user.name || "Teammate", isMe));

  return { group, leftArm, rightArm, leftLeg, rightLeg, ring };
}

export function createEarshot(radius) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64),
    new THREE.MeshBasicMaterial({
      color: 0x2f9e6b,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(0.1, radius - 0.08), radius, 80),
    new THREE.MeshBasicMaterial({
      color: 0x2f9e6b,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(disc, ring);
  return group;
}

export function poseWalk(rig, moving, time) {
  const swing = moving ? Math.sin(time) * 0.65 : 0;
  const settle = moving ? 1 : 0.78;
  rig.leftArm.rotation.x = swing * settle + (moving ? 0 : rig.leftArm.rotation.x * 0.2);
  rig.rightArm.rotation.x = -swing * settle + (moving ? 0 : rig.rightArm.rotation.x * 0.2);
  rig.leftLeg.rotation.x = -swing * 0.9 * settle + (moving ? 0 : rig.leftLeg.rotation.x * 0.2);
  rig.rightLeg.rotation.x = swing * 0.9 * settle + (moving ? 0 : rig.rightLeg.rotation.x * 0.2);
  if (!moving) {
    rig.leftArm.rotation.x *= 0.8;
    rig.rightArm.rotation.x *= 0.8;
    rig.leftLeg.rotation.x *= 0.8;
    rig.rightLeg.rotation.x *= 0.8;
  }
}
