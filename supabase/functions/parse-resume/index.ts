
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to truncate content to fit within token limits
function truncateContent(content: string, maxTokens = 3000): string {
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
  return cutPoint > maxChars * 0.7 ? truncated.substring(0, cutPoint + 1) : truncated;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let requestBody;
  let resumeId;

  try {
    requestBody = await req.json();
    resumeId = requestBody.resumeId;
    console.log('Processing resume ID:', resumeId);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const groqApiKey = Deno.env.get('GROQ_API_KEY')!;
    
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get resume from database
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .single();

    if (resumeError) {
      console.error('Resume fetch error:', resumeError);
      throw new Error(`Resume not found: ${resumeError.message}`);
    }

    console.log('Resume found:', resume.file_name, 'Status:', resume.upload_status);

    // Download file from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('user-resumes')
      .download(resume.storage_path);

    if (fileError) {
      console.error('File download error:', fileError);
      throw new Error(`File download failed: ${fileError.message}`);
    }

    // Convert file to text
    const fullContent = await fileData.text();
    console.log('Original file content length:', fullContent.length);
    
    // Truncate content to fit within token limits
    const fileContent = truncateContent(fullContent, 2500);
    console.log('Truncated file content length:', fileContent.length);

    // Call Groq API for parsing with optimized prompt
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
            content: 'You are a resume parser. Extract information from resumes and return ONLY valid JSON. Do not include any markdown formatting or explanations.'
          },
          {
            role: 'user',
            content: `Extract information from this resume text and return as JSON:

${fileContent}

Return JSON with these fields (use empty string or empty array if not found):
{
  "full_name": "",
  "email": "",
  "phone_number": "",
  "linkedin_url": "",
  "location": "",
  "professional_summary": "",
  "work_experience": [{"job_title": "", "company_name": "", "start_date": "", "end_date": "", "responsibilities": ""}],
  "education": [{"degree": "", "institution_name": "", "graduation_date": ""}],
  "skills": ["skill1", "skill2"],
  "projects": [{"project_name": "", "description": "", "technologies_used": []}]
}`
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errorText);
      throw new Error(`Groq API failed: ${groqResponse.status} - ${errorText}`);
    }

    const groqData = await groqResponse.json();
    console.log('Groq response received, choices length:', groqData.choices?.length);

    // Check if response has the expected structure
    if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
      console.error('Unexpected Groq response structure:', JSON.stringify(groqData));
      throw new Error('Invalid response structure from AI service');
    }

    const parsedDataText = groqData.choices[0].message.content;
    console.log('Raw AI response:', parsedDataText.substring(0, 200) + '...');
    
    // Clean up the response and parse JSON
    let parsedData;
    try {
      // Remove any markdown formatting and clean up
      let cleanedText = parsedDataText.trim();
      
      // Remove markdown code blocks
      cleanedText = cleanedText.replace(/```json\s*|\s*```/g, '');
      cleanedText = cleanedText.replace(/```\s*|\s*```/g, '');
      
      // Find JSON object in the text
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
      }
      
      console.log('Cleaned JSON text:', cleanedText.substring(0, 200) + '...');
      
      parsedData = JSON.parse(cleanedText);
      console.log('Successfully parsed JSON data');
      
      // Ensure all required fields exist with defaults
      parsedData = {
        full_name: parsedData.full_name || 'Unknown Candidate',
        email: parsedData.email || '',
        phone_number: parsedData.phone_number || '',
        linkedin_url: parsedData.linkedin_url || '',
        location: parsedData.location || '',
        professional_summary: parsedData.professional_summary || '',
        work_experience: Array.isArray(parsedData.work_experience) ? parsedData.work_experience : [],
        education: Array.isArray(parsedData.education) ? parsedData.education : [],
        skills: Array.isArray(parsedData.skills) ? parsedData.skills : [],
        projects: Array.isArray(parsedData.projects) ? parsedData.projects : []
      };
      
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Failed to parse text (first 500 chars):', parsedDataText.substring(0, 500));
      
      // Create fallback data structure
      parsedData = {
        full_name: 'Parsing Error - Manual Review Needed',
        email: '',
        phone_number: '',
        linkedin_url: '',
        location: '',
        professional_summary: 'Resume content could not be parsed automatically',
        work_experience: [],
        education: [],
        skills: [],
        projects: []
      };
    }

    // Extract skills for quick access
    const skillsExtracted = parsedData.skills || [];
    console.log('Extracted skills:', skillsExtracted);

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
      console.error('Database update error:', updateError);
      throw new Error(`Failed to save parsed data: ${updateError.message}`);
    }

    console.log('Resume parsing completed successfully for:', parsedData.full_name);

    return new Response(JSON.stringify({ 
      success: true, 
      parsedData,
      skillsCount: skillsExtracted.length,
      message: 'Resume parsed successfully' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Parse resume error:', error);
    
    // Update status to error if we have resumeId
    if (resumeId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('resumes')
          .update({ upload_status: 'parsing_error' })
          .eq('id', resumeId);
      } catch (updateError) {
        console.error('Failed to update error status:', updateError);
      }
    }

    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Resume parsing failed. Please check the file format and try again.',
      resumeId: resumeId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
