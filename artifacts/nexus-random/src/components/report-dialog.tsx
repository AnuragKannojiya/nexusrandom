import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useCreateReport, CreateReportBodyReason } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

export function ReportDialog({ isOpen, onClose, sessionId }: ReportDialogProps) {
  const [reason, setReason] = useState<CreateReportBodyReason>("inappropriate_content");
  const [description, setDescription] = useState("");
  
  const { toast } = useToast();
  const createReport = useCreateReport();

  const handleSubmit = () => {
    createReport.mutate(
      { 
        data: { 
          sessionId, 
          reason, 
          description: description.trim() || undefined 
        } 
      },
      {
        onSuccess: () => {
          toast({
            title: "Report Submitted",
            description: "Thank you for helping keep the platform safe.",
          });
          onClose();
          setDescription("");
        },
        onError: (err) => {
          toast({
            title: "Failed to submit report",
            description: "Please try again later.",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border/50 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Report Stranger</DialogTitle>
          <DialogDescription>
            Help us keep the community safe. All reports are reviewed by our moderation team.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-6">
          <RadioGroup value={reason} onValueChange={(v) => setReason(v as CreateReportBodyReason)}>
            <div className="flex items-center space-x-3 space-y-0 p-3 rounded-md hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors">
              <RadioGroupItem value="inappropriate_content" id="r1" className="border-primary text-primary" />
              <Label htmlFor="r1" className="cursor-pointer font-medium text-white flex-1">Inappropriate Content</Label>
            </div>
            <div className="flex items-center space-x-3 space-y-0 p-3 rounded-md hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors">
              <RadioGroupItem value="harassment" id="r2" className="border-primary text-primary" />
              <Label htmlFor="r2" className="cursor-pointer font-medium text-white flex-1">Harassment or Bullying</Label>
            </div>
            <div className="flex items-center space-x-3 space-y-0 p-3 rounded-md hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors">
              <RadioGroupItem value="spam" id="r3" className="border-primary text-primary" />
              <Label htmlFor="r3" className="cursor-pointer font-medium text-white flex-1">Spam or Advertising</Label>
            </div>
            <div className="flex items-center space-x-3 space-y-0 p-3 rounded-md hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors">
              <RadioGroupItem value="bot" id="r4" className="border-primary text-primary" />
              <Label htmlFor="r4" className="cursor-pointer font-medium text-white flex-1">Bot / Automated Behavior</Label>
            </div>
            <div className="flex items-center space-x-3 space-y-0 p-3 rounded-md hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors">
              <RadioGroupItem value="other" id="r5" className="border-primary text-primary" />
              <Label htmlFor="r5" className="cursor-pointer font-medium text-white flex-1">Other</Label>
            </div>
          </RadioGroup>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-white">Additional Details (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Provide any additional context..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-black/50 border-white/10 focus-visible:ring-primary min-h-[100px] text-white resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/20 text-white hover:bg-white/10">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={createReport.isPending}
            className="bg-destructive hover:bg-destructive/90 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]"
          >
            {createReport.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Submit Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
