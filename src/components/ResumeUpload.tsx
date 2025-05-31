import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface UploadedFile {
  name: string;
  size: string;
  status: 'uploading' | 'uploaded' | 'parsing' | 'parsed' | 'error';
  id?: string;
  errorMessage?: string;
}

const ResumeUpload = () => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    handleFiles(files);
  };

  const isValidFileType = (file: File) => {
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'text/plain' // .txt for testing
    ];
    
    const validExtensions = ['.pdf', '.docx', '.doc', '.txt'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    console.log('Checking file:', file.name, 'Type:', file.type, 'Extension:', fileExtension);
    
    return validTypes.includes(file.type) || validExtensions.includes(fileExtension);
  };

  const handleFiles = (files: FileList) => {
    Array.from(files).forEach(file => {
      console.log('Processing file:', file.name, 'Type:', file.type, 'Size:', file.size);
      
      if (isValidFileType(file)) {
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
          toast({
            title: "File too large",
            description: `${file.name} is larger than 10MB. Please upload a smaller file.`,
            variant: "destructive",
          });
          return;
        }
        uploadFile(file);
      } else {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not supported. Please upload PDF, DOCX, DOC, or TXT files.`,
          variant: "destructive",
        });
      }
    });
  };

  const uploadFile = async (file: File) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to upload resumes.",
        variant: "destructive",
      });
      return;
    }

    const fileData: UploadedFile = {
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
      status: 'uploading',
    };

    setUploadedFiles(prev => [...prev, fileData]);

    try {
      // Create unique filename with proper extension
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      console.log('Uploading file:', file.name, 'Type:', file.type, 'Size:', file.size, 'Path:', filePath);

      // Upload to Supabase Storage with proper content type detection
      let contentType = file.type;
      if (!contentType || contentType === 'application/octet-stream') {
        // Fallback content type detection based on extension
        const ext = fileExt.toLowerCase();
        switch (ext) {
          case 'pdf':
            contentType = 'application/pdf';
            break;
          case 'docx':
            contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            break;
          case 'doc':
            contentType = 'application/msword';
            break;
          case 'txt':
            contentType = 'text/plain';
            break;
          default:
            contentType = 'application/octet-stream';
        }
      }

      const { data: storageData, error: storageError } = await supabase.storage
        .from('user-resumes')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: contentType
        });

      if (storageError) {
        console.error('Storage error:', storageError);
        throw storageError;
      }

      console.log('File uploaded to storage:', storageData);

      // Insert record to database
      const { data: resumeData, error: dbError } = await supabase
        .from('resumes')
        .insert({
          user_id: user.id,
          file_name: file.name,
          storage_path: filePath,
          content_type: contentType,
          upload_status: 'uploaded'
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        throw dbError;
      }

      console.log('Resume record created:', resumeData);

      setUploadedFiles(prev => 
        prev.map(f => 
          f.name === file.name ? { ...f, status: 'uploaded', id: resumeData.id } : f
        )
      );

      // Start parsing
      setUploadedFiles(prev => 
        prev.map(f => 
          f.name === file.name ? { ...f, status: 'parsing' } : f
        )
      );

      // Add delay before parsing to ensure file is fully uploaded
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('Starting AI parsing for resume:', resumeData.id);

      // Call parsing edge function
      const { data: parseResult, error: parseError } = await supabase.functions.invoke('parse-resume', {
        body: { resumeId: resumeData.id }
      });

      console.log('Parse result:', parseResult, 'Parse error:', parseError);

      if (parseError) {
        console.error('Parse function error:', parseError);
        throw new Error(`AI parsing failed: ${parseError.message}`);
      }

      if (parseResult?.error) {
        console.error('Parse result error:', parseResult.error);
        throw new Error(`AI parsing failed: ${parseResult.error}`);
      }

      if (!parseResult?.success) {
        throw new Error('AI parsing completed but no data was extracted');
      }

      setUploadedFiles(prev => 
        prev.map(f => 
          f.name === file.name ? { ...f, status: 'parsed' } : f
        )
      );

      toast({
        title: "Resume processed successfully",
        description: `${file.name} has been uploaded and parsed. ${parseResult?.skillsCount || 0} skills extracted.`,
      });

    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setUploadedFiles(prev => 
        prev.map(f => 
          f.name === file.name ? { ...f, status: 'error', errorMessage } : f
        )
      );
      
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploading':
        return <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />;
      case 'uploaded':
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
      case 'parsing':
        return <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />;
      case 'parsed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string, errorMessage?: string) => {
    switch (status) {
      case 'uploading':
        return 'Uploading to secure storage...';
      case 'uploaded':
        return 'Uploaded - Preparing for AI parsing';
      case 'parsing':
        return 'AI extracting candidate information...';
      case 'parsed':
        return 'Ready for search';
      case 'error':
        return `Error: ${errorMessage || 'Upload failed'}`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Resumes</h1>
        <p className="text-gray-600">
          Upload candidate resumes (PDF, DOCX, DOC formats) to automatically extract and analyze information with AI.
        </p>
      </div>

      {/* Upload Area */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Upload Resume Files</CardTitle>
          <CardDescription>
            Drag and drop PDF, DOCX, or DOC files, or click to browse. Files will be automatically processed with AI. Maximum file size: 10MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Drop resume files here
            </h3>
            <p className="text-gray-600 mb-4">
              Supports PDF, DOCX, and DOC files up to 10MB each
            </p>
            <Button 
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              onClick={() => document.getElementById('file-input')?.click()}
            >
              Browse Files
            </Button>
            <input
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* Upload Progress */}
      {uploadedFiles.length > 0 && (
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Upload Progress</CardTitle>
            <CardDescription>
              Track the upload and AI processing status of your resume files.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-8 w-8 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">{file.size}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(file.status)}
                    <span className="text-sm font-medium text-gray-700">
                      {getStatusText(file.status, file.errorMessage)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-white">What happens next?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-semibold">1</span>
              </div>
              <div>
                <p className="font-medium">Secure Upload</p>
                <p className="text-blue-100 text-sm">Files are securely uploaded to your private storage</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-semibold">2</span>
              </div>
              <div>
                <p className="font-medium">AI Processing</p>
                <p className="text-blue-100 text-sm">Advanced AI extracts structured data from each resume including name, skills, experience, and education</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-semibold">3</span>
              </div>
              <div>
                <p className="font-medium">Ready to Search</p>
                <p className="text-blue-100 text-sm">Candidates become searchable using natural language queries</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResumeUpload;
