
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Search, FileText, BarChart3 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ResumeUpload from "@/components/ResumeUpload";
import ResumeList from "@/components/ResumeList";
import SearchInterface from "@/components/SearchInterface";
import Analytics from "@/components/Analytics";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState({
    totalResumes: 0,
    parsedCandidates: 0,
    recentSearches: 0
  });
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      // Get resume count
      const { data: resumes, error: resumeError } = await supabase
        .from('resumes')
        .select('upload_status')
        .eq('user_id', user?.id);

      if (resumeError) throw resumeError;

      // Get search count
      const { data: searches, error: searchError } = await supabase
        .from('search_queries_new')
        .select('id')
        .eq('user_id', user?.id);

      if (searchError) throw searchError;

      setStats({
        totalResumes: resumes?.length || 0,
        parsedCandidates: resumes?.filter(r => r.upload_status === 'parsed_success').length || 0,
        recentSearches: searches?.length || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="flex">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome back to TalentCopilot
              </h1>
              <p className="text-gray-600">
                Manage your talent pool and find the perfect candidates with AI-powered insights.
              </p>
            </div>

            {/* Content based on active tab */}
            {activeTab === "overview" && (
              <div className="space-y-8">
                {/* Quick Stats */}
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-gray-700">Total Resumes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-blue-600">{stats.totalResumes}</div>
                      <p className="text-sm text-gray-500 mt-1">
                        {stats.totalResumes === 0 ? 'Start by uploading resumes' : 'In your talent pool'}
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-gray-700">Parsed Candidates</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-indigo-600">{stats.parsedCandidates}</div>
                      <p className="text-sm text-gray-500 mt-1">AI-processed profiles</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-gray-700">Recent Searches</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-green-600">{stats.recentSearches}</div>
                      <p className="text-sm text-gray-500 mt-1">Semantic searches performed</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Actions */}
                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>Get started with these common tasks</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Button 
                        className="h-20 flex flex-col items-center justify-center space-y-2 bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                        onClick={() => setActiveTab("upload")}
                      >
                        <Upload className="h-6 w-6" />
                        <span>Upload Resumes</span>
                      </Button>
                      
                      <Button 
                        variant="outline"
                        className="h-20 flex flex-col items-center justify-center space-y-2 border-2 hover:bg-blue-50"
                        onClick={() => setActiveTab("search")}
                      >
                        <Search className="h-6 w-6" />
                        <span>Search Candidates</span>
                      </Button>
                      
                      <Button 
                        variant="outline"
                        className="h-20 flex flex-col items-center justify-center space-y-2 border-2 hover:bg-indigo-50"
                        onClick={() => setActiveTab("resumes")}
                      >
                        <FileText className="h-6 w-6" />
                        <span>View All Resumes</span>
                      </Button>
                      
                      <Button 
                        variant="outline"
                        className="h-20 flex flex-col items-center justify-center space-y-2 border-2 hover:bg-green-50"
                        onClick={() => setActiveTab("analytics")}
                      >
                        <BarChart3 className="h-6 w-6" />
                        <span>View Analytics</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Getting Started */}
                <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-white">Getting Started</CardTitle>
                    <CardDescription className="text-blue-100">
                      Follow these steps to set up your talent management system
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold">1</span>
                        </div>
                        <span>Upload your first batch of resumes</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold">2</span>
                        </div>
                        <span>Let AI parse and analyze candidate information</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold">3</span>
                        </div>
                        <span>Start searching for candidates using natural language</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "upload" && <ResumeUpload />}
            {activeTab === "resumes" && <ResumeList />}
            {activeTab === "search" && <SearchInterface />}
            {activeTab === "analytics" && <Analytics />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
