
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  Mail, 
  Phone, 
  MapPin, 
  Linkedin, 
  Briefcase, 
  GraduationCap, 
  Code,
  FolderOpen,
  Download,
  X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ResumeViewerProps {
  resume: any;
  open: boolean;
  onClose: () => void;
}

const ResumeViewer = ({ resume, open, onClose }: ResumeViewerProps) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && resume) {
      loadPdfUrl();
    }
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [open, resume]);

  const loadPdfUrl = async () => {
    if (!resume?.storage_path) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('user-resumes')
        .download(resume.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setPdfUrl(url);
    } catch (error) {
      console.error('Error loading PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to load resume file.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadResume = async () => {
    if (!pdfUrl) return;
    
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = resume.file_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!open) return null;

  const parsedData = resume.parsed_data;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Resume Details</h2>
            <p className="text-gray-600">{resume.file_name}</p>
          </div>
          <div className="flex items-center space-x-2">
            {pdfUrl && (
              <Button onClick={downloadResume} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
            <Button onClick={onClose} variant="ghost" size="sm">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Parsed Data */}
          <div className="w-1/2 p-6 overflow-y-auto border-r">
            {parsedData ? (
              <div className="space-y-6">
                {/* Personal Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <FileText className="h-5 w-5" />
                      <span>Personal Information</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {parsedData.full_name && (
                      <div>
                        <h3 className="text-xl font-semibold">{parsedData.full_name}</h3>
                      </div>
                    )}
                    {parsedData.email && (
                      <div className="flex items-center space-x-2 text-gray-600">
                        <Mail className="h-4 w-4" />
                        <span>{parsedData.email}</span>
                      </div>
                    )}
                    {parsedData.phone_number && (
                      <div className="flex items-center space-x-2 text-gray-600">
                        <Phone className="h-4 w-4" />
                        <span>{parsedData.phone_number}</span>
                      </div>
                    )}
                    {parsedData.location && (
                      <div className="flex items-center space-x-2 text-gray-600">
                        <MapPin className="h-4 w-4" />
                        <span>{parsedData.location}</span>
                      </div>
                    )}
                    {parsedData.linkedin_url && (
                      <div className="flex items-center space-x-2 text-gray-600">
                        <Linkedin className="h-4 w-4" />
                        <a href={parsedData.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          LinkedIn Profile
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Professional Summary */}
                {parsedData.professional_summary && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Professional Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700">{parsedData.professional_summary}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Skills */}
                {parsedData.skills && parsedData.skills.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Code className="h-5 w-5" />
                        <span>Skills</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {parsedData.skills.map((skill: string, index: number) => (
                          <Badge key={index} variant="secondary">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Work Experience */}
                {parsedData.work_experience && parsedData.work_experience.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Briefcase className="h-5 w-5" />
                        <span>Work Experience</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {parsedData.work_experience.map((exp: any, index: number) => (
                        <div key={index} className="border-l-2 border-blue-200 pl-4">
                          <h4 className="font-semibold">{exp.position}</h4>
                          <p className="text-blue-600">{exp.company}</p>
                          <p className="text-sm text-gray-500">{exp.duration}</p>
                          {exp.description && (
                            <p className="text-gray-700 mt-2">{exp.description}</p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Education */}
                {parsedData.education && parsedData.education.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <GraduationCap className="h-5 w-5" />
                        <span>Education</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {parsedData.education.map((edu: any, index: number) => (
                        <div key={index} className="border-l-2 border-green-200 pl-4">
                          <h4 className="font-semibold">{edu.degree}</h4>
                          <p className="text-green-600">{edu.institution}</p>
                          <p className="text-sm text-gray-500">{edu.field_of_study}</p>
                          {edu.graduation_year && (
                            <p className="text-sm text-gray-500">{edu.graduation_year}</p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Projects */}
                {parsedData.projects && parsedData.projects.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <FolderOpen className="h-5 w-5" />
                        <span>Projects</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {parsedData.projects.map((project: any, index: number) => (
                        <div key={index} className="border-l-2 border-purple-200 pl-4">
                          <h4 className="font-semibold">{project.name}</h4>
                          <p className="text-gray-700">{project.description}</p>
                          {project.technologies && project.technologies.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {project.technologies.map((tech: string, techIndex: number) => (
                                <Badge key={techIndex} variant="outline" className="text-xs">
                                  {tech}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="py-16 text-center">
                  <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Resume not parsed yet</h3>
                  <p className="text-gray-600">
                    This resume hasn't been processed by AI yet. The parsing might still be in progress.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Panel - PDF Viewer */}
          <div className="w-1/2 p-6">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Original Resume</CardTitle>
                <CardDescription>View the original uploaded resume file</CardDescription>
              </CardHeader>
              <CardContent className="h-full">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading resume...</p>
                    </div>
                  </div>
                ) : pdfUrl ? (
                  <iframe
                    src={pdfUrl}
                    className="w-full h-full border rounded-lg"
                    title="Resume PDF"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">Unable to load resume</h3>
                      <p className="text-gray-600">
                        The resume file could not be loaded for preview.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResumeViewer;
