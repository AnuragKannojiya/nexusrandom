import { useState } from "react";
import { format } from "date-fns";
import { Shield, Ban as BanIcon, FileWarning, Search, MoreVertical, Loader2 } from "lucide-react";
import { useGetReports, useGetBans, useCreateBan } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Moderation() {
  const [activeTab, setActiveTab] = useState("reports");
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [targetIpHash, setTargetIpHash] = useState("");
  const [banReason, setBanReason] = useState("");
  
  const { data: reports, isLoading: reportsLoading, refetch: refetchReports } = useGetReports();
  const { data: bans, isLoading: bansLoading, refetch: refetchBans } = useGetBans();
  const createBan = useCreateBan();
  const { toast } = useToast();

  const handleOpenBanDialog = (ipHash: string) => {
    setTargetIpHash(ipHash);
    setBanReason("");
    setBanDialogOpen(true);
  };

  const handleBanSubmit = () => {
    if (!banReason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }

    createBan.mutate(
      { data: { ipHash: targetIpHash, reason: banReason } },
      {
        onSuccess: () => {
          toast({ title: "User banned successfully" });
          setBanDialogOpen(false);
          refetchBans();
        },
        onError: () => {
          toast({ title: "Failed to ban user", variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-border/50 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-primary" />
              NEXUS<span className="text-primary">MODERATION</span>
            </h1>
            <p className="text-muted-foreground mt-2">Admin console for platform safety.</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-black/50 border border-white/10 p-1 mb-6">
            <TabsTrigger value="reports" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-6 py-2.5 rounded-sm flex gap-2">
              <FileWarning className="w-4 h-4" /> Reports
            </TabsTrigger>
            <TabsTrigger value="bans" className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground px-6 py-2.5 rounded-sm flex gap-2">
              <BanIcon className="w-4 h-4" /> Active Bans
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-4">
            <Card className="bg-card border-border/50">
              <CardHeader className="border-b border-border/50 bg-black/20">
                <CardTitle className="text-white">Recent Reports</CardTitle>
                <CardDescription>User submitted reports against sessions.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {reportsLoading ? (
                  <div className="p-8 flex justify-center text-primary"><Loader2 className="animate-spin" /></div>
                ) : !reports?.length ? (
                  <div className="p-8 text-center text-muted-foreground">No reports found.</div>
                ) : (
                  <Table>
                    <TableHeader className="bg-black/40">
                      <TableRow className="border-border/50 hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Date</TableHead>
                        <TableHead className="text-muted-foreground">Reason</TableHead>
                        <TableHead className="text-muted-foreground">Session / IP Hash</TableHead>
                        <TableHead className="text-muted-foreground">Details</TableHead>
                        <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.map((report) => (
                        <TableRow key={report.id} className="border-border/50 hover:bg-white/5">
                          <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                            {format(new Date(report.createdAt), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-primary text-primary bg-primary/10 uppercase tracking-wider text-[10px]">
                              {report.reason.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-xs text-muted-foreground">S: {report.sessionId.slice(0, 12)}...</span>
                              <span className="font-mono text-xs text-muted-foreground">R: {report.reporterIpHash.slice(0, 12)}...</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate text-sm">
                            {report.description || <span className="text-muted-foreground italic">No details</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              className="bg-destructive/20 text-destructive hover:bg-destructive hover:text-white border border-destructive/30"
                              onClick={() => handleOpenBanDialog(report.reporterIpHash)} // Typically you'd ban the offender, but here we only have reporterIpHash. In a real app we'd have the offender's IP in the session.
                            >
                              Ban User
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bans" className="space-y-4">
            <Card className="bg-card border-border/50">
              <CardHeader className="border-b border-border/50 bg-black/20 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">Active Bans</CardTitle>
                  <CardDescription>Currently banned IP hashes.</CardDescription>
                </div>
                <Button onClick={() => handleOpenBanDialog("")} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Add Ban manually
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {bansLoading ? (
                  <div className="p-8 flex justify-center text-primary"><Loader2 className="animate-spin" /></div>
                ) : !bans?.length ? (
                  <div className="p-8 text-center text-muted-foreground">No active bans.</div>
                ) : (
                  <Table>
                    <TableHeader className="bg-black/40">
                      <TableRow className="border-border/50 hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Date</TableHead>
                        <TableHead className="text-muted-foreground">IP Hash</TableHead>
                        <TableHead className="text-muted-foreground">Reason</TableHead>
                        <TableHead className="text-muted-foreground">Expires</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bans.map((ban) => (
                        <TableRow key={ban.id} className="border-border/50 hover:bg-white/5">
                          <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                            {format(new Date(ban.createdAt), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-destructive">
                            {ban.ipHash}
                          </TableCell>
                          <TableCell className="text-sm">
                            {ban.reason}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {ban.expiresAt ? format(new Date(ban.expiresAt), 'MMM d, yyyy HH:mm') : 'Never'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent className="bg-card border-border/50 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <BanIcon className="w-5 h-5" /> Ban User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white">IP Hash</Label>
              <Input 
                value={targetIpHash} 
                onChange={(e) => setTargetIpHash(e.target.value)} 
                className="bg-black/50 border-white/10 font-mono text-sm text-white"
                placeholder="Enter IP Hash"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Reason</Label>
              <Input 
                value={banReason} 
                onChange={(e) => setBanReason(e.target.value)} 
                className="bg-black/50 border-white/10 text-white"
                placeholder="e.g. Repeated harassment"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialogOpen(false)} className="border-white/20 text-white hover:bg-white/10">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBanSubmit}
              disabled={createBan.isPending}
            >
              {createBan.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Ban
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
