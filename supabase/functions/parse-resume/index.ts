
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
  
  const result = cleanedContent.substring(0, 12000).trim();
  console.log(`Extracted content length: ${result.length} characters`);
  console.log(`Sample: ${result.substring(0, 300)}...`);
  
  return result;
}

// Enhanced AI parsing with ultra-strict JSON-only prompt
async function parseWithAI(content: string, groqApiKey: string): Promise<any> {
  console.log(`=== AI PARSING STARTED ===`);
  
  // Ultra-strict system prompt that forces JSON output
  const systemPrompt = `You are a resume parsing API that outputs ONLY valid JSON. You MUST respond with a JSON object and absolutely nothing else - no explanations, no text, no markdown formatting, no conversational responses.

CRITICAL RULES:
1. Your response MUST start with { and end with }
2. Return ONLY valid JSON - no other text whatsoever
3. Never say things like "Unfortunately" or "I cannot find" - just return the JSON structure with null/empty values
4. If information is missing, use null for strings/objects or [] for arrays
5. Never explain what you're doing - just return the JSON
6. The JSON must be parseable by JSON.parse()`;

  // Main extraction prompt with explicit JSON template
  const extractionPrompt = `Extract information from this resume and return ONLY the JSON object below with the extracted data. Fill in missing fields with null or [].

RESUME TEXT:
${content}

RESPOND WITH ONLY THIS JSON STRUCTURE (no other text):

{
  "candidate_name": "extract full name or null",
  "contact_information": {
    "email": "extract email or null",
    "phone": "extract phone or null", 
    "linkedin_url": "extract LinkedIn URL or null",
    "github_url": "extract GitHub URL or null",
    "portfolio_url": "extract portfolio URL or null",
    "location": "extract location or null"
  },
  "skills": ["extract", "all", "skills", "found"],
  "work_experience": [
    {
      "job_title": "extract job title",
      "company_name": "extract company", 
      "start_date": "extract start date",
      "end_date": "extract end date or Present",
      "responsibilities_achievements": ["extract responsibilities"]
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

// Improved Groq API call with multiple model fallback strategy
async function callGroqWithRetry(prompt: string, groqApiKey: string, systemPrompt: string, maxRetries = 3): Promise<any> {
  const models = ['llama3-8b-8192', 'llama3-70b-8192', 'mixtral-8x7b-32768'];
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Groq API attempt ${attempt}/${maxRetries}`);
      
      // Progressive delays for retries
      if (attempt > 1) {
        const delay = Math.min(5000 * Math.pow(2, attempt - 2), 30000);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Try different models on different attempts
      const modelIndex = (attempt - 1) % models.length;
      const selectedModel = models[modelIndex];
      console.log(`Using model: ${selectedModel}`);
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
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
          max_tokens: 4000,
          top_p: 0.1,
          stop: null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Groq API error ${response.status}: ${errorText}`);
        
        if (response.status === 429) {
          // Rate limited - wait longer before retry
          const waitTime = Math.min(15000 * attempt, 60000);
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

      console.log(`Raw AI Response: ${content.substring(0, 500)}...`);

      // Ultra-strict JSON parsing with multiple strategies
      try {
        // Strategy 1: Direct parsing
        let jsonStr = content.trim();
        
        // Strategy 2: Extract JSON from any surrounding text
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
        
        // Strategy 3: Clean common issues
        jsonStr = jsonStr
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .replace(/`/g, '')
          .replace(/^[^{]*/, '') // Remove any text before first {
          .replace(/[^}]*$/, '') // Remove any text after last }
          .trim();
        
        // Strategy 4: Fix common JSON issues
        jsonStr = jsonStr
          .replace(/,\s*}/g, '}') // Remove trailing commas
          .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
          .replace(/\n/g, ' ') // Replace newlines with spaces
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        console.log(`Cleaned JSON string: ${jsonStr.substring(0, 300)}...`);
        
        const parsed = JSON.parse(jsonStr);
        console.log(`Successfully parsed JSON response`);
        return parsed;
        
      } catch (parseError) {
        console.error(`JSON parse error: ${parseError.message}`);
        console.error(`Failed content: ${content.substring(0, 1000)}`);
        
        if (attempt === maxRetries) {
          // Last attempt - create a structured fallback
          console.log('All attempts failed, creating fallback structure');
          return createFallbackStructure();
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

// Create a valid fallback structure
function createFallbackStructure(): any {
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

// Enhanced data validation with comprehensive structure checking
function validateAndStructureData(data: any): any {
  console.log(`=== DATA VALIDATION STARTED ===`);
  
  // Ensure data exists and has basic structure
  if (!data || typeof data !== 'object') {
    console.log('Invalid data structure, creating fallback');
    return createFallbackStructure();
  }
  
  // Create structured output with proper defaults
  const structured = createFallbackStructure();
  
  // Safely extract candidate name
  if (data.candidate_name && typeof data.candidate_name === 'string') {
    const name = data.candidate_name.trim();
    structured.candidate_name = name.length > 0 && name.length < 100 ? name : null;
  }
  
  // Safely extract contact information
  if (data.contact_information && typeof data.contact_information === 'object') {
    const contact = data.contact_information;
    
    // Email validation
    if (contact.email && typeof contact.email === 'string') {
      const email = contact.email.trim();
      if (email.includes('@') && email.includes('.')) {
        structured.contact_information.email = email;
      }
    }
    
    // Phone validation
    if (contact.phone && typeof contact.phone === 'string') {
      const phone = contact.phone.trim();
      if (phone.length >= 10) {
        structured.contact_information.phone = phone;
      }
    }
    
    // URL validations
    ['linkedin_url', 'github_url', 'portfolio_url'].forEach(urlField => {
      if (contact[urlField] && typeof contact[urlField] === 'string') {
        const url = contact[urlField].trim();
        if (url.length > 5) {
          structured.contact_information[urlField] = url;
        }
      }
    });
    
    // Location validation
    if (contact.location && typeof contact.location === 'string') {
      const location = contact.location.trim();
      if (location.length > 0 && location.length < 200) {
        structured.contact_information.location = location;
      }
    }
  }
  
  // Safely extract skills
  if (Array.isArray(data.skills)) {
    structured.skills = data.skills
      .filter(skill => skill && typeof skill === 'string')
      .map(skill => skill.trim())
      .filter(skill => skill.length > 0 && skill.length < 100)
      .slice(0, 50); // Limit to 50 skills
  }
  
  // Safely extract work experience
  if (Array.isArray(data.work_experience)) {
    structured.work_experience = data.work_experience
      .filter(exp => exp && typeof exp === 'object')
      .map(exp => {
        const experience = {
          job_title: null,
          company_name: null,
          start_date: null,
          end_date: null,
          responsibilities_achievements: []
        };
        
        // Validate job title
        if (exp.job_title && typeof exp.job_title === 'string') {
          const title = exp.job_title.trim();
          if (title.length > 0 && title.length < 200) {
            experience.job_title = title;
          }
        }
        
        // Validate company name
        if (exp.company_name && typeof exp.company_name === 'string') {
          const company = exp.company_name.trim();
          if (company.length > 0 && company.length < 200) {
            experience.company_name = company;
          }
        }
        
        // Validate dates
        if (exp.start_date && typeof exp.start_date === 'string') {
          const startDate = exp.start_date.trim();
          if (startDate.length > 0 && startDate.length < 50) {
            experience.start_date = startDate;
          }
        }
        
        if (exp.end_date && typeof exp.end_date === 'string') {
          const endDate = exp.end_date.trim();
          if (endDate.length > 0 && endDate.length < 50) {
            experience.end_date = endDate;
          }
        }
        
        // Validate responsibilities
        if (Array.isArray(exp.responsibilities_achievements)) {
          experience.responsibilities_achievements = exp.responsibilities_achievements
            .filter(resp => resp && typeof resp === 'string')
            .map(resp => resp.trim())
            .filter(resp => resp.length > 0 && resp.length < 1000)
            .slice(0, 15); // Limit to 15 responsibilities per job
        }
        
        return experience;
      })
      .filter(exp => exp.job_title || exp.company_name) // Keep only if has title or company
      .slice(0, 20); // Limit to 20 work experiences
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
