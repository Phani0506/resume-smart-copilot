
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mail, Copy, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Resume {
  id: string;
  file_name: string;
  parsed_data: any;
}

interface OutreachModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resume: Resume | null;
}

const OutreachModal = ({ open, onOpenChange, resume }: OutreachModalProps) => {
  const [outreachMessage, setOutreachMessage] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generateOutreach = async () => {
    if (!resume?.parsed_data) {
      toast({
        title: 'Unable to generate outreach',
        description: 'Resume data not available.',
        variant: 'destructive',
      });
      return;
    }

    setGenerating(true);
    try {
      const jobContext = jobTitle && companyName ? {
        jobTitle,
        company: companyName
      } : null;

      const { data, error } = await supabase.functions.invoke('generate-outreach', {
        body: { 
          resumeData: resume.parsed_data,
          jobContext
        }
      });

      if (error) throw error;

      setOutreachMessage(data.message);
      toast({
        title: 'Outreach Generated',
        description: 'Personalized outreach message has been generated.',
      });
    } catch (error) {
      console.error('Error generating outreach:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate outreach message.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(outreachMessage);
      toast({
        title: 'Copied!',
        description: 'Outreach message copied to clipboard.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  const openEmailClient = () => {
    const subject = `Opportunity at ${companyName || 'Our Company'}`;
    const body = encodeURIComponent(outreachMessage);
    const email = resume?.parsed_data?.email || '';
    
    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${body}`;
    window.open(mailtoLink);
  };

  const handleClose = () => {
    setOutreachMessage("");
    setJobTitle("");
    setCompanyName("");
    onOpenChange(false);
  };

  if (!resume) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Mail className="h-5 w-5" />
            <span>Draft Outreach Message</span>
          </DialogTitle>
          <DialogDescription>
            Generate and customize a personalized outreach message for {resume.parsed_data?.full_name || 'this candidate'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Candidate Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-2">Candidate Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Name:</span> {resume.parsed_data?.full_name || 'Unknown'}
              </div>
              <div>
                <span className="font-medium">Email:</span> {resume.parsed_data?.email || 'N/A'}
              </div>
              {resume.parsed_data?.skills && (
                <div className="col-span-2">
                  <span className="font-medium">Key Skills:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {resume.parsed_data.skills.slice(0, 5).map((skill: string, index: number) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Job Context */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="jobTitle">Job Title (Optional)</Label>
              <Input
                id="jobTitle"
                placeholder="e.g., Senior Frontend Developer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="companyName">Company Name (Optional)</Label>
              <Input
                id="companyName"
                placeholder="e.g., Tech Corp"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex justify-center">
            <Button 
              onClick={generateOutreach}
              disabled={generating}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Generate Outreach Message
                </>
              )}
            </Button>
          </div>

          {/* Generated Message */}
          {outreachMessage && (
            <div className="space-y-4">
              <Label htmlFor="outreachMessage">Generated Outreach Message</Label>
              <Textarea
                id="outreachMessage"
                value={outreachMessage}
                onChange={(e) => setOutreachMessage(e.target.value)}
                rows={12}
                className="min-h-[300px]"
                placeholder="Your personalized outreach message will appear here..."
              />
              
              <div className="flex space-x-2">
                <Button variant="outline" onClick={copyToClipboard}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button 
                  onClick={openEmailClient}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  disabled={!resume.parsed_data?.email}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Open in Email Client
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OutreachModal;
