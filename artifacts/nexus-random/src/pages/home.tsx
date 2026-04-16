import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Users, AlertTriangle, MessageSquare, Video, VideoOff, StopCircle, SkipForward, Mic, MicOff } from "lucide-react";
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

export default function Home() {
  const [chatState, setChatState] = useState<ChatState>("landing");
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [strangerName, setStrangerName] = useState("Stranger");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [showDisconnectMessage, setShowDisconnectMessage] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [mediaReady, setMediaReady] = useState(false);

  const webrtcRef = useRef<WebRTCManager | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prewarmedStreamRef = useRef<MediaStream | null>(null);

  const { data: stats, isLoading: statsLoading } = useGetPlatformStats();
  const { data: banStatus } = useCheckBanStatus();

  useEffect(() => {
    if (stats?.onlineUsers) setOnlineCount(stats.onlineUsers);
  }, [stats]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    const socket = getSocket();

    socket.on("onlineCount", (count: number) => setOnlineCount(count));

    socket.on("matched", async (data: { sessionId: string; strangerName: string; startWebRTC: boolean }) => {
      setSessionId(data.sessionId);
      setStrangerName(data.strangerName);
      setChatState("chatting");
      setMessages([]);
      setShowDisconnectMessage(false);

      if (!webrtcRef.current) {
        webrtcRef.current = new WebRTCManager();
        webrtcRef.current.onRemoteStream((stream) => setRemoteStream(stream));
      }

      let stream: MediaStream | null = null;
      if (prewarmedStreamRef.current) {
        stream = prewarmedStreamRef.current;
        prewarmedStreamRef.current = null;
        (webrtcRef.current as any).localStream = stream;
      } else {
        stream = await webrtcRef.current.initLocalStream();
      }
      setLocalStream(stream);
      webrtcRef.current.createPeerConnection(data.startWebRTC);
    });

    socket.on("chatMessage", (data: { text: string; from: "you" | "stranger" }) => {
      setMessages((prev) => [
        ...prev,
        { id: Math.random().toString(), text: data.text, from: data.from, timestamp: Date.now() },
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
      setShowDisconnectMessage(true);
      if (webrtcRef.current) {
        webrtcRef.current.close();
        webrtcRef.current = null;
      }
      setRemoteStream(null);
    });

    socket.on("webrtcOffer", (data: { offer: RTCSessionDescriptionInit }) => {
      webrtcRef.current?.handleOffer(data.offer);
    });
    socket.on("webrtcAnswer", (data: { answer: RTCSessionDescriptionInit }) => {
      webrtcRef.current?.handleAnswer(data.answer);
    });
    socket.on("webrtcIceCandidate", (data: { candidate: RTCIceCandidateInit }) => {
      webrtcRef.current?.handleIceCandidate(data.candidate);
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
      if (webrtcRef.current) webrtcRef.current.close();
    };
  }, []);

  const prewarmMedia = useCallback(async () => {
    if (prewarmedStreamRef.current || mediaReady) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      prewarmedStreamRef.current = stream;
      setMediaReady(true);
    } catch {
      setMediaReady(true);
    }
  }, [mediaReady]);

  const handleStartChat = async () => {
    setChatState("searching");
    prewarmMedia();
    getSocket().emit("joinQueue");
  };

  const handleStop = () => {
    getSocket().emit("leaveQueue");
    setChatState("landing");
    setSessionId(null);
    setLocalStream(null);
    setRemoteStream(null);
    setMediaReady(false);
    prewarmedStreamRef.current?.getTracks().forEach((t) => t.stop());
    prewarmedStreamRef.current = null;
    if (webrtcRef.current) {
      webrtcRef.current.close();
      webrtcRef.current = null;
    }
  };

  const handleSkip = () => {
    getSocket().emit("skip");
    setChatState("searching");
    setMessages([]);
    setShowDisconnectMessage(false);
    setRemoteStream(null);
    if (webrtcRef.current) {
      webrtcRef.current.close();
      webrtcRef.current = null;
    }
    prewarmMedia();
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || showDisconnectMessage) return;
    const socket = getSocket();
    socket.emit("chatMessage", { text: inputValue.trim() });
    setMessages((prev) => [
      ...prev,
      { id: Math.random().toString(), text: inputValue.trim(), from: "you", timestamp: Date.now() },
    ]);
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
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach((t) => (t.enabled = !videoEnabled));
    setVideoEnabled(!videoEnabled);
  };

  const toggleAudio = () => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach((t) => (t.enabled = !audioEnabled));
    setAudioEnabled(!audioEnabled);
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
              <div className="bg-destructive/10 p-4 rounded-md border border-destructive/20 mt-4 text-destructive-foreground">
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
          <span className="text-sm font-medium text-primary">
            {statsLoading ? "..." : onlineCount.toLocaleString()} online
          </span>
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
                  Connect <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Instantly.</span>
                </h2>
                <p className="text-lg lg:text-xl text-muted-foreground max-w-lg mx-auto">
                  A raw, electric global chat platform where strangers connect instantly.
                  Drop into a live chat with anyone in the world at any moment.
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

              <div className="pt-8">
                <Button
                  size="lg"
                  onClick={handleStartChat}
                  className="h-16 px-12 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-[0_0_30px_rgba(0,255,255,0.4)] hover:shadow-[0_0_50px_rgba(0,255,255,0.6)] transition-all"
                >
                  START CHAT
                </Button>
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
              </div>
              <Button variant="outline" onClick={handleStop} className="mt-8 border-white/20 hover:bg-white/10 text-white rounded-full px-8">
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
                <div className="flex-1 grid grid-cols-2 gap-4 min-h-[300px]">
                  <div className="relative bg-black/50 border border-border/50 rounded-2xl overflow-hidden shadow-lg">
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    {!remoteStream && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                        <span className="text-muted-foreground font-medium">{strangerName}</span>
                        <span className="text-xs text-muted-foreground/70 mt-1">Connecting video...</span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-xs font-medium text-white flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      {strangerName}
                    </div>
                  </div>

                  <div className="relative bg-black/50 border border-border/50 rounded-2xl overflow-hidden shadow-lg">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                    {!localStream && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                        <VideoOff className="w-8 h-8 text-muted-foreground mb-2" />
                        <span className="text-muted-foreground font-medium">You</span>
                        <span className="text-xs text-muted-foreground/70 mt-1">Camera unavailable</span>
                      </div>
                    )}
                    {localStream && !videoEnabled && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                        <VideoOff className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-xs font-medium text-white flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      You
                    </div>
                    {localStream && (
                      <div className="absolute bottom-3 right-3 flex gap-1.5">
                        <button
                          onClick={toggleVideo}
                          className="w-7 h-7 rounded-full bg-black/60 border border-white/10 flex items-center justify-center hover:bg-black/80 transition-colors"
                        >
                          {videoEnabled ? <Video className="w-3.5 h-3.5 text-white" /> : <VideoOff className="w-3.5 h-3.5 text-destructive" />}
                        </button>
                        <button
                          onClick={toggleAudio}
                          className="w-7 h-7 rounded-full bg-black/60 border border-white/10 flex items-center justify-center hover:bg-black/80 transition-colors"
                        >
                          {audioEnabled ? <Mic className="w-3.5 h-3.5 text-white" /> : <MicOff className="w-3.5 h-3.5 text-destructive" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-20 bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-between px-6">
                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      size="lg"
                      onClick={handleStop}
                      className="font-bold rounded-xl shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                    >
                      <StopCircle className="mr-2 w-5 h-5" />
                      STOP
                    </Button>
                    <Button
                      variant="default"
                      size="lg"
                      onClick={handleSkip}
                      className="bg-white hover:bg-gray-200 text-black font-bold rounded-xl"
                    >
                      <SkipForward className="mr-2 w-5 h-5" />
                      NEXT
                    </Button>
                  </div>
                  {sessionId && (
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
                  <span>Chat Session</span>
                  <span className="text-xs text-muted-foreground font-mono">{strangerName}</span>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="text-center py-3 text-xs font-mono text-primary bg-primary/5 rounded-lg border border-primary/20">
                    Connected! Say hi to {strangerName}
                  </div>

                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.from === "you" ? "items-end" : "items-start"}`}>
                      <span className="text-[10px] text-muted-foreground mb-1 px-1 uppercase tracking-wider font-semibold">
                        {msg.from === "you" ? "You" : strangerName}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                          msg.from === "you"
                            ? "bg-primary text-primary-foreground rounded-tr-sm shadow-[0_0_15px_rgba(0,255,255,0.2)]"
                            : "bg-white/10 text-white border border-white/5 rounded-tl-sm"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}

                  {strangerTyping && (
                    <div className="flex items-start">
                      <div className="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0.2s" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0.4s" }} />
                      </div>
                    </div>
                  )}

                  {showDisconnectMessage && (
                    <div className="text-center py-6 mt-4">
                      <div className="inline-block px-4 py-2 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm font-medium mb-4">
                        Stranger has disconnected
                      </div>
                      <div>
                        <Button onClick={handleSkip} className="w-full bg-primary hover:bg-primary/90 text-black font-bold">
                          Find Next Stranger
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
                      placeholder={showDisconnectMessage ? "Chat ended..." : "Type a message..."}
                      disabled={showDisconnectMessage}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all disabled:opacity-50"
                    />
                    <Button
                      type="submit"
                      disabled={!inputValue.trim() || showDisconnectMessage}
                      className="rounded-xl px-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(0,255,255,0.3)] font-bold disabled:opacity-50 disabled:shadow-none"
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
