
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Improved content extraction that preserves readable text
function extractReadableContent(content: string, maxTokens = 3000): string {
  const maxChars = maxTokens * 4; // 1 token ≈ 4 characters
  
  if (content.length <= maxChars) {
    return content;
  }

  console.log(`Content length: ${content.length} chars, extracting readable content...`);

  // Remove PDF artifacts but preserve text content
  let cleanedContent = content
    // Remove PDF-specific markers
    .replace(/%PDF-[\d.]+/g, '')
    .replace(/%%EOF/g, '')
    .replace(/startxref/g, '')
    .replace(/xref/g, '')
    .replace(/trailer/g, '')
    .replace(/endobj/g, '')
    .replace(/obj/g, '')
    .replace(/stream\s/g, ' ')
    .replace(/endstream/g, '')
    // Remove PDF commands and objects
    .replace(/\d+\s+\d+\s+R/g, ' ')
    .replace(/<<[^>]*>>/g, ' ')
    .replace(/\[[\d\s.]+\]/g, ' ')
    .replace(/\/[A-Z][a-zA-Z0-9]*/g, ' ')
    // Clean up escape sequences
    .replace(/\\[nrt]/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    // Remove non-printable characters except basic punctuation
    .replace(/[^\x20-\x7E\s]/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Split into meaningful chunks and extract important information
  const lines = cleanedContent.split(/\s+/).join(' ').split(/[.!?]\s+|\n/);
  
  const importantContent: string[] = [];
  const otherContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3) continue;
    
    const lower = trimmed.toLowerCase();
    
    // Identify potentially important content
    if (
      // Contact information
      /@/.test(trimmed) ||
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(trimmed) ||
      /linkedin|github/i.test(trimmed) ||
      
      // Names (capitalized words at start)
      /^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(trimmed) ||
      
      // Section headers
      /(experience|education|skills|summary|objective|projects|certifications|work|employment|qualifications|achievements)/i.test(trimmed) ||
      
      // Job titles and companies
      /(developer|engineer|manager|analyst|consultant|designer|coordinator|director|lead|senior|junior)/i.test(lower) ||
      /(inc|llc|corp|ltd|company|technologies|solutions|systems|university|college)/i.test(lower) ||
      
      // Technical skills
      /(javascript|python|java|react|node|angular|vue|html|css|sql|aws|azure|docker|kubernetes|git)/i.test(lower) ||
      
      // Education
      /(bachelor|master|degree|phd|certification|diploma|graduate)/i.test(lower) ||
      
      // Dates and durations
      /\b(19|20)\d{2}\b/.test(trimmed) ||
      /(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(lower)
    ) {
      importantContent.push(trimmed);
    } else if (trimmed.length > 10 && trimmed.split(' ').length > 2) {
      otherContent.push(trimmed);
    }
  }

  // Combine important content first, then add other content if space allows
  let result = importantContent.join('. ');
  
  for (const content of otherContent) {
    if ((result + '. ' + content).length < maxChars) {
      result += '. ' + content;
    } else {
      break;
    }
  }

  console.log('Extracted content length:', result.length);
  console.log('Sample extracted content:', result.substring(0, 500));
  
  return result || content.substring(0, maxChars);
}

// Enhanced extraction prompt with better instructions
function createExtractionPrompt(content: string): string {
  return `You are an expert resume parser. Extract information from the following resume text and return it as valid JSON.

IMPORTANT INSTRUCTIONS:
- Extract ALL available information, do not leave fields empty if the information exists
- For names: Look for full names at the beginning of the document or in contact sections
- For skills: Extract ALL technical skills, programming languages, tools, frameworks, and technologies mentioned
- For experience: Include job titles, company names, and date ranges
- Return ONLY the JSON object, no explanations or markdown

Resume text:
${content}

Return this exact JSON structure with all available data filled in:
{
  "full_name": "Extract the person's full name",
  "email": "Extract email address",
  "phone_number": "Extract phone number",
  "linkedin_url": "Extract LinkedIn URL if mentioned",
  "location": "Extract city, state or location",
  "professional_summary": "Extract summary or objective statement",
  "work_experience": [
    {
      "job_title": "Job title",
      "company_name": "Company name",
      "start_date": "Start date",
      "end_date": "End date or 'Present'",
      "responsibilities": "Key responsibilities or achievements"
    }
  ],
  "education": [
    {
      "degree": "Degree type and field",
      "institution_name": "School or university name",
      "graduation_date": "Graduation date or year"
    }
  ],
  "skills": ["List", "all", "technical", "skills", "found"],
  "projects": [
    {
      "project_name": "Project name",
      "description": "Project description",
      "technologies_used": ["tech1", "tech2"]
    }
  ]
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

    console.log('Resume found:', resume.file_name, 'Content-Type:', resume.content_type);

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
      console.log('Original content length:', fullContent.length);
    } catch (textError) {
      console.error('Text extraction error:', textError);
      throw new Error('Failed to extract text from file. The file may be corrupted.');
    }
    
    if (!fullContent || fullContent.trim().length < 20) {
      throw new Error('File appears to be empty or contains insufficient text content');
    }
    
    // Extract readable content with improved algorithm
    const fileContent = extractReadableContent(fullContent, 2500);

    // Create enhanced prompt
    const prompt = createExtractionPrompt(fileContent);

    // Call Groq API with better settings
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
            content: 'You are an expert resume parser. Extract comprehensive information from resumes and return valid JSON only. Be thorough in extracting names, skills, and all other details.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
        top_p: 0.9,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errorText);
      throw new Error(`AI parsing service failed: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    console.log('AI response received');

    if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
      throw new Error('Invalid response from AI service');
    }

    const parsedDataText = groqData.choices[0].message.content;
    console.log('AI response:', parsedDataText.substring(0, 200));
    
    // Parse JSON response
    let parsedData;
    try {
      let cleanedText = parsedDataText.trim();
      
      // Remove any markdown formatting
      cleanedText = cleanedText.replace(/```json\s*/gi, '');
      cleanedText = cleanedText.replace(/```\s*/gi, '');
      cleanedText = cleanedText.replace(/^json\s*/gi, '');
      
      // Find JSON object boundaries
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
      }
      
      parsedData = JSON.parse(cleanedText);
      console.log('Successfully parsed AI response');
      
      // Validate and ensure all fields are present
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

      console.log('Final parsed data summary:', {
        name: parsedData.full_name,
        email: parsedData.email,
        skills_count: parsedData.skills.length,
        experience_count: parsedData.work_experience.length
      });
      
    } catch (parseError) {
      console.error('JSON parsing failed:', parseError);
      console.error('Raw AI response:', parsedDataText);
      throw new Error('Failed to parse AI response as valid JSON');
    }

    // Validate that we got meaningful data
    if (!parsedData.full_name && !parsedData.email && parsedData.skills.length === 0) {
      console.error('No meaningful data extracted, content may be corrupted');
      throw new Error('Unable to extract meaningful data from resume. Please ensure the file is a valid resume document.');
    }

    // Extract skills for database
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
      console.error('Database update error:', updateError);
      throw new Error(`Failed to save parsed data: ${updateError.message}`);
    }

    console.log('Resume parsing completed successfully for:', parsedData.full_name || 'candidate');

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
