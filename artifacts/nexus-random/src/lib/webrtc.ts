import { getSocket } from "./socket";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:openrelay.metered.ca:80" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;

  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private pendingOffer: RTCSessionDescriptionInit | null = null;
  private hasRemoteDescription = false;
  private peerConnectionReady = false;

  constructor() {}

  async acquireLocalStream(): Promise<MediaStream | null> {
    if (this.localStream && this.localStream.active) return this.localStream;

    const constraints: MediaStreamConstraints[] = [
      {
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      },
      { video: true, audio: true },
      { audio: true, video: false },
    ];

    for (const c of constraints) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(c);
        console.log("[WebRTC] Got local stream:", c);
        return this.localStream;
      } catch (err) {
        console.warn("[WebRTC] getUserMedia failed with constraints:", c, err);
      }
    }

    console.warn("[WebRTC] No media available — text-only mode");
    return null;
  }

  setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  onRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback;
  }

  async createPeerConnection(initiator: boolean) {
    this.closePeerConnection();

    const socket = getSocket();

    this.peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtcIceCandidate", { candidate: event.candidate.toJSON() });
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log("[WebRTC] ICE state:", state);
      if (state === "failed") {
        console.warn("[WebRTC] ICE failed — restarting");
        this.peerConnection?.restartIce();
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log("[WebRTC] Connection state:", this.peerConnection?.connectionState);
    };

    this.peerConnection.ontrack = (event) => {
      console.log("[WebRTC] Got remote track:", event.track.kind);
      const stream = event.streams?.[0] ?? new MediaStream([event.track]);
      this.remoteStream = stream;
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(stream);
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        console.log("[WebRTC] Adding local track:", track.kind);
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    } else {
      console.warn("[WebRTC] No local stream — adding recvonly transceivers");
      this.peerConnection.addTransceiver("audio", { direction: "recvonly" });
      this.peerConnection.addTransceiver("video", { direction: "recvonly" });
    }

    this.peerConnectionReady = true;

    if (this.pendingOffer) {
      console.log("[WebRTC] Flushing buffered offer");
      const offer = this.pendingOffer;
      this.pendingOffer = null;
      await this.handleOffer(offer);
      return;
    }

    if (initiator) {
      await new Promise((r) => setTimeout(r, 600));
      if (!this.peerConnection) return;

      try {
        const offer = await this.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await this.peerConnection.setLocalDescription(offer);
        console.log("[WebRTC] Sending offer");
        socket.emit("webrtcOffer", { offer: this.peerConnection.localDescription!.toJSON() });
      } catch (err) {
        console.error("[WebRTC] Error creating offer:", err);
      }
    }
  }

  async handleOffer(offer: RTCSessionDescriptionInit) {
    if (!offer?.type) {
      console.warn("[WebRTC] Invalid offer — missing type");
      return;
    }

    if (!this.peerConnection || !this.peerConnectionReady) {
      console.log("[WebRTC] Buffering offer (peer connection not ready yet)");
      this.pendingOffer = offer;
      return;
    }

    try {
      console.log("[WebRTC] Setting remote description (offer)");
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      this.hasRemoteDescription = true;
      await this.flushPendingIceCandidates();

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      console.log("[WebRTC] Sending answer");
      getSocket().emit("webrtcAnswer", { answer: this.peerConnection.localDescription!.toJSON() });
    } catch (err) {
      console.error("[WebRTC] Error handling offer:", err);
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection || !answer?.type) return;
    try {
      console.log("[WebRTC] Setting remote description (answer)");
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      this.hasRemoteDescription = true;
      await this.flushPendingIceCandidates();
    } catch (err) {
      console.error("[WebRTC] Error handling answer:", err);
    }
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!candidate) return;
    if (!this.hasRemoteDescription || !this.peerConnection) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (_) {}
  }

  private async flushPendingIceCandidates() {
    const toFlush = [...this.pendingIceCandidates];
    this.pendingIceCandidates = [];
    for (const c of toFlush) {
      try {
        await this.peerConnection?.addIceCandidate(new RTCIceCandidate(c));
      } catch (_) {}
    }
  }

  closePeerConnection() {
    this.hasRemoteDescription = false;
    this.peerConnectionReady = false;
    this.pendingIceCandidates = [];
    this.pendingOffer = null;
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
  }

  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
  }

  close() {
    this.closePeerConnection();
    this.stopLocalStream();
  }
}
