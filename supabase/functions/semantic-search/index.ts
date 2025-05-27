
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, userId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const groqApiKey = Deno.env.get('GROQ_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all user's resumes with parsed data
    const { data: resumes, error: resumeError } = await supabase
      .from('resumes')
      .select('id, parsed_data')
      .eq('user_id', userId)
      .eq('upload_status', 'parsed_success')
      .not('parsed_data', 'is', null);

    if (resumeError) throw resumeError;

    if (!resumes || resumes.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare candidate data for AI analysis
    const candidateProfiles = resumes.map(resume => ({
      resume_id: resume.id,
      ...resume.parsed_data
    }));

    // Call Groq API for semantic search
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: 'You are a talent sourcing expert. Analyze the search query and candidate profiles to find the best matches. Return ONLY valid JSON without any markdown formatting.'
          },
          {
            role: 'user',
            content: `Search query: "${query}"

Candidate profiles:
${JSON.stringify(candidateProfiles, null, 2)}

Analyze each candidate against the search query and return the top 10 most relevant matches as JSON array:
[
  {
    "resume_id": "string",
    "relevance_score": number (0-1),
    "justification": "string (1-2 sentences explaining why this candidate matches)",
    "candidate_data": {candidate object}
  }
]

Sort by relevance_score descending. Only include candidates with relevance_score > 0.3.`
          }
        ],
        temperature: 0.1,
      }),
    });

    const groqData = await groqResponse.json();
    const resultsText = groqData.choices[0].message.content;
    
    // Clean up the response and parse JSON
    let searchResults;
    try {
      const cleanedText = resultsText.replace(/```json\n?|\n?```/g, '').trim();
      searchResults = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Ensure results is an array
    if (!Array.isArray(searchResults)) {
      searchResults = [];
    }

    return new Response(JSON.stringify({ results: searchResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Semantic search error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
