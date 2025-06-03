
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Improved content extraction with better PDF text extraction
function extractContentFromFile(rawContent: string): string {
  console.log(`=== CONTENT EXTRACTION STARTED ===`);
  console.log(`Raw content length: ${rawContent.length} characters`);
  
  if (!rawContent || rawContent.length < 10) {
    throw new Error('File contains no readable content');
  }
  
  let extractedText = '';
  
  // Strategy 1: Look for text patterns in PDF content
  const textPatterns = rawContent.match(/\(([^)]+)\)Tj/g);
  if (textPatterns && textPatterns.length > 0) {
    console.log('Found text patterns in PDF');
    extractedText = textPatterns
      .map(match => match.replace(/[()]/g, '').replace('Tj', ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Strategy 2: Extract readable ASCII text
  if (extractedText.length < 100) {
    console.log('Using ASCII extraction method');
    let asciiText = '';
    for (let i = 0; i < rawContent.length; i++) {
      const char = rawContent[i];
      const code = char.charCodeAt(0);
      
      if ((code >= 32 && code <= 126) || char === '\n' || char === '\r' || char === '\t') {
        if (/[a-zA-Z0-9\s@._\-+#():\/]/.test(char)) {
          asciiText += char;
        }
      }
    }
    
    asciiText = asciiText
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s@._\-(),+#:\/]/g, ' ')
      .trim();
    
    if (asciiText.length > extractedText.length) {
      extractedText = asciiText;
    }
  }
  
  // Strategy 3: Clean up extracted content
  extractedText = extractedText
    .replace(/obj\s+\d+/g, ' ')
    .replace(/endobj/g, ' ')
    .replace(/stream\s*[\s\S]*?\s*endstream/g, ' ')
    .replace(/\/[A-Z][A-Za-z0-9]*\s*/g, ' ')
    .replace(/<<[^>]*>>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (extractedText.length < 50) {
    throw new Error('Could not extract sufficient readable content from file');
  }
  
  const result = extractedText.substring(0, 8000);
  console.log(`Extracted content length: ${result.length} characters`);
  console.log(`Sample: ${result.substring(0, 200)}...`);
  
  return result;
}

// Enhanced AI parsing with strict JSON-only output
async function parseWithAI(content: string, groqApiKey: string): Promise<any> {
  console.log(`=== AI PARSING STARTED ===`);
  
  const systemPrompt = `You are a precise resume parsing API. You MUST respond with ONLY valid JSON - no explanations, no text, no markdown formatting.

CRITICAL RULES:
1. Your response MUST start with { and end with }
2. Return ONLY valid JSON that can be parsed by JSON.parse()
3. Never include explanations or conversational text
4. If information is missing, use null for strings/objects or [] for arrays
5. Do not invent or hallucinate information`;

  const extractionPrompt = `Parse this resume content and return ONLY the JSON object below with extracted data:

RESUME TEXT:
${content}

Return ONLY this JSON structure (no other text):

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
      "responsibilities_achievements": ["extract key responsibilities"]
    }
  ]
}`;

  const models = ['llama3-8b-8192', 'llama3-70b-8192', 'mixtral-8x7b-32768'];
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Groq API attempt ${attempt}/3`);
      
      if (attempt > 1) {
        const delay = Math.min(3000 * attempt, 10000);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: extractionPrompt }
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
          const waitTime = Math.min(10000 * attempt, 30000);
          console.log(`Rate limited, waiting ${waitTime}ms...`);
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

      console.log(`Raw AI Response: ${content.substring(0, 300)}...`);

      // Parse JSON response with error handling
      try {
        let jsonStr = content.trim();
        
        // Extract JSON from response
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
        
        // Clean the JSON string
        jsonStr = jsonStr
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .trim();
        
        console.log(`Parsing JSON: ${jsonStr.substring(0, 200)}...`);
        
        const parsed = JSON.parse(jsonStr);
        console.log(`Successfully parsed AI response`);
        return parsed;
        
      } catch (parseError) {
        console.error(`JSON parse error: ${parseError.message}`);
        
        if (attempt === 3) {
          console.log('All attempts failed, creating fallback structure');
          return createFallbackStructure();
        }
        continue;
      }
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === 3) {
        throw new Error(`All attempts failed. Last error: ${error.message}`);
      }
    }
  }
}

// Create fallback structure when parsing fails
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

// Validate and clean extracted data
function validateAndStructureData(data: any): any {
  console.log(`=== DATA VALIDATION STARTED ===`);
  
  if (!data || typeof data !== 'object') {
    console.log('Invalid data structure, using fallback');
    return createFallbackStructure();
  }
  
  const result = createFallbackStructure();
  
  // Validate candidate name
  if (data.candidate_name && typeof data.candidate_name === 'string') {
    const name = data.candidate_name.trim();
    if (name.length > 0 && name.length < 100) {
      result.candidate_name = name;
    }
  }
  
  // Validate contact information
  if (data.contact_information && typeof data.contact_information === 'object') {
    const contact = data.contact_information;
    
    if (contact.email && typeof contact.email === 'string' && contact.email.includes('@')) {
      result.contact_information.email = contact.email.trim();
    }
    
    if (contact.phone && typeof contact.phone === 'string') {
      result.contact_information.phone = contact.phone.trim();
    }
    
    ['linkedin_url', 'github_url', 'portfolio_url', 'location'].forEach(field => {
      if (contact[field] && typeof contact[field] === 'string') {
        const value = contact[field].trim();
        if (value.length > 0) {
          result.contact_information[field] = value;
        }
      }
    });
  }
  
  // Validate skills
  if (Array.isArray(data.skills)) {
    result.skills = data.skills
      .filter(skill => skill && typeof skill === 'string')
      .map(skill => skill.trim())
      .filter(skill => skill.length > 0)
      .slice(0, 50);
  }
  
  // Validate work experience
  if (Array.isArray(data.work_experience)) {
    result.work_experience = data.work_experience
      .filter(exp => exp && typeof exp === 'object')
      .map(exp => {
        const experience = {
          job_title: null,
          company_name: null,
          start_date: null,
          end_date: null,
          responsibilities_achievements: []
        };
        
        if (exp.job_title && typeof exp.job_title === 'string') {
          experience.job_title = exp.job_title.trim();
        }
        
        if (exp.company_name && typeof exp.company_name === 'string') {
          experience.company_name = exp.company_name.trim();
        }
        
        if (exp.start_date && typeof exp.start_date === 'string') {
          experience.start_date = exp.start_date.trim();
        }
        
        if (exp.end_date && typeof exp.end_date === 'string') {
          experience.end_date = exp.end_date.trim();
        }
        
        if (Array.isArray(exp.responsibilities_achievements)) {
          experience.responsibilities_achievements = exp.responsibilities_achievements
            .filter(resp => resp && typeof resp === 'string')
            .map(resp => resp.trim())
            .filter(resp => resp.length > 0)
            .slice(0, 10);
        }
        
        return experience;
      })
      .filter(exp => exp.job_title || exp.company_name)
      .slice(0, 15);
  }
  
  console.log(`Validation complete - Name: ${result.candidate_name ? 'Found' : 'Missing'}, Skills: ${result.skills.length}, Experience: ${result.work_experience.length}`);
  
  return result;
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
    const validatedData = validateAndStructureData(parsedData);
    
    // Update database with parsed data
    const { error: updateError } = await supabase
      .from('resumes')
      .update({
        parsed_data: validatedData,
        skills_extracted: validatedData.skills,
        upload_status: 'parsed_success'
      })
      .eq('id', resumeId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Failed to save parsed data: ${updateError.message}`);
    }

    console.log('=== PARSING COMPLETED SUCCESSFULLY ===');
    console.log(`Extracted data summary:`, {
      candidate_name: validatedData.candidate_name,
      email: validatedData.contact_information.email,
      skills_count: validatedData.skills.length,
      experience_count: validatedData.work_experience.length
    });

    return new Response(JSON.stringify({ 
      success: true, 
      parsedData: validatedData,
      skillsCount: validatedData.skills.length,
      experienceCount: validatedData.work_experience.length,
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
