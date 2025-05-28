
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to truncate content to fit within token limits
function truncateContent(content: string, maxTokens = 4000): string {
  // Rough estimate: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) {
    return content;
  }
  
  // Try to cut at a reasonable point (end of sentence or paragraph)
  const truncated = content.substring(0, maxChars);
  const lastSentence = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');
  
  const cutPoint = Math.max(lastSentence, lastNewline);
  return cutPoint > maxChars * 0.8 ? truncated.substring(0, cutPoint + 1) : truncated;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { resumeId } = requestBody;
    console.log('Processing resume ID:', resumeId);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const groqApiKey = Deno.env.get('GROQ_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get resume from database
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .single();

    if (resumeError) {
      console.error('Resume fetch error:', resumeError);
      throw resumeError;
    }

    console.log('Resume found:', resume.file_name);

    // Download file from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('user-resumes')
      .download(resume.storage_path);

    if (fileError) {
      console.error('File download error:', fileError);
      throw fileError;
    }

    // Convert file to text
    const fullContent = await fileData.text();
    console.log('Original file content length:', fullContent.length);
    
    // Truncate content to fit within token limits
    const fileContent = truncateContent(fullContent);
    console.log('Truncated file content length:', fileContent.length);

    // Call Groq API for parsing with shorter, more focused prompt
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
            content: 'Extract key information from this resume. Return only valid JSON with no markdown formatting.'
          },
          {
            role: 'user',
            content: `Parse this resume and extract the following information as JSON:

${fileContent}

Return JSON with these exact fields:
{
  "full_name": "candidate name",
  "email": "email address", 
  "phone_number": "phone number",
  "linkedin_url": "linkedin profile",
  "location": "location/address",
  "professional_summary": "brief summary",
  "work_experience": [{"job_title": "", "company_name": "", "start_date": "", "end_date": "", "responsibilities": ""}],
  "education": [{"degree": "", "institution_name": "", "graduation_date": ""}],
  "skills": ["skill1", "skill2"],
  "projects": [{"project_name": "", "description": "", "technologies_used": []}]
}`
          }
        ],
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errorText);
      throw new Error(`Groq API error: ${groqResponse.status} - ${errorText}`);
    }

    const groqData = await groqResponse.json();
    console.log('Groq response received successfully');

    // Check if response has the expected structure
    if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
      console.error('Unexpected Groq response structure:', groqData);
      throw new Error('Invalid response from AI service');
    }

    const parsedDataText = groqData.choices[0].message.content;
    console.log('Raw AI response length:', parsedDataText.length);
    
    // Clean up the response and parse JSON
    let parsedData;
    try {
      // Remove any markdown formatting and clean up
      const cleanedText = parsedDataText
        .replace(/```json\n?|\n?```/g, '')
        .replace(/```\n?|\n?```/g, '')
        .trim();
      
      parsedData = JSON.parse(cleanedText);
      console.log('Successfully parsed JSON data');
      
      // Validate that we have at least a name
      if (!parsedData.full_name) {
        parsedData.full_name = 'Unknown Candidate';
      }
      
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Failed to parse text:', parsedDataText);
      
      // Fallback: create basic structure with available info
      parsedData = {
        full_name: 'Unknown Candidate',
        email: '',
        phone_number: '',
        linkedin_url: '',
        location: '',
        professional_summary: 'Resume parsing encountered an issue',
        work_experience: [],
        education: [],
        skills: [],
        projects: []
      };
    }

    // Extract skills for quick access
    const skillsExtracted = Array.isArray(parsedData.skills) ? parsedData.skills : [];

    // Update resume with parsed data
    const { error: updateError } = await supabase
      .from('resumes')
      .update({
        parsed_data: parsedData,
        skills_extracted: skillsExtracted,
        upload_status: 'parsed_success'
      })
      .eq('id', resumeId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    console.log('Resume parsing completed successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      parsedData,
      message: 'Resume parsed successfully' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Parse resume error:', error);
    
    // Update status to error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { resumeId } = requestBody;
      await supabase
        .from('resumes')
        .update({ upload_status: 'parsing_error' })
        .eq('id', resumeId);
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }

    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Resume parsing failed. Please try uploading again.' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
