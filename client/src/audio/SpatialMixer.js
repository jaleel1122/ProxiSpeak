/**
 * Remote voice plays through an <audio> element. Chrome stays silent when a
 * WebRTC track is fed only into a MediaStreamSource node.
 * Distance sets the gain. Camera facing sets left/right pan.
 */
export class SpatialMixer {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.mount = null;
    this.nodes = new Map();
    this.yaw = 0;
    this.deafened = false;
    this.loud = 60;
    this.earshot = 280;
    this.onGesture = () => {
      if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
      for (const node of this.nodes.values()) node.audio.play().catch(() => {});
    };
  }

  async unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      window.addEventListener("pointerdown", this.onGesture);
      window.addEventListener("keydown", this.onGesture);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  setRanges({ loud, earshot }) {
    if (Number.isFinite(loud)) this.loud = loud;
    if (Number.isFinite(earshot)) this.earshot = earshot;
  }

  setYaw(yaw) {
    if (!Number.isFinite(yaw) || Math.abs(yaw - this.yaw) < 0.02) return;
    this.yaw = yaw;
    for (const node of this.nodes.values()) this.apply(node);
  }

  setDeafened(deafened) {
    this.deafened = deafened;
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(deafened ? 0 : 1, this.ctx.currentTime);
    }
    for (const node of this.nodes.values()) this.apply(node);
  }

  ensureMount() {
    if (this.mount) return this.mount;
    const mount = document.createElement("div");
    mount.setAttribute("aria-hidden", "true");
    mount.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;";
    document.body.appendChild(mount);
    this.mount = mount;
    return mount;
  }

  async attach(id, stream) {
    await this.unlock();
    this.detach(id);

    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.playsInline = true;
    audio.setAttribute("playsinline", "true");
    audio.srcObject = stream;
    this.ensureMount().appendChild(audio);

    const node = {
      audio,
      source: null,
      gain: null,
      panner: null,
      distance: this.earshot,
      dx: 0,
      dy: 0,
    };

    if (this.ctx?.state === "running" && this.master) {
      try {
        const source = this.ctx.createMediaElementSource(audio);
        const gain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner();
        source.connect(gain);
        gain.connect(panner);
        panner.connect(this.master);
        node.source = source;
        node.gain = gain;
        node.panner = panner;
      } catch {
        node.source = null;
      }
    }

    this.nodes.set(id, node);
    this.apply(node);
    await audio.play().catch(() => {});
  }

  update(id, info) {
    const node = this.nodes.get(id);
    if (!node || !info) return;
    node.distance = info.distance;
    node.dx = info.dx;
    node.dy = info.dy;
    this.apply(node);
  }

  detach(id) {
    const node = this.nodes.get(id);
    if (!node) return;
    try {
      node.audio.pause();
      node.audio.srcObject = null;
      node.audio.remove();
      node.source?.disconnect();
      node.gain?.disconnect();
      node.panner?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.nodes.delete(id);
  }

  close() {
    window.removeEventListener("pointerdown", this.onGesture);
    window.removeEventListener("keydown", this.onGesture);
    for (const id of [...this.nodes.keys()]) this.detach(id);
    this.mount?.remove();
    this.mount = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }

  apply(node) {
    const level = this.deafened ? 0 : this.gainFor(node.distance);
    const pan = this.panFor(node.dx, node.dy);
    if (node.gain && node.panner && this.ctx) {
      const now = this.ctx.currentTime;
      node.gain.gain.cancelScheduledValues(now);
      node.gain.gain.setValueAtTime(level, now);
      node.panner.pan.cancelScheduledValues(now);
      node.panner.pan.setValueAtTime(pan, now);
      node.audio.volume = 1;
      return;
    }
    node.audio.volume = level;
  }

  gainFor(distance) {
    if (distance <= this.loud) return 1;
    if (distance >= this.earshot) return 0.04;
    const t = 1 - (distance - this.loud) / (this.earshot - this.loud);
    return 0.04 + 0.96 * t * t;
  }

  /**
   * dx/dy are pixel offsets (x right, y down). yaw is the third-person camera.
   * Positive pan is the right ear.
   */
  panFor(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len < 8) return 0;
    const side = (dx / len) * Math.cos(this.yaw) + (dy / len) * -Math.sin(this.yaw);
    return Math.max(-1, Math.min(1, side));
  }
}
