const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * One audio connection per person in earshot.
 * The higher user id creates the offer. The lower id only answers.
 * That removes the glare where both sides offer at once.
 */
export class PeerManager {
  constructor({ socket, selfId, getLocalStream, onRemoteStream, onPeerClosed }) {
    this.socket = socket;
    this.selfId = selfId;
    this.getLocalStream = getLocalStream;
    this.onRemoteStream = onRemoteStream;
    this.onPeerClosed = onPeerClosed;
    this.peers = new Map();
    this.wanted = new Set();
    this.cooldown = new Map();
    this.earlyOffers = new Map();
    this.onOffer = this.onOffer.bind(this);
    this.onAnswer = this.onAnswer.bind(this);
    this.onIce = this.onIce.bind(this);
    socket.on("webrtc:offer", this.onOffer);
    socket.on("webrtc:answer", this.onAnswer);
    socket.on("webrtc:ice", this.onIce);
    this.timer = window.setInterval(() => {
      if (this.wanted.size) this.syncHearable([...this.wanted]);
    }, 1000);
  }

  destroy() {
    window.clearInterval(this.timer);
    this.socket.off("webrtc:offer", this.onOffer);
    this.socket.off("webrtc:answer", this.onAnswer);
    this.socket.off("webrtc:ice", this.onIce);
    for (const id of [...this.peers.keys()]) this.close(id);
    this.wanted.clear();
  }

  syncHearable(ids) {
    this.wanted = new Set(ids);
    for (const id of [...this.peers.keys()]) {
      if (!this.wanted.has(id)) this.close(id);
    }

    for (const id of this.wanted) {
      if (this.selfId <= id) {
        const early = this.earlyOffers.get(id);
        if (early && Date.now() - early.at < 5000) {
          this.earlyOffers.delete(id);
          this.acceptOffer(id, early.sdp);
        }
        continue;
      }

      const peer = this.peers.get(id);
      if (!peer) {
        if (this.cooled(id)) continue;
        this.offer(id);
        continue;
      }
      const ice = peer.pc.iceConnectionState;
      const conn = peer.pc.connectionState;
      if (conn === "connected" || ice === "connected" || ice === "completed") continue;
      const failed = conn === "failed" || ice === "failed";
      if (!failed && Date.now() - peer.startedAt < 20000) continue;
      this.close(id);
      this.cooldown.set(id, Date.now() + 2000);
    }
  }

  close(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    this.peers.delete(id);
    this.onPeerClosed(id);
  }

  cooled(id) {
    const until = this.cooldown.get(id) || 0;
    if (until > Date.now()) return true;
    this.cooldown.delete(id);
    return false;
  }

  ensure(id) {
    const existing = this.peers.get(id);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = { pc, iceQueue: [], startedAt: Date.now() };
    this.peers.set(id, peer);

    const stream = this.getLocalStream();
    if (stream) {
      for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.socket.emit("webrtc:ice", { to: id, candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      const existing = event.streams && event.streams[0];
      const remote = existing && existing.getAudioTracks().length
        ? existing
        : new MediaStream([event.track]);
      const deliver = () => {
        if (this.peers.get(id) === peer) this.onRemoteStream(id, remote);
      };
      deliver();
      if (event.track.muted) event.track.addEventListener("unmute", deliver, { once: true });
    };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(id) !== peer) return;
      if (pc.connectionState === "failed") {
        this.close(id);
        this.cooldown.set(id, Date.now() + 1500);
      }
    };
    return peer;
  }

  offer(id) {
    if (this.peers.has(id) || this.selfId <= id) return;
    const peer = this.ensure(id);
    this.sendOffer(peer, id);
  }

  async sendOffer(peer, id) {
    try {
      const offer = await peer.pc.createOffer();
      if (this.peers.get(id) !== peer) return;
      await peer.pc.setLocalDescription(offer);
      if (this.peers.get(id) !== peer) return;
      this.socket.emit("webrtc:offer", { to: id, sdp: peer.pc.localDescription });
    } catch (err) {
      console.error("Offer failed", err);
      this.close(id);
      this.cooldown.set(id, Date.now() + 1500);
    }
  }

  async onOffer({ from, sdp } = {}) {
    if (!from || !sdp || this.selfId > from) return;
    if (!this.wanted.has(from)) {
      this.earlyOffers.set(from, { sdp, at: Date.now() });
      return;
    }
    await this.acceptOffer(from, sdp);
  }

  async acceptOffer(from, sdp) {
    const existing = this.peers.get(from);
    if (existing?.pc.connectionState === "connected") return;
    if (existing && existing.pc.signalingState !== "stable") this.close(from);
    const peer = this.ensure(from);
    try {
      await peer.pc.setRemoteDescription(sdp);
      await this.flushIce(peer);
      const answer = await peer.pc.createAnswer();
      if (this.peers.get(from) !== peer) return;
      await peer.pc.setLocalDescription(answer);
      this.socket.emit("webrtc:answer", { to: from, sdp: peer.pc.localDescription });
    } catch (err) {
      console.error("Answer failed", err);
      this.close(from);
    }
  }

  async onAnswer({ from, sdp } = {}) {
    const peer = this.peers.get(from);
    if (!peer || !sdp || peer.pc.signalingState !== "have-local-offer") return;
    try {
      await peer.pc.setRemoteDescription(sdp);
      await this.flushIce(peer);
    } catch (err) {
      console.error("Could not apply the answer", err);
      this.close(from);
    }
  }

  async onIce({ from, candidate } = {}) {
    const peer = this.peers.get(from);
    if (!peer || !candidate) return;
    if (!peer.pc.remoteDescription) {
      peer.iceQueue.push(candidate);
      return;
    }
    try {
      await peer.pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("ICE candidate skipped", err);
    }
  }

  async flushIce(peer) {
    const queued = peer.iceQueue;
    peer.iceQueue = [];
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch {
        /* a late candidate can fail without breaking the call */
      }
    }
  }
}
