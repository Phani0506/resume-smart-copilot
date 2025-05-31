
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Intelligent content extraction that preserves important resume information
function extractResumeContent(content: string): string {
  console.log(`Original content length: ${content.length} characters`);
  
  // Remove PDF artifacts and binary data
  let cleanContent = content
    // Remove PDF headers and footers
    .replace(/%PDF-[\d.]+/g, '')
    .replace(/%%EOF/g, '')
    .replace(/startxref/g, '')
    .replace(/xref/g, '')
    .replace(/trailer/g, '')
    .replace(/endobj/g, '')
    .replace(/obj/g, '')
    .replace(/stream\s+/g, ' ')
    .replace(/endstream/g, '')
    // Remove PDF objects and references
    .replace(/\d+\s+\d+\s+R/g, ' ')
    .replace(/<<[^>]*>>/g, ' ')
    .replace(/\[[\d\s.,-]+\]/g, ' ')
    .replace(/\/[A-Za-z][A-Za-z0-9]*/g, ' ')
    // Remove escape sequences and binary characters
    .replace(/\\[nrt]/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/[^\x20-\x7E\s]/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Extract meaningful sentences and phrases
  const sentences = cleanContent.split(/[.!?]\s+|\n+/);
  const meaningfulContent: string[] = [];
  const keywords = [
    // Names and contact patterns
    /^[A-Z][a-z]+\s+[A-Z][a-z]+/,
    /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    /linkedin|github/i,
    
    // Resume sections
    /\b(experience|education|skills|summary|objective|projects|certifications|work|employment|qualifications|achievements|profile)\b/i,
    
    // Job titles and roles
    /\b(developer|engineer|manager|analyst|consultant|designer|coordinator|director|lead|senior|junior|associate|specialist|administrator|architect|scientist|researcher|intern|freelance)\b/i,
    
    // Companies and institutions
    /\b(inc|llc|corp|ltd|company|technologies|solutions|systems|university|college|institute|school)\b/i,
    
    // Technical skills
    /\b(javascript|python|java|react|node|angular|vue|html|css|sql|mongodb|postgresql|mysql|aws|azure|docker|kubernetes|git|linux|windows|adobe|microsoft|google|oracle|salesforce|tableau|excel|powerbi)\b/i,
    
    // Education
    /\b(bachelor|master|degree|phd|certification|diploma|graduate|undergraduate|mba|bs|ba|ms|ma)\b/i,
    
    // Dates
    /\b(19|20)\d{2}\b/,
    /(january|february|march|april|may|june|july|august|september|october|november|december)/i,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i
  ];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 3 || trimmed.length > 200) continue;
    
    // Check if sentence contains important keywords
    const isImportant = keywords.some(pattern => pattern.test(trimmed));
    
    if (isImportant || trimmed.split(' ').length >= 3) {
      meaningfulContent.push(trimmed);
    }
  }

  // Join meaningful content and ensure it's within limits
  let result = meaningfulContent.join('. ').substring(0, 8000); // Conservative limit
  
  console.log(`Extracted content length: ${result.length} characters`);
  console.log(`Sample content: ${result.substring(0, 300)}...`);
  
  return result || content.substring(0, 1000); // Fallback
}

function createSimplePrompt(content: string): string {
  return `Extract resume information from this text and return ONLY a valid JSON object.

Text: ${content}

Return this exact JSON structure with extracted data:
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
    
    // Extract content intelligently
    const extractedContent = extractResumeContent(fullContent);
    const prompt = createSimplePrompt(extractedContent);

    console.log('Calling Groq API...');

    // Call Groq API with minimal settings
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
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0,
        max_tokens: 1500,
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
    
    // Parse JSON response
    let parsedData;
    try {
      // Clean the response
      let jsonText = aiResponse;
      
      // Remove markdown formatting
      jsonText = jsonText.replace(/```json\s*/gi, '');
      jsonText = jsonText.replace(/```\s*/gi, '');
      
      // Extract JSON object
      const startIndex = jsonText.indexOf('{');
      const endIndex = jsonText.lastIndexOf('}');
      
      if (startIndex !== -1 && endIndex !== -1) {
        jsonText = jsonText.substring(startIndex, endIndex + 1);
      }
      
      parsedData = JSON.parse(jsonText);
      
      // Ensure all required fields exist
      parsedData = {
        full_name: (parsedData.full_name || '').trim(),
        email: (parsedData.email || '').trim(),
        phone_number: (parsedData.phone_number || '').trim(),
        linkedin_url: (parsedData.linkedin_url || '').trim(),
        location: (parsedData.location || '').trim(),
        professional_summary: (parsedData.professional_summary || '').trim(),
        work_experience: Array.isArray(parsedData.work_experience) ? parsedData.work_experience : [],
        education: Array.isArray(parsedData.education) ? parsedData.education : [],
        skills: Array.isArray(parsedData.skills) ? parsedData.skills.filter(skill => skill && skill.trim()) : [],
        projects: Array.isArray(parsedData.projects) ? parsedData.projects : []
      };

      console.log('Parsed data:', {
        name: parsedData.full_name,
        email: parsedData.email,
        skills_count: parsedData.skills.length
      });
      
    } catch (parseError) {
      console.error('JSON parsing failed:', parseError);
      console.error('AI response was:', aiResponse);
      throw new Error('Failed to parse AI response');
    }

    // Validate meaningful data was extracted
    if (!parsedData.full_name && !parsedData.email && parsedData.skills.length === 0) {
      console.error('No meaningful data extracted');
      throw new Error('Unable to extract resume information');
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
