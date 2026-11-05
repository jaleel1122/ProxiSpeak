import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createAvatar, createEarshot, poseWalk } from "./avatars.js";
import { toPixel, toWorld } from "./coords.js";
import { buildOffice } from "./geometry.js";

const WALK_SPEED = 3.8;
const SPRINT_SPEED = 6.1;

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    const materials = child.material ? [].concat(child.material) : [];
    for (const material of materials) {
      material.map?.dispose();
      material.dispose();
    }
  });
}

export default function OfficeScene({ office, me, players, nearbyIds, snap, onMove, onYaw }) {
  const mountRef = useRef(null);
  const stateRef = useRef({ office, me, players, nearbyIds, snap, onMove, onYaw });
  const [graphicsError, setGraphicsError] = useState("");
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    stateRef.current = { office, me, players, nearbyIds, snap, onMove, onYaw };
  }, [office, me, players, nearbyIds, snap, onMove, onYaw]);

  useEffect(() => {
    const onLock = () => setLooking(document.pointerLockElement === mountRef.current?.querySelector("canvas"));
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    buildOffice(scene);

    const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 160);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setGraphicsError("This browser could not start 3D graphics. Turn on hardware acceleration and reload.");
      return undefined;
    }

    const memory = navigator.deviceMemory || 4;
    renderer.setPixelRatio(memory <= 2 ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const startOffice = stateRef.current.office;
    const startMe = stateRef.current.me;
    const meRig = createAvatar(startMe, true);
    const start = toWorld(startMe.x, startMe.y, startOffice);
    meRig.group.position.set(start.x, 0, start.z);
    const earshot = createEarshot(startOffice.earshot / startOffice.scale);
    meRig.group.add(earshot);
    scene.add(meRig.group);
    const initialFocus = meRig.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    camera.position.copy(initialFocus).add(new THREE.Vector3(0, 2.1 + Math.sin(0.28) * 5.8, Math.cos(0.28) * 5.8));
    camera.lookAt(initialFocus);

    const remotes = new Map();
    const keys = new Set();
    let yaw = 0;
    let pitch = 0.28;
    let walkTime = 0;
    let appliedSnap = 0;
    let lastSentAt = 0;
    let lastSent = { x: startMe.x, y: startMe.y };
    let pending = null;
    let last = performance.now();
    let frame = 0;
    let alive = true;

    const resize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(key)) {
        keys.add(key);
        event.preventDefault();
      }
    };
    const onKeyUp = (event) => keys.delete(event.key.toLowerCase());
    const onMouse = (event) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= event.movementX * 0.0025;
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0018, -0.05, 0.62);
    };
    const onClick = () => renderer.domElement.requestPointerLock?.();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouse);
    renderer.domElement.addEventListener("click", onClick);

    const publish = (x, y, now) => {
      const moved = Math.hypot(x - lastSent.x, y - lastSent.y) >= 0.4;
      if (!moved) return;
      pending = { x, y };
      if (now - lastSentAt < 50) return;
      lastSentAt = now;
      lastSent = pending;
      pending = null;
      stateRef.current.onMove(lastSent.x, lastSent.y);
    };

    const loop = (now) => {
      if (!alive) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const state = stateRef.current;

      if (state.snap && state.snap.seq !== appliedSnap) {
        appliedSnap = state.snap.seq;
        const corrected = toWorld(state.snap.x, state.snap.y, state.office);
        meRig.group.position.set(corrected.x, 0, corrected.z);
        lastSent = { x: state.snap.x, y: state.snap.y };
        pending = null;
      }

      const remoteIds = new Set(state.players.map((player) => player.id));
      for (const [id, rig] of remotes) {
        if (remoteIds.has(id)) continue;
        scene.remove(rig.group);
        disposeObject(rig.group);
        remotes.delete(id);
      }

      for (const player of state.players) {
        let rig = remotes.get(player.id);
        if (!rig) {
          rig = createAvatar(player, false);
          const at = toWorld(player.x, player.y, state.office);
          rig.group.position.set(at.x, 0, at.z);
          remotes.set(player.id, rig);
          scene.add(rig.group);
        }
        const target = toWorld(player.x, player.y, state.office);
        const previous = rig.group.position;
        const step = Math.hypot(target.x - previous.x, target.z - previous.z);
        if (step > 0.02) {
          rig.group.rotation.y = Math.atan2(target.x - previous.x, target.z - previous.z);
          walkTime += dt * 8;
        }
        rig.group.position.lerp(new THREE.Vector3(target.x, 0, target.z), Math.min(1, dt * 8));
        poseWalk(rig, step > 0.02, walkTime);
        rig.ring.material.opacity = state.nearbyIds.includes(player.id) ? 0.85 : 0;
      }

      let dx = 0;
      let dz = 0;
      if (keys.has("w") || keys.has("arrowup")) dz -= 1;
      if (keys.has("s") || keys.has("arrowdown")) dz += 1;
      if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
      if (keys.has("d") || keys.has("arrowright")) dx += 1;
      const moving = dx !== 0 || dz !== 0;
      if (moving) {
        const speed = (keys.has("shift") ? SPRINT_SPEED : WALK_SPEED) * dt;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const velocity = forward.multiplyScalar(-dz).add(right.multiplyScalar(dx));
        if (velocity.lengthSq() > 0) velocity.normalize().multiplyScalar(speed);
        meRig.group.position.add(velocity);
        const pixel = toPixel(meRig.group.position.x, meRig.group.position.z, state.office);
        const clamped = toWorld(pixel.x, pixel.y, state.office);
        meRig.group.position.set(clamped.x, 0, clamped.z);
        meRig.group.rotation.y = Math.atan2(velocity.x, velocity.z);
        walkTime += dt * (keys.has("shift") ? 14 : 9);
        publish(pixel.x, pixel.y, now);
      } else if (pending) {
        publish(pending.x, pending.y, now);
      }
      poseWalk(meRig, moving, walkTime);

      const focus = meRig.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
      const distance = 5.8;
      const offset = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        2.1 + Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance
      );
      const desired = focus.clone().add(offset);
      const blend = 1 - Math.pow(0.0008, dt);
      camera.position.lerp(desired, Number.isFinite(blend) ? blend : 1);
      camera.lookAt(focus);
      state.onYaw(yaw);

      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouse);
      renderer.domElement.removeEventListener("click", onClick);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="scene" ref={mountRef}>
      {graphicsError ? (
        <div className="scene-error">
          <strong>3D view unavailable</strong>
          <p>{graphicsError}</p>
        </div>
      ) : (
        <>
          <div className="crosshair" aria-hidden="true" />
          {!looking && (
            <div className="look-hint">
              <strong>Click to look around</strong>
              <span>WASD to walk · Mouse to look · Shift to sprint · Esc to release</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
