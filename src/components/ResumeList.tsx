
import { useState } from "react";
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
  Phone
} from "lucide-react";

const ResumeList = () => {
  const [searchQuery, setSearchQuery] = useState("");
  
  // Mock data - will be replaced with real data from Supabase
  const mockResumes = [
    {
      id: 1,
      name: "John Smith",
      title: "Senior Software Engineer",
      email: "john.smith@email.com",
      phone: "+1 (555) 123-4567",
      location: "San Francisco, CA",
      uploadDate: "2024-01-15",
      skills: ["React", "TypeScript", "Node.js", "AWS", "Python"],
      experience: "5+ years",
      status: "parsed"
    },
    {
      id: 2,
      name: "Sarah Johnson",
      title: "Product Manager",
      email: "sarah.johnson@email.com",
      phone: "+1 (555) 987-6543",
      location: "New York, NY",
      uploadDate: "2024-01-14",
      skills: ["Product Strategy", "Agile", "Analytics", "Leadership"],
      experience: "7+ years",
      status: "parsing"
    },
    {
      id: 3,
      name: "Michael Chen",
      title: "UX Designer",
      email: "michael.chen@email.com",
      phone: "+1 (555) 456-7890",
      location: "Austin, TX",
      uploadDate: "2024-01-13",
      skills: ["Figma", "User Research", "Prototyping", "Design Systems"],
      experience: "4+ years",
      status: "parsed"
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'parsed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ready</Badge>;
      case 'parsing':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Processing</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Error</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">All Resumes</h1>
        <p className="text-gray-600">
          View and manage all uploaded candidate resumes. Click on any candidate to see detailed information.
        </p>
      </div>

      {/* Search and Filters */}
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
        {mockResumes.map((resume) => (
          <Card key={resume.id} className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-1">{resume.name}</h3>
                      <p className="text-lg text-gray-600 mb-2">{resume.title}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                        <div className="flex items-center space-x-1">
                          <Mail className="h-4 w-4" />
                          <span>{resume.email}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Phone className="h-4 w-4" />
                          <span>{resume.phone}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MapPin className="h-4 w-4" />
                          <span>{resume.location}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(resume.status)}
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-2">Skills:</p>
                    <div className="flex flex-wrap gap-2">
                      {resume.skills.map((skill, index) => (
                        <Badge key={index} variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>Uploaded {resume.uploadDate}</span>
                      </div>
                      <span>•</span>
                      <span>{resume.experience} experience</span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline">
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                      <Button size="sm" variant="outline">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Generate Questions
                      </Button>
                      <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
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

      {/* Empty State (when no resumes) */}
      {mockResumes.length === 0 && (
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
    </div>
  );
};

export default ResumeList;
