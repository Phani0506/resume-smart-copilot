import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simplified content extraction that preserves more text
function extractResumeContent(content: string): string {
  console.log(`Original content length: ${content.length} characters`);
  
  // Simple cleanup - remove obvious PDF junk but keep readable text
  let cleanContent = content
    // Remove PDF metadata and binary chunks
    .replace(/%PDF-[\d.]+/g, '')
    .replace(/%%EOF/g, '')
    .replace(/obj\s*<<.*?>>\s*stream/gs, ' ')
    .replace(/endstream\s*endobj/g, ' ')
    .replace(/\d+\s+\d+\s+obj/g, ' ')
    .replace(/\/[A-Z][A-Za-z0-9]*\s+/g, ' ')
    // Clean up whitespace and special chars but keep letters/numbers
    .replace(/[^\w\s@._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Take first 4000 characters to stay well under token limits
  const result = cleanContent.substring(0, 4000);
  
  console.log(`Extracted content length: ${result.length} characters`);
  console.log(`Sample content: ${result.substring(0, 200)}...`);
  
  return result;
}

// Strict prompt that forces JSON output
function createStrictPrompt(content: string): string {
  return `You are a resume parser. Extract information from this text and return ONLY valid JSON.

RULES:
1. You MUST return valid JSON only
2. No explanations, no markdown, no extra text
3. If you can't find a field, use empty string "" or empty array []
4. Never return anything other than the JSON object

Text to parse:
${content}

Return exactly this JSON structure:
{
  "full_name": "",
  "email": "",
  "phone_number": "",
  "linkedin_url": "",
  "location": "",
  "professional_summary": "",
  "work_experience": [],
  "education": [],
  "skills": [],
  "projects": []
}`;
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

    console.log('Resume found:', resume.file_name);

    // Download file from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('user-resumes')
      .download(resume.storage_path);

    if (fileError) {
      console.error('File download error:', fileError);
      throw new Error(`File download failed: ${fileError.message}`);
    }

    // Convert file to text
    let fullContent: string;
    try {
      fullContent = await fileData.text();
    } catch (textError) {
      console.error('Text extraction error:', textError);
      throw new Error('Failed to extract text from file');
    }
    
    if (!fullContent || fullContent.trim().length < 10) {
      throw new Error('File contains no readable text');
    }
    
    // Extract content with simpler approach
    const extractedContent = extractResumeContent(fullContent);
    const prompt = createStrictPrompt(extractedContent);

    console.log('Calling Groq API...');

    // Call Groq API with stricter settings
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
            content: 'You are a JSON-only resume parser. Return only valid JSON, never any explanatory text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0,
        max_tokens: 1000,
        top_p: 0.1,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errorText);
      throw new Error(`AI service error: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    console.log('AI response received');

    if (!groqData.choices?.[0]?.message?.content) {
      throw new Error('Invalid AI response');
    }

    const aiResponse = groqData.choices[0].message.content.trim();
    console.log('AI response:', aiResponse);
    
    // Parse JSON response with better error handling
    let parsedData;
    try {
      // Clean the response more aggressively
      let jsonText = aiResponse;
      
      // Remove any markdown or extra text
      jsonText = jsonText.replace(/```json/gi, '');
      jsonText = jsonText.replace(/```/gi, '');
      jsonText = jsonText.replace(/^[^{]*/g, ''); // Remove everything before first {
      jsonText = jsonText.replace(/[^}]*$/g, ''); // Remove everything after last }
      
      // Find the JSON object boundaries
      const startIndex = jsonText.indexOf('{');
      const endIndex = jsonText.lastIndexOf('}');
      
      if (startIndex === -1 || endIndex === -1) {
        throw new Error('No JSON object found in AI response');
      }
      
      jsonText = jsonText.substring(startIndex, endIndex + 1);
      
      console.log('Attempting to parse JSON:', jsonText);
      parsedData = JSON.parse(jsonText);
      
      // Ensure all required fields exist with proper defaults
      parsedData = {
        full_name: String(parsedData.full_name || '').trim(),
        email: String(parsedData.email || '').trim(),
        phone_number: String(parsedData.phone_number || '').trim(),
        linkedin_url: String(parsedData.linkedin_url || '').trim(),
        location: String(parsedData.location || '').trim(),
        professional_summary: String(parsedData.professional_summary || '').trim(),
        work_experience: Array.isArray(parsedData.work_experience) ? parsedData.work_experience : [],
        education: Array.isArray(parsedData.education) ? parsedData.education : [],
        skills: Array.isArray(parsedData.skills) ? parsedData.skills.filter(skill => skill && String(skill).trim()) : [],
        projects: Array.isArray(parsedData.projects) ? parsedData.projects : []
      };

      console.log('Successfully parsed data:', {
        name: parsedData.full_name,
        email: parsedData.email,
        skills_count: parsedData.skills.length
      });
      
    } catch (parseError) {
      console.error('JSON parsing failed:', parseError);
      console.error('Raw AI response was:', aiResponse);
      
      // Fallback: create empty structure
      parsedData = {
        full_name: '',
        email: '',
        phone_number: '',
        linkedin_url: '',
        location: '',
        professional_summary: '',
        work_experience: [],
        education: [],
        skills: [],
        projects: []
      };
      
      console.log('Using fallback empty structure');
    }

    // Update resume with parsed data
    const { error: updateError } = await supabase
      .from('resumes')
      .update({
        parsed_data: parsedData,
        skills_extracted: parsedData.skills || [],
        upload_status: 'parsed_success'
      })
      .eq('id', resumeId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Failed to save parsed data: ${updateError.message}`);
    }

    console.log('Resume parsing completed successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      parsedData,
      skillsCount: parsedData.skills.length,
      message: 'Resume parsed successfully' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Parse resume error:', error);
    
    // Update status to error
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
      resumeId: resumeId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
