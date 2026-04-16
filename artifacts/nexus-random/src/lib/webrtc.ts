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
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private hasRemoteDescription = false;

  constructor() {}

  async acquireLocalStream(): Promise<MediaStream | null> {
    if (this.localStream) return this.localStream;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      return this.localStream;
    } catch {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        return this.localStream;
      } catch {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          return this.localStream;
        } catch {
          console.warn("No camera/mic — text-only mode");
          return null;
        }
      }
    }
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

  createPeerConnection(initiator: boolean) {
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
      if (state === "failed") {
        this.peerConnection?.restartIce();
      }
    };

    this.peerConnection.ontrack = (event) => {
      const stream = event.streams?.[0] ?? new MediaStream([event.track]);
      this.remoteStream = stream;
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(stream);
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        if (this.localStream && this.peerConnection) {
          this.peerConnection.addTrack(track, this.localStream);
        }
      });
    }

    if (initiator) {
      this.peerConnection
        .createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then((offer) => this.peerConnection!.setLocalDescription(offer))
        .then(() => {
          socket.emit("webrtcOffer", { offer: this.peerConnection!.localDescription!.toJSON() });
        })
        .catch((err) => console.error("Error creating offer:", err));
    }
  }

  async handleOffer(offer: RTCSessionDescriptionInit) {
    if (!this.peerConnection || !offer?.type) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      this.hasRemoteDescription = true;
      await this.flushPendingCandidates();
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      getSocket().emit("webrtcAnswer", { answer: this.peerConnection.localDescription!.toJSON() });
    } catch (err) {
      console.error("Error handling offer:", err);
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection || !answer?.type) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      this.hasRemoteDescription = true;
      await this.flushPendingCandidates();
    } catch (err) {
      console.error("Error handling answer:", err);
    }
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!candidate) return;
    if (!this.hasRemoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.peerConnection?.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (_) {}
  }

  private async flushPendingCandidates() {
    const toFlush = [...this.pendingCandidates];
    this.pendingCandidates = [];
    for (const c of toFlush) {
      try {
        await this.peerConnection?.addIceCandidate(new RTCIceCandidate(c));
      } catch (_) {}
    }
  }

  closePeerConnection() {
    this.hasRemoteDescription = false;
    this.pendingCandidates = [];
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
