import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Shield, Ban as BanIcon, FileWarning, Loader2,
  LogOut, Eye, EyeOff, Trash2, Plus, RefreshCw,
  AlertTriangle, CheckCircle2, Users, MessageSquare,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const SESSION_KEY = "nexus_admin_token";

function getToken(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

function setToken(token: string) {
  sessionStorage.setItem(SESSION_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(SESSION_KEY);
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    clearToken();
    throw new Error("UNAUTHORIZED");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

interface Report {
  id: number;
  sessionId: string;
  reporterIpHash: string;
  reason: string;
  description: string | null;
  createdAt: string;
}

interface Ban {
  id: number;
  ipHash: string;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

interface Stats {
  onlineUsers: number;
  activeChats: number;
  totalChatsToday: number;
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.status === 401) {
        setError("Incorrect password.");
        setPassword("");
        return;
      }
      if (res.status === 429) {
        setError("Too many attempts. Please wait 15 minutes.");
        return;
      }
      if (!res.ok) {
        setError("Server error. Try again.");
        return;
      }

      const { token } = await res.json();
      setToken(token);
      toast({ title: "Access granted", description: "Welcome to the moderation console." });
      onLogin();
    } catch {
      setError("Connection failed. Make sure the server is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-destructive/10 blur-[120px] rounded-full" />
      </div>

      <Card className="relative w-full max-w-md bg-black/60 border-white/10 backdrop-blur-xl shadow-2xl">
        <CardHeader className="text-center pb-4 border-b border-white/10">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl text-white">
            NEXUS<span className="text-primary">MODERATION</span>
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Restricted access — admin credentials required
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-white font-medium">Admin Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  autoComplete="current-password"
                  className="bg-black/50 border-white/10 text-white placeholder:text-muted-foreground pr-12 h-12 focus:ring-primary focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-lg text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-black font-bold text-base shadow-[0_0_20px_rgba(0,255,255,0.3)] disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Verifying...</>
              ) : (
                <><Shield className="w-5 h-5 mr-2" /> Access Console</>
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6 border-t border-white/5 pt-4">
            Session expires after 24 hours. Max 10 login attempts per 15 minutes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ModerationDashboard({ onLogout }: { onLogout: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [targetIpHash, setTargetIpHash] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banExpiry, setBanExpiry] = useState("");

  const handleUnauth = useCallback(() => {
    clearToken();
    onLogout();
  }, [onLogout]);

  const { data: reports, isLoading: reportsLoading, refetch: refetchReports } = useQuery<Report[]>({
    queryKey: ["admin-reports"],
    queryFn: () => adminFetch<Report[]>("/reports"),
    retry: (_, err) => {
      if ((err as Error).message === "UNAUTHORIZED") { handleUnauth(); return false; }
      return false;
    },
  });

  const { data: bans, isLoading: bansLoading, refetch: refetchBans } = useQuery<Ban[]>({
    queryKey: ["admin-bans"],
    queryFn: () => adminFetch<Ban[]>("/bans"),
    retry: (_, err) => {
      if ((err as Error).message === "UNAUTHORIZED") { handleUnauth(); return false; }
      return false;
    },
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["admin-stats"],
    queryFn: () => adminFetch<Stats>("/stats"),
    refetchInterval: 10000,
    retry: false,
  });

  const createBan = useMutation({
    mutationFn: (data: { ipHash: string; reason: string; expiresAt?: string }) =>
      adminFetch<Ban>("/bans", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({ title: "User banned", description: "Ban has been applied." });
      setBanDialogOpen(false);
      setBanReason("");
      setTargetIpHash("");
      setBanExpiry("");
      refetchBans();
    },
    onError: (err: Error) => {
      if (err.message === "UNAUTHORIZED") { handleUnauth(); return; }
      toast({ title: "Failed to ban user", description: err.message, variant: "destructive" });
    },
  });

  const removeBan = useMutation({
    mutationFn: (id: number) => adminFetch<{ success: boolean }>(`/bans/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Ban removed", description: "User has been unbanned." });
      refetchBans();
    },
    onError: (err: Error) => {
      if (err.message === "UNAUTHORIZED") { handleUnauth(); return; }
      toast({ title: "Failed to remove ban", variant: "destructive" });
    },
  });

  const openBanDialog = (ipHash = "") => {
    setTargetIpHash(ipHash);
    setBanReason("");
    setBanExpiry("");
    setBanDialogOpen(true);
  };

  const handleBanSubmit = () => {
    if (!targetIpHash.trim()) { toast({ title: "IP Hash required", variant: "destructive" }); return; }
    if (!banReason.trim()) { toast({ title: "Reason required", variant: "destructive" }); return; }
    createBan.mutate({
      ipHash: targetIpHash.trim(),
      reason: banReason.trim(),
      ...(banExpiry ? { expiresAt: new Date(banExpiry).toISOString() } : {}),
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-destructive" />
      </div>

      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/70 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">
                NEXUS<span className="text-primary">MODERATION</span>
              </h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">Admin Console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { refetchReports(); refetchBans(); }}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { clearToken(); onLogout(); }}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-white/10"
            >
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-black/40 border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">{stats?.onlineUsers ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">Online Now</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-black/40 border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">{stats?.activeChats ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">Active Chats</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-black/40 border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-destructive/20 border border-destructive/30 flex items-center justify-center">
                  <BanIcon className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">{bans?.length ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">Active Bans</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="reports" className="w-full">
          <TabsList className="bg-black/50 border border-white/10 p-1 mb-6">
            <TabsTrigger value="reports" className="data-[state=active]:bg-primary data-[state=active]:text-black px-6 py-2.5 rounded-sm flex gap-2 font-semibold">
              <FileWarning className="w-4 h-4" />
              Reports
              {reports?.length ? (
                <span className="ml-1 bg-primary/30 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                  {reports.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="bans" className="data-[state=active]:bg-destructive data-[state=active]:text-white px-6 py-2.5 rounded-sm flex gap-2 font-semibold">
              <BanIcon className="w-4 h-4" />
              Bans
              {bans?.length ? (
                <span className="ml-1 bg-destructive/30 text-destructive text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                  {bans.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-4">
            <Card className="bg-card/40 border-white/10 backdrop-blur-sm">
              <CardHeader className="border-b border-white/10 bg-black/20">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">User Reports</CardTitle>
                    <CardDescription>Reports submitted by users during chat sessions.</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchReports()}
                    className="border-white/10 text-white hover:bg-white/10"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {reportsLoading ? (
                  <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-primary w-7 h-7" /></div>
                ) : !reports?.length ? (
                  <div className="p-12 text-center">
                    <CheckCircle2 className="w-10 h-10 text-primary/40 mx-auto mb-3" />
                    <p className="text-muted-foreground">No reports yet. Clean platform!</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-black/40">
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-muted-foreground">Date</TableHead>
                          <TableHead className="text-muted-foreground">Reason</TableHead>
                          <TableHead className="text-muted-foreground">Session ID</TableHead>
                          <TableHead className="text-muted-foreground">Reporter Hash</TableHead>
                          <TableHead className="text-muted-foreground">Details</TableHead>
                          <TableHead className="text-right text-muted-foreground">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reports.map((report) => (
                          <TableRow key={report.id} className="border-white/5 hover:bg-white/5">
                            <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(report.createdAt), "MMM d, HH:mm")}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="border-amber-500/50 text-amber-400 bg-amber-500/10 uppercase tracking-wider text-[10px]"
                              >
                                {report.reason.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {report.sessionId.slice(0, 16)}...
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {report.reporterIpHash.slice(0, 12)}...
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                              {report.description || <span className="italic text-muted-foreground/50">None</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => openBanDialog(report.reporterIpHash)}
                                className="bg-destructive/20 text-destructive hover:bg-destructive hover:text-white border border-destructive/30 h-8"
                              >
                                <BanIcon className="w-3.5 h-3.5 mr-1.5" /> Ban
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bans" className="space-y-4">
            <Card className="bg-card/40 border-white/10 backdrop-blur-sm">
              <CardHeader className="border-b border-white/10 bg-black/20">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">Active Bans</CardTitle>
                    <CardDescription>Currently banned IP hashes. Remove to unban.</CardDescription>
                  </div>
                  <Button
                    onClick={() => openBanDialog("")}
                    className="bg-destructive hover:bg-destructive/90 text-white"
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Ban
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {bansLoading ? (
                  <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-primary w-7 h-7" /></div>
                ) : !bans?.length ? (
                  <div className="p-12 text-center">
                    <CheckCircle2 className="w-10 h-10 text-primary/40 mx-auto mb-3" />
                    <p className="text-muted-foreground">No active bans.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-black/40">
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-muted-foreground">Date</TableHead>
                          <TableHead className="text-muted-foreground">IP Hash</TableHead>
                          <TableHead className="text-muted-foreground">Reason</TableHead>
                          <TableHead className="text-muted-foreground">Expires</TableHead>
                          <TableHead className="text-right text-muted-foreground">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bans.map((ban) => {
                          const isExpired = ban.expiresAt && new Date(ban.expiresAt) < new Date();
                          return (
                            <TableRow key={ban.id} className="border-white/5 hover:bg-white/5">
                              <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                {format(new Date(ban.createdAt), "MMM d, HH:mm")}
                              </TableCell>
                              <TableCell className="font-mono text-sm text-destructive/80 max-w-[200px] truncate">
                                {ban.ipHash}
                              </TableCell>
                              <TableCell className="text-sm text-white/80">{ban.reason}</TableCell>
                              <TableCell className="text-sm">
                                {ban.expiresAt ? (
                                  <span className={isExpired ? "text-muted-foreground line-through" : "text-amber-400"}>
                                    {format(new Date(ban.expiresAt), "MMM d, yyyy HH:mm")}
                                  </span>
                                ) : (
                                  <Badge variant="outline" className="border-destructive/50 text-destructive text-[10px]">
                                    PERMANENT
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeBan.mutate(ban.id)}
                                  disabled={removeBan.isPending}
                                  className="text-muted-foreground hover:text-white hover:bg-white/10 h-8"
                                >
                                  {removeBan.isPending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <><Trash2 className="w-3.5 h-3.5 mr-1.5" /> Unban</>
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent className="bg-[#0d0d0d] border-white/10 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2 text-lg">
              <BanIcon className="w-5 h-5" /> Ban User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-white text-sm">IP Hash <span className="text-destructive">*</span></Label>
              <Input
                value={targetIpHash}
                onChange={(e) => setTargetIpHash(e.target.value)}
                className="bg-black/50 border-white/10 font-mono text-sm text-white h-11"
                placeholder="SHA-256 IP hash"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white text-sm">Reason <span className="text-destructive">*</span></Label>
              <Input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="bg-black/50 border-white/10 text-white h-11"
                placeholder="e.g. Harassment, inappropriate content"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white text-sm">
                Expires At <span className="text-muted-foreground font-normal">(leave empty for permanent)</span>
              </Label>
              <Input
                type="datetime-local"
                value={banExpiry}
                onChange={(e) => setBanExpiry(e.target.value)}
                className="bg-black/50 border-white/10 text-white h-11"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setBanDialogOpen(false)}
              className="border-white/10 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBanSubmit}
              disabled={createBan.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {createBan.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BanIcon className="w-4 h-4 mr-2" />}
              Confirm Ban
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Moderation() {
  const [authed, setAuthed] = useState(() => {
    const token = getToken();
    if (!token) return false;
    return true;
  });

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  return <ModerationDashboard onLogout={() => setAuthed(false)} />;
}
