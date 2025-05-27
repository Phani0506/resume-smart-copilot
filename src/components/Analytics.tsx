
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, FileText, Search, TrendingUp, MapPin } from "lucide-react";

const Analytics = () => {
  // Mock data - will be replaced with real data from Supabase
  const topSkills = [
    { skill: "JavaScript", count: 12, percentage: 85 },
    { skill: "React", count: 10, percentage: 71 },
    { skill: "Python", count: 9, percentage: 64 },
    { skill: "TypeScript", count: 8, percentage: 57 },
    { skill: "Node.js", count: 7, percentage: 50 },
    { skill: "AWS", count: 6, percentage: 43 },
    { skill: "SQL", count: 6, percentage: 43 },
    { skill: "Docker", count: 5, percentage: 36 },
    { skill: "Git", count: 5, percentage: 36 },
    { skill: "MongoDB", count: 4, percentage: 29 }
  ];

  const locationDistribution = [
    { location: "San Francisco, CA", count: 4 },
    { location: "New York, NY", count: 3 },
    { location: "Austin, TX", count: 2 },
    { location: "Seattle, WA", count: 2 },
    { location: "Chicago, IL", count: 1 },
    { location: "Boston, MA", count: 1 },
    { location: "Remote", count: 1 }
  ];

  const experienceLevels = [
    { level: "Senior (5+ years)", count: 6, percentage: 43 },
    { level: "Mid-level (3-5 years)", count: 5, percentage: 36 },
    { level: "Junior (1-3 years)", count: 2, percentage: 14 },
    { level: "Entry level (<1 year)", count: 1, percentage: 7 }
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Talent Pool Analytics</h1>
        <p className="text-gray-600">
          Insights and trends from your candidate database to help you understand your talent pool.
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid md:grid-cols-4 gap-6">
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Resumes</p>
                <p className="text-3xl font-bold text-blue-600">14</p>
              </div>
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">+3 this week</p>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg. Skills per Candidate</p>
                <p className="text-3xl font-bold text-indigo-600">8.5</p>
              </div>
              <BarChart3 className="h-8 w-8 text-indigo-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">Above industry average</p>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Search Queries</p>
                <p className="text-3xl font-bold text-green-600">28</p>
              </div>
              <Search className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">12 unique searches</p>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Match Rate</p>
                <p className="text-3xl font-bold text-purple-600">76%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">Successful matches</p>
          </CardContent>
        </Card>
      </div>

      {/* Skills Distribution */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Top Skills in Your Talent Pool</CardTitle>
          <CardDescription>
            Most common skills found across all candidate resumes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topSkills.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center">
                    <span className="text-sm font-semibold text-blue-600">{index + 1}</span>
                  </div>
                  <span className="font-medium text-gray-900">{item.skill}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600 w-12 text-right">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Experience Levels */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Experience Distribution</CardTitle>
            <CardDescription>
              Breakdown of experience levels in your candidate pool
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {experienceLevels.map((level, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{level.level}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"
                        style={{ width: `${level.percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 w-8 text-right">{level.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Location Distribution */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Geographic Distribution</CardTitle>
            <CardDescription>
              Where your candidates are located
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {locationDistribution.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">{item.location}</span>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {item.count}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trends Card */}
      <Card className="bg-gradient-to-r from-purple-600 to-pink-600 text-white border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-white">Talent Pool Insights</CardTitle>
          <CardDescription className="text-purple-100">
            Key observations from your candidate database
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold text-white">Trending Skills</h4>
              <ul className="space-y-2 text-purple-100">
                <li>• TypeScript adoption increasing (57% of developers)</li>
                <li>• Strong cloud expertise with AWS dominance</li>
                <li>• High React proficiency in frontend developers</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-white">Recommendations</h4>
              <ul className="space-y-2 text-purple-100">
                <li>• Consider recruiting in Austin/Seattle markets</li>
                <li>• Focus on candidates with modern JS stack</li>
                <li>• Senior talent pool is well-balanced</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;
