
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  Search, 
  Brain, 
  Sparkles, 
  Clock, 
  Star,
  MapPin,
  Mail,
  Phone,
  ExternalLink,
  MessageSquare
} from "lucide-react";

const SearchInterface = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [recentSearches] = useState([
    "Senior Python developer with AWS experience",
    "Product manager with fintech background",
    "Frontend developer React TypeScript",
    "UX designer with mobile app experience"
  ]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    
    // Simulate AI search
    setTimeout(() => {
      const mockResults = [
        {
          id: 1,
          name: "John Smith",
          title: "Senior Software Engineer",
          email: "john.smith@email.com",
          phone: "+1 (555) 123-4567",
          location: "San Francisco, CA",
          relevanceScore: 0.95,
          matchingSkills: ["Python", "AWS", "Docker", "Kubernetes"],
          summary: "Highly experienced Python developer with 5+ years of AWS cloud architecture experience. Strong background in microservices and containerization.",
          justification: "Perfect match for your query - senior Python developer with extensive AWS experience including EC2, S3, Lambda, and container orchestration."
        },
        {
          id: 2,
          name: "Sarah Johnson",
          title: "Full Stack Developer",
          email: "sarah.johnson@email.com", 
          phone: "+1 (555) 987-6543",
          location: "Austin, TX",
          relevanceScore: 0.87,
          matchingSkills: ["Python", "AWS", "React", "PostgreSQL"],
          summary: "Versatile full-stack developer with strong Python backend skills and modern AWS deployment experience.",
          justification: "Strong Python skills with AWS experience, though more focused on full-stack development rather than pure backend architecture."
        },
        {
          id: 3,
          name: "Michael Chen",
          title: "DevOps Engineer",
          email: "michael.chen@email.com",
          phone: "+1 (555) 456-7890", 
          location: "Seattle, WA",
          relevanceScore: 0.82,
          matchingSkills: ["Python", "AWS", "Terraform", "CI/CD"],
          summary: "DevOps specialist with strong Python automation skills and comprehensive AWS infrastructure experience.",
          justification: "Excellent AWS expertise with Python scripting skills, though more infrastructure-focused than application development."
        }
      ];
      
      setSearchResults(mockResults);
      setIsSearching(false);
    }, 2000);
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 0.9) return "text-green-600";
    if (score >= 0.8) return "text-yellow-600";
    return "text-orange-600";
  };

  const getRelevanceBadge = (score: number) => {
    if (score >= 0.9) return "bg-green-100 text-green-800";
    if (score >= 0.8) return "bg-yellow-100 text-yellow-800";
    return "bg-orange-100 text-orange-800";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI-Powered Candidate Search</h1>
        <p className="text-gray-600">
          Use natural language to find the perfect candidates from your resume database.
        </p>
      </div>

      {/* Search Interface */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Brain className="h-5 w-5 text-blue-600" />
            <span>Semantic Search</span>
          </CardTitle>
          <CardDescription>
            Describe what you're looking for in natural language. Our AI will understand and find matching candidates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative">
              <Textarea
                placeholder="Example: Senior Python developer with AWS experience, preferably in San Francisco, with microservices and container orchestration skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-h-[100px] pr-12 resize-none"
              />
              <Button
                className="absolute bottom-3 right-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            {/* Recent Searches */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Recent searches:</p>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((search, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setSearchQuery(search)}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    {search}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {isSearching && (
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">AI is analyzing your query...</h3>
            <p className="text-gray-600">
              Searching through candidate profiles and matching relevant skills and experience.
            </p>
          </CardContent>
        </Card>
      )}

      {searchResults.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Search Results ({searchResults.length} candidates found)
            </h2>
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
              <Sparkles className="h-3 w-3 mr-1" />
              AI-Ranked
            </Badge>
          </div>

          <div className="space-y-4">
            {searchResults.map((candidate) => (
              <Card key={candidate.id} className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-xl font-semibold text-gray-900">{candidate.name}</h3>
                        <Badge className={`${getRelevanceBadge(candidate.relevanceScore)} hover:${getRelevanceBadge(candidate.relevanceScore)}`}>
                          <Star className="h-3 w-3 mr-1" />
                          {Math.round(candidate.relevanceScore * 100)}% match
                        </Badge>
                      </div>
                      <p className="text-lg text-gray-600 mb-3">{candidate.title}</p>
                      
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mb-4">
                        <div className="flex items-center space-x-1">
                          <Mail className="h-4 w-4" />
                          <span>{candidate.email}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Phone className="h-4 w-4" />
                          <span>{candidate.phone}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MapPin className="h-4 w-4" />
                          <span>{candidate.location}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-gray-700 mb-3">{candidate.summary}</p>
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-blue-800">
                        <strong>AI Analysis:</strong> {candidate.justification}
                      </p>
                    </div>
                    
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Matching skills:</p>
                      <div className="flex flex-wrap gap-2">
                        {candidate.matchingSkills.map((skill: string, index: number) => (
                          <Badge key={index} className="bg-green-100 text-green-800 hover:bg-green-100">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1">
                      <span className={`text-sm font-medium ${getRelevanceColor(candidate.relevanceScore)}`}>
                        Relevance Score: {Math.round(candidate.relevanceScore * 100)}%
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Profile
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
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {searchResults.length === 0 && !isSearching && (
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="py-16 text-center">
            <Brain className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Ready to find your next hire?</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Describe the ideal candidate using natural language, and our AI will search through your resume database to find the best matches.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-sm text-gray-600 mb-2"><strong>Example queries:</strong></p>
              <ul className="text-sm text-gray-500 space-y-1">
                <li>• "Senior React developer with TypeScript experience"</li>
                <li>• "Product manager with B2B SaaS background"</li>
                <li>• "Full-stack engineer familiar with AWS and Node.js"</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SearchInterface;
