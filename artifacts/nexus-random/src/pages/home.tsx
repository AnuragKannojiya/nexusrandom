import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Users, AlertTriangle, MessageSquare, Video, VideoOff,
  StopCircle, SkipForward, Mic, MicOff, Tag, X,
} from "lucide-react";
import { getSocket } from "@/lib/socket";
import { WebRTCManager } from "@/lib/webrtc";
import { useGetPlatformStats, useCheckBanStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReportDialog } from "@/components/report-dialog";

type ChatState = "landing" | "searching" | "chatting";

interface Message {
  id: string;
  text: string;
  from: "you" | "stranger";
  timestamp: number;
}

const POPULAR_TAGS = ["gaming", "music", "anime", "movies", "sports", "tech", "art", "travel", "food", "fitness"];
const AUTO_NEXT_DELAY = 3;

export default function Home() {
  const [chatState, setChatState] = useState<ChatState>("landing");
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [strangerName, setStrangerName] = useState("Stranger");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [hasLocalStream, setHasLocalStream] = useState(false);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [autoNextCountdown, setAutoNextCountdown] = useState(0);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const webrtcRef = useRef<WebRTCManager>(new WebRTCManager());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoNextTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const interestsRef = useRef<string[]>([]);

  const { data: stats } = useGetPlatformStats();
  const { data: banStatus } = useCheckBanStatus();

  useEffect(() => {
    if (stats?.onlineUsers) setOnlineCount(stats.onlineUsers);
  }, [stats]);

  useEffect(() => {
    interestsRef.current = interests;
  }, [interests]);

  const setLocalVideoRef = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el) {
      const stream = webrtcRef.current.getLocalStream();
      if (stream) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
    }
  }, []);

  const setRemoteVideoRef = useCallback((el: HTMLVideoElement | null) => {
    remoteVideoRef.current = el;
    if (el) {
      const stream = webrtcRef.current.getRemoteStream();
      if (stream) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
    }
  }, []);

  const attachLocalStream = useCallback((stream: MediaStream | null) => {
    setHasLocalStream(!!stream);
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }
  }, []);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    setHasRemoteStream(true);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, []);

  const startAutoNextCountdown = useCallback(() => {
    setAutoNextCountdown(AUTO_NEXT_DELAY);
    if (autoNextTimerRef.current) clearInterval(autoNextTimerRef.current);
    let remaining = AUTO_NEXT_DELAY;
    autoNextTimerRef.current = setInterval(() => {
      remaining--;
      setAutoNextCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(autoNextTimerRef.current);
        autoNextTimerRef.current = undefined;
        doSkip();
      }
    }, 1000);
  }, []);

  const cancelAutoNext = () => {
    if (autoNextTimerRef.current) {
      clearInterval(autoNextTimerRef.current);
      autoNextTimerRef.current = undefined;
    }
    setAutoNextCountdown(0);
  };

  const doSkip = useCallback(() => {
    cancelAutoNext();
    webrtcRef.current.closePeerConnection();
    setHasRemoteStream(false);
    setDisconnected(false);
    setChatState("searching");
    setMessages([]);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    getSocket().emit("skip", { interests: interestsRef.current });
  }, []);

  const doStop = useCallback(() => {
    cancelAutoNext();
    getSocket().emit("leaveQueue");
    webrtcRef.current.close();
    setHasLocalStream(false);
    setHasRemoteStream(false);
    setDisconnected(false);
    setMessages([]);
    setSessionId(null);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setChatState("landing");
  }, []);

  useEffect(() => {
    const socket = getSocket();

    socket.on("onlineCount", (count: number) => setOnlineCount(count));

    socket.on("matched", async (data: { sessionId: string; strangerName: string; startWebRTC: boolean }) => {
      cancelAutoNext();
      setSessionId(data.sessionId);
      setStrangerName(data.strangerName);
      setChatState("chatting");
      setMessages([]);
      setDisconnected(false);
      setHasRemoteStream(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

      const mgr = webrtcRef.current;
      mgr.closePeerConnection();

      mgr.onRemoteStream((stream) => {
        console.log("[UI] Remote stream received");
        attachRemoteStream(stream);
      });

      const stream = await mgr.acquireLocalStream();
      attachLocalStream(stream);

      await mgr.createPeerConnection(data.startWebRTC);
    });

    socket.on("chatMessage", (data: { text: string; from: "you" | "stranger" }) => {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, text: data.text, from: data.from, timestamp: Date.now() },
      ]);
      setStrangerTyping(false);
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 50);
    });

    socket.on("strangerTyping", () => {
      setStrangerTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setStrangerTyping(false), 3000);
    });

    socket.on("strangerLeft", () => {
      setDisconnected(true);
      webrtcRef.current.closePeerConnection();
      setHasRemoteStream(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      startAutoNextCountdown();
    });

    socket.on("webrtcOffer", (data: { offer: RTCSessionDescriptionInit }) => {
      console.log("[UI] Received offer");
      webrtcRef.current.handleOffer(data.offer);
    });
    socket.on("webrtcAnswer", (data: { answer: RTCSessionDescriptionInit }) => {
      console.log("[UI] Received answer");
      webrtcRef.current.handleAnswer(data.answer);
    });
    socket.on("webrtcIceCandidate", (data: { candidate: RTCIceCandidateInit }) => {
      webrtcRef.current.handleIceCandidate(data.candidate);
    });

    return () => {
      socket.off("onlineCount");
      socket.off("matched");
      socket.off("chatMessage");
      socket.off("strangerTyping");
      socket.off("strangerLeft");
      socket.off("webrtcOffer");
      socket.off("webrtcAnswer");
      socket.off("webrtcIceCandidate");
    };
  }, [startAutoNextCountdown, attachLocalStream, attachRemoteStream]);

  const handleStartChat = async () => {
    setChatState("searching");
    webrtcRef.current.acquireLocalStream().then((stream) => {
      attachLocalStream(stream);
    });
    getSocket().emit("joinQueue", { interests });
  };

  const addTag = (tag: string) => {
    const cleaned = tag.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    if (!cleaned || interests.includes(cleaned) || interests.length >= 8) return;
    setInterests((prev) => [...prev, cleaned]);
  };

  const removeTag = (tag: string) => setInterests((prev) => prev.filter((t) => t !== tag));

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
      setTagInput("");
    } else if (e.key === "Backspace" && !tagInput && interests.length > 0) {
      setInterests((prev) => prev.slice(0, -1));
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || disconnected) return;
    getSocket().emit("chatMessage", { text: inputValue.trim() });
    setInputValue("");
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 50);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    getSocket().emit("typing");
  };

  const toggleVideo = () => {
    const stream = webrtcRef.current.getLocalStream();
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => (t.enabled = !videoEnabled));
    setVideoEnabled((v) => !v);
  };

  const toggleAudio = () => {
    const stream = webrtcRef.current.getLocalStream();
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = !audioEnabled));
    setAudioEnabled((a) => !a);
  };

  if (banStatus?.banned) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-destructive/50 bg-black/50 backdrop-blur-xl">
          <CardHeader>
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="w-8 h-8" />
              <CardTitle className="text-2xl">Access Denied</CardTitle>
            </div>
            <CardDescription className="text-destructive/80 text-lg mt-2">
              Your connection has been banned from NexusRandom.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {banStatus.reason && (
              <div className="bg-destructive/10 p-4 rounded-md border border-destructive/20 mt-4">
                <p className="font-semibold mb-1">Reason:</p>
                <p>{banStatus.reason}</p>
              </div>
            )}
            {banStatus.expiresAt && (
              <p className="text-sm text-muted-foreground mt-4">
                Expires: {new Date(banStatus.expiresAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden bg-background">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/20 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <header className="relative z-10 border-b border-border/50 bg-black/40 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center">
            <Video className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">
            NEXUS<span className="text-primary">RANDOM</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 px-3 py-1.5 rounded-full">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(0,255,255,1)]" />
          <span className="text-sm font-medium text-primary">{onlineCount.toLocaleString()} online</span>
        </div>
      </header>

      <main className="flex-1 relative z-10 flex items-center justify-center p-4 lg:p-8">
        <AnimatePresence mode="wait">

          {chatState === "landing" && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl text-center space-y-8"
            >
              <div className="space-y-4">
                <h2 className="text-5xl lg:text-7xl font-bold tracking-tighter text-white">
                  Connect{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                    Instantly.
                  </span>
                </h2>
                <p className="text-lg lg:text-xl text-muted-foreground max-w-lg mx-auto">
                  A raw, electric global chat platform. Drop into a live video chat with anyone in the world.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left max-w-3xl mx-auto">
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 backdrop-blur-sm">
                  <Video className="w-6 h-6 text-primary mb-3" />
                  <h3 className="font-semibold text-white mb-1">Live Video</h3>
                  <p className="text-sm text-muted-foreground">High quality WebRTC video and audio.</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 backdrop-blur-sm">
                  <Users className="w-6 h-6 text-accent mb-3" />
                  <h3 className="font-semibold text-white mb-1">Anonymous</h3>
                  <p className="text-sm text-muted-foreground">No accounts, no history, complete privacy.</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 backdrop-blur-sm">
                  <MessageSquare className="w-6 h-6 text-primary mb-3" />
                  <h3 className="font-semibold text-white mb-1">Fast Matches</h3>
                  <p className="text-sm text-muted-foreground">Connect with someone new in milliseconds.</p>
                </div>
              </div>

              <div className="w-full max-w-xl mx-auto bg-white/5 border border-white/10 rounded-2xl p-5 text-left space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Tag className="w-4 h-4 text-primary" />
                  <span>Interest Keywords</span>
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </div>

                {interests.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {interests.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 bg-primary/20 border border-primary/40 text-primary text-sm px-3 py-1 rounded-full font-medium"
                      >
                        #{tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-white transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="Type a keyword and press Enter..."
                    maxLength={20}
                    className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  />
                  <button
                    onClick={() => { addTag(tagInput); setTagInput(""); }}
                    className="px-4 py-2.5 bg-primary/20 border border-primary/40 text-primary rounded-xl text-sm font-medium hover:bg-primary/30 transition-colors"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {POPULAR_TAGS.filter((t) => !interests.includes(t)).slice(0, 6).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => addTag(tag)}
                      className="text-xs text-muted-foreground border border-white/10 px-2.5 py-1 rounded-full hover:border-primary/50 hover:text-primary transition-all"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <Button
                  size="lg"
                  onClick={handleStartChat}
                  className="h-16 px-12 text-lg font-bold bg-primary hover:bg-primary/90 text-black rounded-full shadow-[0_0_30px_rgba(0,255,255,0.4)] hover:shadow-[0_0_50px_rgba(0,255,255,0.6)] transition-all"
                >
                  START CHAT
                </Button>
                {interests.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Matching with people interested in: {interests.map((t) => `#${t}`).join(", ")}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {chatState === "searching" && (
            <motion.div
              key="searching"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center justify-center space-y-6"
            >
              <div className="relative w-32 h-32 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin" style={{ animationDuration: "1s" }} />
                <div className="absolute inset-2 rounded-full border-r-2 border-accent animate-spin" style={{ animationDuration: "1.5s", animationDirection: "reverse" }} />
                <div className="absolute inset-4 rounded-full border-b-2 border-primary animate-spin" style={{ animationDuration: "2s" }} />
                <Video className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-white tracking-tight">Finding a Stranger</h3>
                <p className="text-primary animate-pulse font-mono">Scanning global network...</p>
                {interests.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Looking for: {interests.map((t) => `#${t}`).join(" ")}
                  </p>
                )}
              </div>
              <Button variant="outline" onClick={doStop} className="mt-8 border-white/20 hover:bg-white/10 text-white rounded-full px-8">
                CANCEL
              </Button>
            </motion.div>
          )}

          {chatState === "chatting" && (
            <motion.div
              key="chatting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-6xl h-[calc(100vh-120px)] grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6"
            >
              <div className="lg:col-span-8 flex flex-col gap-4">
                <div className="flex-1 relative min-h-[300px]">
                  {/* Stranger video — full size main screen */}
                  <div className="w-full h-full relative bg-black/80 border border-border/50 rounded-2xl overflow-hidden shadow-lg">
                    <video
                      ref={setRemoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    {!hasRemoteStream && !disconnected && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                        <span className="text-muted-foreground font-medium">{strangerName}</span>
                        <span className="text-xs text-muted-foreground/70 mt-1">Connecting video...</span>
                      </div>
                    )}
                    {disconnected && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95">
                        <VideoOff className="w-10 h-10 text-muted-foreground mb-3" />
                        <span className="text-white font-semibold">Stranger left</span>
                        <span className="text-primary text-sm mt-2 font-mono">
                          Finding next in {autoNextCountdown}s...
                        </span>
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={doSkip}
                            className="px-4 py-2 bg-primary text-black text-sm font-bold rounded-lg hover:bg-primary/90"
                          >
                            Find Now
                          </button>
                          <button
                            onClick={() => { cancelAutoNext(); doStop(); }}
                            className="px-4 py-2 bg-white/10 text-white text-sm rounded-lg hover:bg-white/20"
                          >
                            Stop
                          </button>
                        </div>
                      </div>
                    )}
                    {!disconnected && (
                      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-xs font-medium text-white flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${hasRemoteStream ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
                        {strangerName}
                      </div>
                    )}

                    {/* Camera & mic controls — bottom centre of main screen */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                      <button
                        onClick={toggleVideo}
                        title={videoEnabled ? "Disable camera" : "Enable camera"}
                        className="w-9 h-9 rounded-full bg-black/70 border border-white/10 flex items-center justify-center hover:bg-black transition-colors"
                      >
                        {videoEnabled
                          ? <Video className="w-4 h-4 text-white" />
                          : <VideoOff className="w-4 h-4 text-destructive" />}
                      </button>
                      <button
                        onClick={toggleAudio}
                        title={audioEnabled ? "Mute mic" : "Unmute mic"}
                        className="w-9 h-9 rounded-full bg-black/70 border border-white/10 flex items-center justify-center hover:bg-black transition-colors"
                      >
                        {audioEnabled
                          ? <Mic className="w-4 h-4 text-white" />
                          : <MicOff className="w-4 h-4 text-destructive" />}
                      </button>
                    </div>
                  </div>

                  {/* Your video — floating PiP in bottom-right corner */}
                  <div className="absolute bottom-4 right-4 w-32 h-24 sm:w-44 sm:h-32 rounded-xl overflow-hidden border-2 border-primary/40 shadow-2xl z-10 bg-black/80">
                    <video
                      ref={setLocalVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    {!hasLocalStream && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90">
                        <VideoOff className="w-5 h-5 text-muted-foreground mb-1" />
                        <span className="text-muted-foreground text-xs">You</span>
                      </div>
                    )}
                    {hasLocalStream && !videoEnabled && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                        <VideoOff className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-medium text-white flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      You
                    </div>
                  </div>
                </div>

                <div className="h-20 bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-between px-6">
                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      size="lg"
                      onClick={doStop}
                      className="font-bold rounded-xl shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                    >
                      <StopCircle className="mr-2 w-5 h-5" />
                      STOP
                    </Button>
                    <Button
                      size="lg"
                      onClick={doSkip}
                      className="bg-white hover:bg-gray-200 text-black font-bold rounded-xl"
                    >
                      <SkipForward className="mr-2 w-5 h-5" />
                      NEXT
                    </Button>
                  </div>
                  {sessionId && !disconnected && (
                    <Button
                      variant="ghost"
                      onClick={() => setIsReportOpen(true)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <AlertTriangle className="mr-2 w-4 h-4" />
                      Report
                    </Button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden h-full">
                <div className="p-4 border-b border-white/10 bg-black/20 font-medium text-white flex justify-between items-center">
                  <span>Chat</span>
                  <span className="text-xs text-muted-foreground font-mono">{strangerName}</span>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="text-center py-3 text-xs font-mono text-primary bg-primary/5 rounded-lg border border-primary/20">
                    Connected to {strangerName}!
                    {interests.length > 0 && (
                      <span className="block mt-1 text-muted-foreground">
                        Your interests: {interests.map((t) => `#${t}`).join(" ")}
                      </span>
                    )}
                  </div>

                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.from === "you" ? "items-end" : "items-start"}`}>
                      <span className="text-[10px] text-muted-foreground mb-1 px-1 uppercase tracking-wider font-semibold">
                        {msg.from === "you" ? "You" : strangerName}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                          msg.from === "you"
                            ? "bg-primary text-black rounded-tr-sm shadow-[0_0_15px_rgba(0,255,255,0.2)]"
                            : "bg-white/10 text-white border border-white/5 rounded-tl-sm"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}

                  {strangerTyping && !disconnected && (
                    <div className="flex items-start">
                      <div className="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0.2s" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0.4s" }} />
                      </div>
                    </div>
                  )}

                  {disconnected && (
                    <div className="text-center py-4 space-y-3">
                      <div className="inline-block px-4 py-2 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm font-medium">
                        Stranger has disconnected
                      </div>
                      <div className="flex gap-2 justify-center">
                        <Button size="sm" onClick={doSkip} className="bg-primary hover:bg-primary/90 text-black font-bold">
                          Find Next ({autoNextCountdown}s)
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { cancelAutoNext(); doStop(); }} className="border-white/20 text-white hover:bg-white/10">
                          Stop
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-black/40 border-t border-white/10">
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={handleTyping}
                      placeholder={disconnected ? "Chat ended..." : "Type a message..."}
                      disabled={disconnected}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all disabled:opacity-50 text-sm"
                    />
                    <Button
                      type="submit"
                      disabled={!inputValue.trim() || disconnected}
                      className="rounded-xl px-5 bg-primary hover:bg-primary/90 text-black font-bold disabled:opacity-50 shadow-[0_0_15px_rgba(0,255,255,0.3)]"
                    >
                      SEND
                    </Button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {sessionId && (
        <ReportDialog
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          sessionId={sessionId}
        />
      )}
    </div>
  );
}
