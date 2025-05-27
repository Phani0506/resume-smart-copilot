
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
    // Parse request body once and store it
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

    // Convert file to text (simplified - in production, use proper PDF/DOCX parsers)
    const fileContent = await fileData.text();
    console.log('File content length:', fileContent.length);

    // Call Groq API for parsing
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
            content: 'You are a resume parsing expert. Parse the following resume text and extract comprehensive, structured information. Return ONLY valid JSON without any markdown formatting or extra text.'
          },
          {
            role: 'user',
            content: `Parse the following resume text and extract structured information as JSON:

${fileContent}

Extract and return as JSON object with these fields:
{
  "full_name": "string",
  "email": "string",
  "phone_number": "string",
  "linkedin_url": "string",
  "location": "string",
  "professional_summary": "string",
  "work_experience": [
    {
      "job_title": "string",
      "company_name": "string",
      "start_date": "string",
      "end_date": "string",
      "responsibilities": "string"
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution_name": "string",
      "graduation_date": "string"
    }
  ],
  "skills": ["string"],
  "projects": [
    {
      "project_name": "string",
      "description": "string",
      "technologies_used": ["string"]
    }
  ]
}`
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!groqResponse.ok) {
      console.error('Groq API error:', groqResponse.status, await groqResponse.text());
      throw new Error(`Groq API error: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    console.log('Groq response received');

    // Check if response has the expected structure
    if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
      console.error('Unexpected Groq response structure:', groqData);
      throw new Error('Invalid response from AI service');
    }

    const parsedDataText = groqData.choices[0].message.content;
    console.log('Raw AI response:', parsedDataText);
    
    // Clean up the response and parse JSON
    let parsedData;
    try {
      // Remove any markdown formatting
      const cleanedText = parsedDataText.replace(/```json\n?|\n?```/g, '').trim();
      parsedData = JSON.parse(cleanedText);
      console.log('Successfully parsed JSON data');
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Failed to parse text:', parsedDataText);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Extract skills for quick access
    const skillsExtracted = parsedData.skills || [];

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

    return new Response(JSON.stringify({ success: true, parsedData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Parse resume error:', error);
    
    // Update status to error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Parse request body again for error handling
      const { resumeId } = await req.clone().json();
      await supabase
        .from('resumes')
        .update({ upload_status: 'parsing_error' })
        .eq('id', resumeId);
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
