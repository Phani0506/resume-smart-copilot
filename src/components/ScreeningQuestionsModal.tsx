
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
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Copy, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Question {
  category: string;
  question: string;
  purpose: string;
}

interface ScreeningQuestionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: Question[];
  candidateName: string;
  loading: boolean;
}

const ScreeningQuestionsModal = ({ 
  open, 
  onOpenChange, 
  questions, 
  candidateName,
  loading 
}: ScreeningQuestionsModalProps) => {
  const { toast } = useToast();

  const copyAllQuestions = async () => {
    const questionsText = questions.map((q, index) => 
      `${index + 1}. [${q.category.toUpperCase()}] ${q.question}\n   Purpose: ${q.purpose}`
    ).join('\n\n');

    try {
      await navigator.clipboard.writeText(questionsText);
      toast({
        title: 'Copied!',
        description: 'All screening questions copied to clipboard.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5" />
            <span>Screening Questions for {candidateName}</span>
          </DialogTitle>
          <DialogDescription>
            AI-generated screening questions tailored to this candidate's profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Generating screening questions...</span>
            </div>
          ) : (
            <>
              {questions.map((question, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge 
                          variant={question.category === 'technical' ? 'default' : 'secondary'}
                          className={question.category === 'technical' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}
                        >
                          {question.category}
                        </Badge>
                        <span className="text-sm text-gray-500">Question {index + 1}</span>
                      </div>
                      <p className="text-gray-900 font-medium mb-2">{question.question}</p>
                      <p className="text-sm text-gray-600">
                        <strong>Purpose:</strong> {question.purpose}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {questions.length > 0 && (
                <div className="flex justify-center">
                  <Button onClick={copyAllQuestions} variant="outline">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All Questions
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScreeningQuestionsModal;
