import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced content extraction with better PDF handling
function extractContentFromFile(rawContent: string): string {
  console.log(`=== CONTENT EXTRACTION STARTED ===`);
  console.log(`Raw content length: ${rawContent.length} characters`);
  
  if (!rawContent || rawContent.length < 10) {
    throw new Error('File contains no readable content');
  }
  
  let cleanedContent = '';
  
  // Strategy 1: Remove PDF metadata and extract readable text
  cleanedContent = rawContent
    // Remove PDF headers and metadata
    .replace(/%PDF-[\d.]+/g, '')
    .replace(/%%EOF/g, '')
    .replace(/\d+\s+\d+\s+obj/g, ' ')
    .replace(/endobj/g, ' ')
    .replace(/stream\s*[\s\S]*?\s*endstream/g, ' ')
    .replace(/\/[A-Z][A-Za-z0-9]*\s*/g, ' ')
    .replace(/<<[^>]*>>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    // Keep only readable characters
    .replace(/[^\w\s@._\-(),+#:\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Strategy 2: If first strategy didn't work well, try character filtering
  if (cleanedContent.length < 100) {
    console.log('Trying alternative extraction method...');
    let charFiltered = '';
    for (let i = 0; i < rawContent.length; i++) {
      const char = rawContent[i];
      const code = char.charCodeAt(0);
      
      // Keep printable ASCII and common Unicode characters
      if ((code >= 32 && code <= 126) || 
          (code >= 160 && code <= 255) || 
          char === '\n' || char === '\r' || char === '\t' ||
          /[a-zA-Z0-9\s@._\-+#():]/.test(char)) {
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
  
  const result = cleanedContent.substring(0, 10000).trim();
  console.log(`Extracted content length: ${result.length} characters`);
  console.log(`Sample: ${result.substring(0, 500)}...`);
  
  return result;
}

// Enhanced AI parsing with structured approach
async function parseWithAI(content: string, groqApiKey: string): Promise<any> {
  console.log(`=== AI PARSING STARTED ===`);
  
  const systemPrompt = `You are an expert resume parser. Extract information from the resume text and return ONLY a valid JSON object with NO additional text, explanations, or markdown formatting.

CRITICAL RULES:
1. Return ONLY the JSON object - no introductory text, no explanations, no markdown
2. If information is missing, use null for strings or empty arrays []
3. Do NOT invent or hallucinate any information
4. Ensure all dates are in readable format (e.g., "January 2020", "Jan 2020", "01/2020")
5. Extract ALL skills mentioned (technical, soft skills, tools, languages, frameworks)`;

  const extractionPrompt = `Parse this resume text and extract the information into the exact JSON format below.

RESUME TEXT:
${content}

Return ONLY this JSON structure with extracted data:

{
  "candidate_name": "Full name or null",
  "contact_information": {
    "email": "email@domain.com or null",
    "phone": "phone number or null",
    "linkedin_url": "LinkedIn URL or null",
    "github_url": "GitHub URL or null", 
    "portfolio_url": "Portfolio URL or null",
    "location": "City, State or null"
  },
  "skills": ["array of skills found"],
  "work_experience": [
    {
      "job_title": "position title",
      "company_name": "company name",
      "start_date": "start date",
      "end_date": "end date or Present",
      "responsibilities_achievements": ["list of responsibilities and achievements"]
    }
  ]
}`;

  try {
    const response = await callGroqWithRetry(extractionPrompt, groqApiKey, systemPrompt, 3);
    console.log(`AI parsing completed successfully`);
    return response;
  } catch (error) {
    console.error(`AI parsing failed:`, error.message);
    throw new Error(`Resume parsing failed: ${error.message}`);
  }
}

// Improved Groq API call with better rate limiting and error handling
async function callGroqWithRetry(prompt: string, groqApiKey: string, systemPrompt: string, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Groq API attempt ${attempt}/${maxRetries}`);
      
      // Progressive delays for retries
      if (attempt > 1) {
        const baseDelay = 2000;
        const delay = baseDelay * Math.pow(2, attempt - 2);
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
          max_tokens: 3000,
          top_p: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Groq API error ${response.status}: ${errorText}`);
        
        if (response.status === 429) {
          // Rate limited - wait longer before retry
          const waitTime = attempt === 1 ? 30000 : 60000; // 30s or 60s
          console.log(`Rate limited, waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
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

      console.log(`Raw AI Response (first 300 chars): ${content.substring(0, 300)}...`);

      // Enhanced JSON parsing
      try {
        // Clean the response to extract pure JSON
        let cleanedContent = content.trim();
        
        // Remove any markdown formatting
        cleanedContent = cleanedContent
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .replace(/`/g, '')
          .trim();
        
        // Find JSON object boundaries
        const openBraceIndex = cleanedContent.indexOf('{');
        const closeBraceIndex = cleanedContent.lastIndexOf('}');
        
        if (openBraceIndex === -1 || closeBraceIndex === -1 || closeBraceIndex <= openBraceIndex) {
          throw new Error('No valid JSON structure found in response');
        }
        
        const jsonStr = cleanedContent.substring(openBraceIndex, closeBraceIndex + 1);
        console.log(`Extracted JSON string: ${jsonStr.substring(0, 200)}...`);
        
        const parsed = JSON.parse(jsonStr);
        console.log(`Successfully parsed JSON response`);
        return parsed;
        
      } catch (parseError) {
        console.error(`JSON parse error: ${parseError.message}`);
        console.error(`Content that failed to parse: ${content.substring(0, 1000)}`);
        
        if (attempt === maxRetries) {
          // Last attempt - try to create a basic structure
          console.log('Last attempt failed, creating fallback structure');
          return {
            candidate_name: null,
            contact_information: {
              email: null,
              phone: null,
              linkedin_url: null,
              github_url: null,
              portfolio_url: null,
              location: null
            },
            skills: [],
            work_experience: []
          };
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

// Enhanced data validation with fallback handling
function validateAndStructureData(data: any): any {
  console.log(`=== DATA VALIDATION STARTED ===`);
  
  // Ensure data exists and has basic structure
  if (!data || typeof data !== 'object') {
    console.log('Invalid data structure, creating fallback');
    data = {};
  }
  
  // Create structured output with proper defaults
  const structured = {
    candidate_name: null,
    contact_information: {
      email: null,
      phone: null,
      linkedin_url: null,
      github_url: null,
      portfolio_url: null,
      location: null
    },
    skills: [],
    work_experience: []
  };
  
  // Safely extract candidate name
  if (data.candidate_name && typeof data.candidate_name === 'string') {
    structured.candidate_name = data.candidate_name.trim() || null;
  }
  
  // Safely extract contact information
  if (data.contact_information && typeof data.contact_information === 'object') {
    const contact = data.contact_information;
    structured.contact_information = {
      email: (contact.email && typeof contact.email === 'string') ? contact.email.trim() || null : null,
      phone: (contact.phone && typeof contact.phone === 'string') ? contact.phone.trim() || null : null,
      linkedin_url: (contact.linkedin_url && typeof contact.linkedin_url === 'string') ? contact.linkedin_url.trim() || null : null,
      github_url: (contact.github_url && typeof contact.github_url === 'string') ? contact.github_url.trim() || null : null,
      portfolio_url: (contact.portfolio_url && typeof contact.portfolio_url === 'string') ? contact.portfolio_url.trim() || null : null,
      location: (contact.location && typeof contact.location === 'string') ? contact.location.trim() || null : null
    };
  }
  
  // Safely extract skills
  if (Array.isArray(data.skills)) {
    structured.skills = data.skills
      .filter(skill => skill && typeof skill === 'string')
      .map(skill => skill.trim())
      .filter(skill => skill.length > 0 && skill.length < 100)
      .slice(0, 50);
  }
  
  // Safely extract work experience
  if (Array.isArray(data.work_experience)) {
    structured.work_experience = data.work_experience
      .filter(exp => exp && typeof exp === 'object')
      .map(exp => ({
        job_title: (exp.job_title && typeof exp.job_title === 'string') ? exp.job_title.trim() || null : null,
        company_name: (exp.company_name && typeof exp.company_name === 'string') ? exp.company_name.trim() || null : null,
        start_date: (exp.start_date && typeof exp.start_date === 'string') ? exp.start_date.trim() || null : null,
        end_date: (exp.end_date && typeof exp.end_date === 'string') ? exp.end_date.trim() || null : null,
        responsibilities_achievements: Array.isArray(exp.responsibilities_achievements) 
          ? exp.responsibilities_achievements
              .filter(resp => resp && typeof resp === 'string')
              .map(resp => resp.trim())
              .filter(resp => resp.length > 0)
              .slice(0, 10)
          : []
      }))
      .filter(exp => exp.job_title || exp.company_name)
      .slice(0, 15);
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
    
    // Parse with AI
    const parsedData = await parseWithAI(extractedContent, groqApiKey);
    
    // Validate and structure the data
    const structuredData = validateAndStructureData(parsedData);
    
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
