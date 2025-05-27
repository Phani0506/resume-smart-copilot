
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Star, Calendar, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface SearchResult {
  resume_id: string;
  relevance_score: number;
  justification: string;
  candidate_data: any;
}

const SearchInterface = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchRecentSearches();
    }
  }, [user]);

  const fetchRecentSearches = async () => {
    try {
      const { data, error } = await supabase
        .from('search_queries_new')
        .select('query')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentSearches(data?.map(item => item.query) || []);
    } catch (error) {
      console.error('Error fetching recent searches:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: 'Search query required',
        description: 'Please enter a search query to find candidates.',
        variant: 'destructive',
      });
      return;
    }

    setSearching(true);
    try {
      // Call semantic search edge function
      const { data, error } = await supabase.functions.invoke('semantic-search', {
        body: { 
          query: searchQuery,
          userId: user?.id
        }
      });

      if (error) throw error;

      setSearchResults(data.results || []);

      // Save search query
      await supabase
        .from('search_queries_new')
        .insert({
          user_id: user?.id,
          query: searchQuery,
          results_count: data.results?.length || 0
        });

      fetchRecentSearches();

      if (data.results?.length === 0) {
        toast({
          title: 'No results found',
          description: 'Try adjusting your search query or upload more resumes.',
        });
      }

    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Search failed',
        description: 'There was an error performing the search. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Search Candidates</h1>
        <p className="text-gray-600">
          Use natural language to find the perfect candidates from your resume database.
        </p>
      </div>

      {/* Search Interface */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Semantic Search</CardTitle>
          <CardDescription>
            Search using natural language. For example: "Senior React developer with 5+ years experience in fintech"
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Describe the ideal candidate..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="pl-12 text-lg py-6"
              />
            </div>
            <Button 
              onClick={handleSearch}
              disabled={searching}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-8"
            >
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Searches */}
      {recentSearches.length > 0 && (
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Recent Searches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((query, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchQuery(query)}
                  className="text-sm"
                >
                  <Clock className="h-3 w-3 mr-1" />
                  {query}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-900">
            Search Results ({searchResults.length})
          </h2>
          
          {searchResults.map((result, index) => (
            <Card key={result.resume_id} className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-1">
                          {result.candidate_data?.full_name || 'Unknown Candidate'}
                        </h3>
                        <p className="text-lg text-gray-600 mb-2">
                          {result.candidate_data?.professional_summary?.split('.')[0] || 'Professional'}
                        </p>
                        {result.candidate_data?.location && (
                          <div className="flex items-center space-x-1 text-sm text-gray-500 mb-3">
                            <MapPin className="h-4 w-4" />
                            <span>{result.candidate_data.location}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1">
                          <Star className="h-4 w-4 text-yellow-500 fill-current" />
                          <span className="text-sm font-medium">
                            {(result.relevance_score * 100).toFixed(0)}% match
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-2">Why this candidate matches:</p>
                      <p className="text-sm text-gray-700 bg-blue-50 p-3 rounded-lg">
                        {result.justification}
                      </p>
                    </div>

                    {result.candidate_data?.skills && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-600 mb-2">Key Skills:</p>
                        <div className="flex flex-wrap gap-2">
                          {result.candidate_data.skills.slice(0, 6).map((skill: string, skillIndex: number) => (
                            <Badge key={skillIndex} variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                              {skill}
                            </Badge>
                          ))}
                          {result.candidate_data.skills.length > 6 && (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                              +{result.candidate_data.skills.length - 6} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          #{index + 1} Best Match
                        </Badge>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button size="sm" variant="outline">
                          View Full Profile
                        </Button>
                        <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                          Contact Candidate
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {searchResults.length === 0 && !searching && (
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="py-16 text-center">
            <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Ready to find candidates</h3>
            <p className="text-gray-600 mb-6">
              Enter a search query above to find candidates using AI-powered semantic search.
            </p>
            <div className="text-sm text-gray-500">
              <p className="mb-2">Example searches:</p>
              <div className="space-y-1">
                <p>"Frontend developer with React and TypeScript experience"</p>
                <p>"Senior backend engineer familiar with microservices"</p>
                <p>"Data scientist with Python and machine learning background"</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SearchInterface;
