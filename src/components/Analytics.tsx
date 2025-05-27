
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { FileText, Users, Search, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface AnalyticsData {
  totalResumes: number;
  parsedResumes: number;
  totalSearches: number;
  skillsDistribution: Array<{ name: string; value: number }>;
  uploadTrend: Array<{ date: string; count: number }>;
}

const Analytics = () => {
  const [data, setData] = useState<AnalyticsData>({
    totalResumes: 0,
    parsedResumes: 0,
    totalSearches: 0,
    skillsDistribution: [],
    uploadTrend: []
  });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7300'];

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user]);

  const fetchAnalytics = async () => {
    try {
      // Get resume stats
      const { data: resumes, error: resumeError } = await supabase
        .from('resumes')
        .select('upload_status, parsed_data, created_at, skills_extracted')
        .eq('user_id', user?.id);

      if (resumeError) throw resumeError;

      // Get search stats
      const { data: searches, error: searchError } = await supabase
        .from('search_queries_new')
        .select('created_at')
        .eq('user_id', user?.id);

      if (searchError) throw searchError;

      // Process data
      const totalResumes = resumes?.length || 0;
      const parsedResumes = resumes?.filter(r => r.upload_status === 'parsed_success').length || 0;
      const totalSearches = searches?.length || 0;

      // Skills distribution
      const skillsMap = new Map<string, number>();
      resumes?.forEach(resume => {
        if (resume.parsed_data?.skills) {
          resume.parsed_data.skills.forEach((skill: string) => {
            const normalizedSkill = skill.toLowerCase().trim();
            skillsMap.set(normalizedSkill, (skillsMap.get(normalizedSkill) || 0) + 1);
          });
        }
        if (resume.skills_extracted) {
          resume.skills_extracted.forEach(skill => {
            const normalizedSkill = skill.toLowerCase().trim();
            skillsMap.set(normalizedSkill, (skillsMap.get(normalizedSkill) || 0) + 1);
          });
        }
      });

      const skillsDistribution = Array.from(skillsMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

      // Upload trend (last 7 days)
      const uploadTrend = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const count = resumes?.filter(resume => {
          const resumeDate = new Date(resume.created_at).toISOString().split('T')[0];
          return resumeDate === dateStr;
        }).length || 0;

        uploadTrend.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          count
        });
      }

      setData({
        totalResumes,
        parsedResumes,
        totalSearches,
        skillsDistribution,
        uploadTrend
      });

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics Dashboard</h1>
        <p className="text-gray-600">
          Insights and trends from your talent pool and recruitment activities.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid md:grid-cols-4 gap-6">
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-gray-700">Total Resumes</CardTitle>
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{data.totalResumes}</div>
            <p className="text-sm text-gray-500 mt-1">Uploaded to your pool</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-gray-700">Parsed Candidates</CardTitle>
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-indigo-600">{data.parsedResumes}</div>
            <p className="text-sm text-gray-500 mt-1">AI-processed profiles</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-gray-700">Total Searches</CardTitle>
              <Search className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{data.totalSearches}</div>
            <p className="text-sm text-gray-500 mt-1">Semantic searches performed</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-gray-700">Parse Rate</CardTitle>
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {data.totalResumes > 0 ? Math.round((data.parsedResumes / data.totalResumes) * 100) : 0}%
            </div>
            <p className="text-sm text-gray-500 mt-1">Successfully processed</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Skills Distribution */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Top Skills Distribution</CardTitle>
            <CardDescription>
              Most common skills across all candidates in your database
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.skillsDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.skillsDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {data.skillsDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                  <p>No skills data available</p>
                  <p className="text-sm">Upload and parse some resumes to see skills distribution</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload Trend */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Upload Trend (Last 7 Days)</CardTitle>
            <CardDescription>
              Number of resumes uploaded per day
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.uploadTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Additional Insights */}
      <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-white">Insights & Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2">Talent Pool Health</h4>
              <ul className="space-y-1 text-blue-100">
                <li>• {data.totalResumes} total candidates in your database</li>
                <li>• {data.parsedResumes} profiles ready for search</li>
                <li>• {data.skillsDistribution.length} unique skills identified</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Usage Patterns</h4>
              <ul className="space-y-1 text-blue-100">
                <li>• {data.totalSearches} semantic searches performed</li>
                <li>• Average {data.totalResumes > 0 ? (data.totalSearches / data.totalResumes).toFixed(1) : 0} searches per resume</li>
                <li>• {data.uploadTrend.reduce((sum, day) => sum + day.count, 0)} uploads in the last week</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;
