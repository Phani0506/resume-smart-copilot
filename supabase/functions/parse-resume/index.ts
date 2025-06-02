
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced content extraction with multiple strategies
function extractContentFromFile(rawContent: string): string {
  console.log(`=== CONTENT EXTRACTION STARTED ===`);
  console.log(`Raw content length: ${rawContent.length} characters`);
  
  if (!rawContent || rawContent.length < 10) {
    throw new Error('File contains no readable content');
  }
  
  let cleanedContent = '';
  
  // Strategy 1: Remove PDF metadata and clean structure
  cleanedContent = rawContent
    .replace(/%PDF-[\d.]+/g, ' ')
    .replace(/%%EOF/g, ' ')
    .replace(/\d+\s+\d+\s+obj/g, ' ')
    .replace(/endobj/g, ' ')
    .replace(/stream\s*[\s\S]*?\s*endstream/g, ' ')
    .replace(/\/[A-Z][A-Za-z0-9]*\s*/g, ' ')
    .replace(/<<[^>]*>>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^\w\s@._\-(),+#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Strategy 2: Extract readable characters only if first strategy didn't work well
  if (cleanedContent.length < 200) {
    let charFiltered = '';
    for (let i = 0; i < rawContent.length; i++) {
      const char = rawContent[i];
      const code = char.charCodeAt(0);
      
      if ((code >= 32 && code <= 126) || 
          (code >= 160 && code <= 255) || 
          char === '\n' || char === '\r' || char === '\t' ||
          /[a-zA-Z0-9\s@._\-+#()]/.test(char)) {
        charFiltered += char;
      }
    }
    
    charFiltered = charFiltered.replace(/\s+/g, ' ').trim();
    if (charFiltered.length > cleanedContent.length) {
      cleanedContent = charFiltered;
    }
  }
  
  // Final validation
  if (cleanedContent.length < 50) {
    throw new Error('Insufficient readable content extracted from file');
  }
  
  const result = cleanedContent.substring(0, 8000).trim();
  console.log(`Extracted content length: ${result.length} characters`);
  console.log(`Sample: ${result.substring(0, 300)}...`);
  
  return result;
}

// Comprehensive AI parsing with structured prompt
async function parseWithAI(content: string, groqApiKey: string): Promise<any> {
  console.log(`=== AI PARSING STARTED ===`);
  
  const systemPrompt = `You are an expert resume parser and data extraction specialist. Your task is to extract information from resume text with 100% accuracy and return it in a specific JSON format. Follow these rules strictly:

1. ONLY extract information that is explicitly present in the resume text
2. DO NOT hallucinate or invent any information
3. If information is missing, use null or empty arrays/strings
4. Return ONLY valid JSON with no additional text, explanations, or markdown
5. Maintain the exact JSON structure and field order specified`;

  const extractionPrompt = `Extract all information from this resume text and return it in the exact JSON format specified below.

RESUME TEXT:
${content}

REQUIRED JSON OUTPUT FORMAT (return ONLY this JSON structure with NO additional text):

{
  "candidate_name": "Full name of the candidate or null if not found",
  "contact_information": {
    "email": "Primary email address or null",
    "phone": "Primary phone number or null", 
    "linkedin_url": "LinkedIn profile URL or null",
    "github_url": "GitHub profile URL or null",
    "portfolio_url": "Personal portfolio/website URL or null",
    "location": "City, State, Country or null"
  },
  "skills": [
    "List of ALL skills found including technical skills, programming languages, frameworks, tools, software, soft skills, certifications, etc."
  ],
  "work_experience": [
    {
      "job_title": "Exact job title",
      "company_name": "Exact company name", 
      "start_date": "Start date in format like 'January 2020' or 'Jan 2020' or '01/2020'",
      "end_date": "End date in same format or 'Present' for current roles",
      "responsibilities_achievements": [
        "List of key responsibilities, duties, and accomplishments as separate bullet points"
      ]
    }
  ]
}

EXTRACTION GUIDELINES:
- candidate_name: Extract the full name exactly as written, typically found at the top of the resume
- contact_information: Look for email addresses (@), phone numbers (with various formats), LinkedIn URLs (linkedin.com), GitHub URLs (github.com), portfolio websites, and location/address information
- skills: Extract ALL mentioned skills including programming languages, frameworks, tools, software proficiency, certifications, soft skills, methodologies, databases, cloud platforms, etc.
- work_experience: Extract each job with exact titles and company names, parse dates carefully, and list each responsibility/achievement as a separate item in the array

Remember: Return ONLY the JSON object with no additional text or formatting.`;

  try {
    const response = await callGroqWithRetry(extractionPrompt, groqApiKey, systemPrompt, 3);
    console.log(`AI parsing completed successfully`);
    return response;
  } catch (error) {
    console.error(`AI parsing failed:`, error.message);
    throw new Error(`Resume parsing failed: ${error.message}`);
  }
}

// Enhanced Groq API call with better error handling
async function callGroqWithRetry(prompt: string, groqApiKey: string, systemPrompt: string, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Groq API attempt ${attempt}/${maxRetries}`);
      
      if (attempt > 1) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 2), 15000);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
              content: systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 2000,
          top_p: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Groq API error ${response.status}: ${errorText}`);
        
        if (response.status === 429) {
          console.log(`Rate limited, will retry after longer delay...`);
          continue;
        } else if (response.status >= 500) {
          console.log(`Server error, will retry...`);
          continue;
        } else {
          throw new Error(`Groq API error: ${response.status} - ${errorText}`);
        }
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content in Groq response');
      }

      console.log(`Raw AI Response: ${content.substring(0, 200)}...`);

      // Enhanced JSON parsing with multiple cleanup attempts
      try {
        // Remove markdown formatting
        let cleanedContent = content
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .replace(/`/g, '')
          .trim();
        
        // Find JSON boundaries more precisely
        const jsonStart = cleanedContent.search(/\{/);
        const jsonEnd = cleanedContent.lastIndexOf('}') + 1;
        
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          const jsonStr = cleanedContent.substring(jsonStart, jsonEnd);
          const parsed = JSON.parse(jsonStr);
          console.log(`Successfully parsed JSON response`);
          return parsed;
        } else {
          throw new Error('No valid JSON structure found in response');
        }
      } catch (parseError) {
        console.error(`JSON parse error: ${parseError.message}`);
        console.error(`Content that failed to parse: ${content}`);
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to parse JSON after ${maxRetries} attempts`);
        }
        continue;
      }
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw new Error(`All ${maxRetries} attempts failed. Last error: ${error.message}`);
      }
    }
  }
}

