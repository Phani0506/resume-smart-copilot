
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface UploadedFile {
  name: string;
  size: string;
  status: 'uploading' | 'uploaded' | 'parsing' | 'parsed' | 'error';
  id?: string;
  errorMessage?: string;
  retryCount?: number;
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
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain'
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
        if (file.size > 10 * 1024 * 1024) {
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

  const uploadFile = async (file: File, isRetry = false) => {
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
      retryCount: 0,
    };

    if (!isRetry) {
      setUploadedFiles(prev => [...prev, fileData]);
    }

    try {
      // Create unique filename
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      console.log('Uploading file:', file.name, 'Path:', filePath);

      // Determine content type
      let contentType = file.type;
      if (!contentType || contentType === 'application/octet-stream') {
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

      // Upload to storage
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

      // Create database record
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

      // Start parsing with delay
      setUploadedFiles(prev => 
        prev.map(f => 
          f.name === file.name ? { ...f, status: 'parsing' } : f
        )
      );

      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('Starting parsing for resume:', resumeData.id);

      // Call parsing function with timeout
      const parsePromise = supabase.functions.invoke('parse-resume', {
        body: { resumeId: resumeData.id }
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Parsing timeout')), 60000)
      );

      const { data: parseResult, error: parseError } = await Promise.race([
        parsePromise,
        timeoutPromise
      ]) as any;

      if (parseError) {
        console.error('Parse error:', parseError);
        throw new Error(`Parsing failed: ${parseError.message}`);
      }

      if (parseResult?.error) {
        console.error('Parse result error:', parseResult.error);
        throw new Error(`Parsing failed: ${parseResult.error}`);
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
      console.error('Upload/Parse error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      
      setUploadedFiles(prev => 
        prev.map(f => 
          f.name === file.name ? { 
            ...f, 
            status: 'error', 
            errorMessage,
            retryCount: (f.retryCount || 0) + 1
          } : f
        )
      );
      
      toast({
        title: "Processing failed",
        description: `${file.name}: ${errorMessage}`,
        variant: "destructive",
      });
    }
  };

  const retryUpload = (fileName: string) => {
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput?.files) {
      const file = Array.from(fileInput.files).find(f => f.name === fileName);
      if (file) {
        uploadFile(file, true);
      }
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
        return 'Uploaded - Starting AI parsing...';
      case 'parsing':
        return 'AI extracting information...';
      case 'parsed':
        return 'Successfully processed';
      case 'error':
        return `Error: ${errorMessage || 'Processing failed'}`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Resumes</h1>
        <p className="text-gray-600">
          Upload candidate resumes (PDF, DOCX, DOC formats) for AI-powered extraction and analysis.
        </p>
      </div>

      {/* Upload Area */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Upload Resume Files</CardTitle>
          <CardDescription>
            Drag and drop files or click to browse. Maximum file size: 10MB.
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
            <CardTitle>Processing Status</CardTitle>
            <CardDescription>
              Track upload and AI processing progress.
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
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(file.status)}
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-700">
                        {getStatusText(file.status, file.errorMessage)}
                      </p>
                      {file.status === 'error' && file.retryCount && file.retryCount < 3 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retryUpload(file.name)}
                          className="mt-1"
                        >
                          Retry
                        </Button>
                      )}
                    </div>
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
          <CardTitle className="text-white">Processing Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-semibold">1</span>
              </div>
              <div>
                <p className="font-medium">Secure Upload</p>
                <p className="text-blue-100 text-sm">Files uploaded to encrypted storage</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-semibold">2</span>
              </div>
              <div>
                <p className="font-medium">AI Extraction</p>
                <p className="text-blue-100 text-sm">AI extracts name, skills, experience, and education</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-semibold">3</span>
              </div>
              <div>
                <p className="font-medium">Ready for Search</p>
                <p className="text-blue-100 text-sm">Candidates become searchable immediately</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResumeUpload;
