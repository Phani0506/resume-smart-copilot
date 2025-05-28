import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Search, 
  Filter, 
  MoreVertical, 
  Eye, 
  MessageSquare, 
  Download,
  Calendar,
  MapPin,
  Mail,
  Phone,
  Trash2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import OutreachModal from "./OutreachModal";
import ScreeningQuestionsModal from "./ScreeningQuestionsModal";

interface Resume {
  id: string;
  file_name: string;
  storage_path: string;
  upload_status: string;
  parsed_data: any;
  created_at: string;
}

interface Question {
  category: string;
  question: string;
  purpose: string;
}

const ResumeList = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resumeToDelete, setResumeToDelete] = useState<Resume | null>(null);
  const [outreachModalOpen, setOutreachModalOpen] = useState(false);
  const [questionsModalOpen, setQuestionsModalOpen] = useState(false);
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchResumes();
    }
  }, [user]);

  const fetchResumes = async () => {
    try {
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setResumes(data || []);
    } catch (error) {
      console.error('Error fetching resumes:', error);
      toast({
        title: 'Error',
        description: 'Failed to load resumes.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteResume = async () => {
    if (!resumeToDelete) return;

    try {
      const { error: storageError } = await supabase.storage
        .from('user-resumes')
        .remove([resumeToDelete.storage_path]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
      }

      const { error: dbError } = await supabase
        .from('resumes')
        .delete()
        .eq('id', resumeToDelete.id);

      if (dbError) throw dbError;

      toast({
        title: 'Success',
        description: 'Resume deleted successfully.',
      });

      fetchResumes();
    } catch (error) {
      console.error('Error deleting resume:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete resume.',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setResumeToDelete(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'parsed_success':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ready</Badge>;
      case 'parsing':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Processing</Badge>;
      case 'parsing_error':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Error</Badge>;
      case 'uploaded':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Pending Parse</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const generateScreeningQuestions = async (resume: Resume) => {
    if (!resume.parsed_data) {
      toast({
        title: 'Unable to generate questions',
        description: 'Resume data not available.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedResume(resume);
    setQuestionsLoading(true);
    setQuestionsModalOpen(true);
    setGeneratedQuestions([]);

    try {
      const { data, error } = await supabase.functions.invoke('generate-screening-questions', {
        body: { resumeData: resume.parsed_data }
      });

      if (error) throw error;

      console.log('Generated questions:', data.questions);
      setGeneratedQuestions(data.questions || []);
      
      toast({
        title: 'Questions Generated',
        description: 'Screening questions have been generated successfully.',
      });
    } catch (error) {
      console.error('Error generating questions:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate screening questions.',
        variant: 'destructive',
      });
      setGeneratedQuestions([]);
    } finally {
      setQuestionsLoading(false);
    }
  };

  const openOutreachModal = (resume: Resume) => {
    setSelectedResume(resume);
    setOutreachModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your resumes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">All Resumes</h1>
        <p className="text-gray-600">
          View and manage all uploaded candidate resumes. Click on any candidate to see detailed information.
        </p>
      </div>

      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search candidates by name, title, skills, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" className="flex items-center space-x-2">
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resume Cards */}
      <div className="space-y-4">
        {resumes.map((resume) => (
          <Card key={resume.id} className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-1">
                        {resume.parsed_data?.full_name || resume.file_name}
                      </h3>
                      <p className="text-lg text-gray-600 mb-2">
                        {resume.parsed_data?.professional_summary?.split('.')[0] || 'Professional'}
                      </p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                        {resume.parsed_data?.email && (
                          <div className="flex items-center space-x-1">
                            <Mail className="h-4 w-4" />
                            <span>{resume.parsed_data.email}</span>
                          </div>
                        )}
                        {resume.parsed_data?.phone_number && (
                          <div className="flex items-center space-x-1">
                            <Phone className="h-4 w-4" />
                            <span>{resume.parsed_data.phone_number}</span>
                          </div>
                        )}
                        {resume.parsed_data?.location && (
                          <div className="flex items-center space-x-1">
                            <MapPin className="h-4 w-4" />
                            <span>{resume.parsed_data.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(resume.upload_status)}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => {
                              setResumeToDelete(resume);
                              setDeleteDialogOpen(true);
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Resume
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  
                  {resume.parsed_data?.skills && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-2">Skills:</p>
                      <div className="flex flex-wrap gap-2">
                        {resume.parsed_data.skills.slice(0, 6).map((skill: string, index: number) => (
                          <Badge key={index} variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                            {skill}
                          </Badge>
                        ))}
                        {resume.parsed_data.skills.length > 6 && (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                            +{resume.parsed_data.skills.length - 6} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>Uploaded {new Date(resume.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline">
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => generateScreeningQuestions(resume)}
                        disabled={!resume.parsed_data}
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Generate Questions
                      </Button>
                      <Button 
                        size="sm" 
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                        onClick={() => openOutreachModal(resume)}
                        disabled={!resume.parsed_data}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Draft Outreach
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {resumes.length === 0 && (
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="py-16 text-center">
            <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No resumes uploaded yet</h3>
            <p className="text-gray-600 mb-6">
              Start by uploading some candidate resumes to see them here.
            </p>
            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              Upload First Resume
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resume</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{resumeToDelete?.file_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteResume} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OutreachModal 
        open={outreachModalOpen}
        onOpenChange={setOutreachModalOpen}
        resume={selectedResume}
      />

      <ScreeningQuestionsModal
        open={questionsModalOpen}
        onOpenChange={setQuestionsModalOpen}
        questions={generatedQuestions}
        candidateName={selectedResume?.parsed_data?.full_name || 'Candidate'}
        loading={questionsLoading}
      />
    </div>
  );
};

export default ResumeList;