// Data validation and structure enforcement
function validateAndStructureData(data: any): any {
  console.log(`=== DATA VALIDATION STARTED ===`);
  
  // Ensure proper structure with required fields
  const structured = {
    candidate_name: String(data.candidate_name || '').trim() || null,
    contact_information: {
      email: String(data.contact_information?.email || '').trim() || null,
      phone: String(data.contact_information?.phone || '').trim() || null,
      linkedin_url: String(data.contact_information?.linkedin_url || '').trim() || null,
      github_url: String(data.contact_information?.github_url || '').trim() || null,
      portfolio_url: String(data.contact_information?.portfolio_url || '').trim() || null,
      location: String(data.contact_information?.location || '').trim() || null
    },
    skills: [],
    work_experience: []
  };
  
  // Validate and clean skills
  if (Array.isArray(data.skills)) {
    structured.skills = data.skills
      .map((skill: any) => String(skill).trim())
      .filter((skill: string) => skill.length > 0 && skill.length < 100)
      .slice(0, 50); // Limit to reasonable number
  }
  
  // Validate and clean work experience
  if (Array.isArray(data.work_experience)) {
    structured.work_experience = data.work_experience
      .map((exp: any) => ({
        job_title: String(exp.job_title || '').trim() || null,
        company_name: String(exp.company_name || '').trim() || null,
        start_date: String(exp.start_date || '').trim() || null,
        end_date: String(exp.end_date || '').trim() || null,
        responsibilities_achievements: Array.isArray(exp.responsibilities_achievements) 
          ? exp.responsibilities_achievements
              .map((resp: any) => String(resp).trim())
              .filter((resp: string) => resp.length > 0)
              .slice(0, 20) // Limit responsibilities per job
          : []
      }))
      .filter((exp: any) => exp.job_title || exp.company_name) // Keep if has title or company
      .slice(0, 20); // Limit total experiences
  }
  
  console.log(`Validation complete:`, {
    name: structured.candidate_name ? 'Found' : 'Missing',
    email: structured.contact_information.email ? 'Found' : 'Missing',
    skills_count: structured.skills.length,
    experience_count: structured.work_experience.length
  });
  
  return structured;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let resumeId: string | undefined;

  try {
    const { resumeId: reqResumeId } = await req.json();
    resumeId = reqResumeId;
    
    console.log('=== RESUME PARSING STARTED ===');
    console.log(`Resume ID: ${resumeId}`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const groqApiKey = Deno.env.get('GROQ_API_KEY')!;
    
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get resume record
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .single();

    if (resumeError) {
      console.error('Resume fetch error:', resumeError);
      throw new Error(`Resume not found: ${resumeError.message}`);
    }

    console.log(`Processing: ${resume.file_name}`);

    // Download file from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('user-resumes')
      .download(resume.storage_path);

    if (fileError) {
      console.error('File download error:', fileError);
      throw new Error(`File download failed: ${fileError.message}`);
    }

    // Extract text content
    const rawContent = await fileData.text();
    const extractedContent = extractContentFromFile(rawContent);
    
    // Parse with AI using comprehensive prompt
    const parsedData = await parseWithAI(extractedContent, groqApiKey);
    
    // Validate and structure the data
    const structuredData = validateAndStructureData(parsedData);
    
    // Check if we got meaningful data
    const hasValidData = structuredData.candidate_name || 
                        structuredData.contact_information.email || 
                        structuredData.skills.length > 0 || 
                        structuredData.work_experience.length > 0;
    
    if (!hasValidData) {
      console.warn('WARNING: No meaningful data extracted from resume');
    }

    // Update database with parsed data
    const { error: updateError } = await supabase
      .from('resumes')
      .update({
        parsed_data: structuredData,
        skills_extracted: structuredData.skills,
        upload_status: 'parsed_success'
      })
      .eq('id', resumeId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Failed to save parsed data: ${updateError.message}`);
    }

    console.log('=== PARSING COMPLETED SUCCESSFULLY ===');
    console.log(`Extracted data summary:`, {
      candidate_name: structuredData.candidate_name,
      email: structuredData.contact_information.email,
      skills_count: structuredData.skills.length,
      experience_count: structuredData.work_experience.length
    });

    return new Response(JSON.stringify({ 
      success: true, 
      parsedData: structuredData,
      skillsCount: structuredData.skills.length,
      experienceCount: structuredData.work_experience.length,
      message: 'Resume parsed successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== PARSING FAILED ===');
    console.error('Error:', error.message);
    
    // Update status to error in database
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
