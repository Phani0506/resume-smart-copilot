
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
    .replace(/[^\w\s@._\-(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Strategy 2: Extract readable characters only
  if (cleanedContent.length < 200) {
    let charFiltered = '';
    for (let i = 0; i < rawContent.length; i++) {
      const char = rawContent[i];
      const code = char.charCodeAt(0);
      
      if ((code >= 32 && code <= 126) || 
          (code >= 160 && code <= 255) || 
          char === '\n' || char === '\r' || char === '\t' ||
          /[a-zA-Z0-9\s@._\-]/.test(char)) {
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
  
  const result = cleanedContent.substring(0, 6000).trim();
  console.log(`Extracted content length: ${result.length} characters`);
  console.log(`Sample: ${result.substring(0, 200)}...`);
  
  return result;
}

// Robust AI parsing with exponential backoff
async function parseWithAI(content: string, groqApiKey: string): Promise<any> {
  console.log(`=== AI PARSING STARTED ===`);
  
  const systemPrompt = `You are an expert resume parser. Extract information from resume text and return ONLY valid JSON. No explanations, no markdown formatting, just clean JSON.`;
  
  // Step 1: Extract basic contact information
  console.log(`Step 1: Extracting contact information...`);
  const contactPrompt = `Extract contact information from this resume text:

${content.substring(0, 2000)}

Return ONLY this JSON structure (fill empty string if not found):
{
  "full_name": "",
  "email": "",
  "phone_number": "",
  "linkedin_url": "",
  "location": ""
}`;

  const contactInfo = await callGroqWithRetry(contactPrompt, groqApiKey, systemPrompt);
  console.log(`Contact info:`, contactInfo);

  // Step 2: Extract skills
  console.log(`Step 2: Extracting skills...`);
  const skillsPrompt = `Extract ALL technical skills, tools, and technologies from this resume:

${content}

Return ONLY a JSON array of skills like:
["JavaScript", "Python", "React", "Node.js", "AWS"]`;

  const skillsResult = await callGroqWithRetry(skillsPrompt, groqApiKey, systemPrompt);
  const skills = Array.isArray(skillsResult) ? skillsResult : [];
  console.log(`Skills found: ${skills.length}`);

  // Step 3: Extract work experience
  console.log(`Step 3: Extracting work experience...`);
  const experiencePrompt = `Extract work experience from this resume:

${content}

Return ONLY this JSON structure:
[
  {
    "company": "",
    "position": "",
    "duration": "",
    "description": ""
  }
]`;

  const experienceResult = await callGroqWithRetry(experiencePrompt, groqApiKey, systemPrompt);
  const experience = Array.isArray(experienceResult) ? experienceResult : [];
  console.log(`Experience entries: ${experience.length}`);

  // Step 4: Extract education
  console.log(`Step 4: Extracting education...`);
  const educationPrompt = `Extract education information from this resume:

${content}

Return ONLY this JSON structure:
[
  {
    "institution": "",
    "degree": "",
    "field_of_study": "",
    "graduation_year": ""
  }
]`;

  const educationResult = await callGroqWithRetry(educationPrompt, groqApiKey, systemPrompt);
  const education = Array.isArray(educationResult) ? educationResult : [];
  console.log(`Education entries: ${education.length}`);

  // Step 5: Generate professional summary
  console.log(`Step 5: Generating summary...`);
  const summaryPrompt = `Based on this resume, write a 2-3 sentence professional summary:

${content.substring(0, 1500)}

Return ONLY the summary text, no JSON.`;

  const summaryResult = await callGroqWithRetry(summaryPrompt, groqApiKey, systemPrompt);
  const professionalSummary = typeof summaryResult === 'string' ? summaryResult : '';

  // Combine all data
  const finalData = {
    full_name: (contactInfo?.full_name || '').trim(),
    email: (contactInfo?.email || '').trim(),
    phone_number: (contactInfo?.phone_number || '').trim(),
    linkedin_url: (contactInfo?.linkedin_url || '').trim(),
    location: (contactInfo?.location || '').trim(),
    professional_summary: professionalSummary.substring(0, 500).trim(),
    work_experience: experience.slice(0, 10),
    education: education.slice(0, 5),
    skills: skills.slice(0, 30),
    projects: []
  };

  console.log(`=== PARSING COMPLETED ===`);
  console.log(`Final data summary:`, {
    name: finalData.full_name ? 'Found' : 'Not found',
    email: finalData.email ? 'Found' : 'Not found',
    skills_count: finalData.skills.length,
    experience_count: finalData.work_experience.length,
    education_count: finalData.education.length
  });

  return finalData;
}

// Enhanced Groq API call with exponential backoff and circuit breaker
async function callGroqWithRetry(prompt: string, groqApiKey: string, systemPrompt: string, maxRetries = 5): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Groq API attempt ${attempt}/${maxRetries}`);
      
      // Exponential backoff delay
      if (attempt > 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 2), 10000);
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
          max_tokens: 1500,
          top_p: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Groq API error ${response.status}: ${errorText}`);
        
        if (response.status === 429) {
          // Rate limit - continue to retry
          console.log(`Rate limited, will retry...`);
          continue;
        } else if (response.status >= 500) {
          // Server error - retry
          console.log(`Server error, will retry...`);
          continue;
        } else {
          // Client error - don't retry
          throw new Error(`Groq API client error: ${response.status}`);
        }
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content in Groq response');
      }

      console.log(`AI Response: ${content.substring(0, 100)}...`);

      // Try to parse as JSON
      try {
        const cleanedContent = content
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .trim();
        
        // Find JSON boundaries
        const jsonStart = cleanedContent.search(/[{\[]/);
        const jsonEnd = cleanedContent.search(/[}\]](?!.*[}\]])/) + 1;
        
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          const jsonStr = cleanedContent.substring(jsonStart, jsonEnd);
          return JSON.parse(jsonStr);
        } else {
          // Not JSON - return as string for summary
          return cleanedContent;
        }
      } catch (parseError) {
        console.log(`JSON parse failed, returning raw content`);
        return content.trim();
      }
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw new Error(`All ${maxRetries} attempts failed. Last error: ${error.message}`);
      }
    }
  }
}

// Data validation and cleaning
function validateAndCleanData(data: any): any {
  console.log(`=== DATA VALIDATION STARTED ===`);
  
  const cleaned = {
    full_name: String(data.full_name || '').trim(),
    email: String(data.email || '').trim(),
    phone_number: String(data.phone_number || '').trim(),
    linkedin_url: String(data.linkedin_url || '').trim(),
    location: String(data.location || '').trim(),
    professional_summary: String(data.professional_summary || '').trim(),
    work_experience: [],
    education: [],
    skills: [],
    projects: []
  };
  
  // Clean work experience
  if (Array.isArray(data.work_experience)) {
    cleaned.work_experience = data.work_experience
      .map((exp: any) => ({
        company: String(exp.company || '').trim(),
        position: String(exp.position || '').trim(),
        duration: String(exp.duration || '').trim(),
        description: String(exp.description || '').trim()
      }))
      .filter((exp: any) => exp.company || exp.position)
      .slice(0, 10);
  }
  
  // Clean education
  if (Array.isArray(data.education)) {
    cleaned.education = data.education
      .map((edu: any) => ({
        institution: String(edu.institution || '').trim(),
        degree: String(edu.degree || '').trim(),
        field_of_study: String(edu.field_of_study || '').trim(),
        graduation_year: String(edu.graduation_year || '').trim()
      }))
      .filter((edu: any) => edu.institution || edu.degree)
      .slice(0, 5);
  }
  
  // Clean skills
  if (Array.isArray(data.skills)) {
    cleaned.skills = data.skills
      .map((skill: any) => String(skill).trim())
      .filter((skill: string) => skill.length > 0 && skill.length < 50)
      .slice(0, 30);
  }
  
  console.log(`Validation complete:`, {
    name: cleaned.full_name ? 'Valid' : 'Missing',
    email: cleaned.email ? 'Valid' : 'Missing',
    skills: cleaned.skills.length,
    experience: cleaned.work_experience.length,
    education: cleaned.education.length
  });
  
  return cleaned;
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

    // Download file
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
    
    // Validate and clean
    const cleanedData = validateAndCleanData(parsedData);
    
    // Check if we got meaningful data
    const hasData = cleanedData.full_name || 
                   cleanedData.email || 
                   cleanedData.skills.length > 0 || 
                   cleanedData.work_experience.length > 0;
    
    if (!hasData) {
      console.warn('WARNING: Limited data extracted');
    }

    // Update database
    const { error: updateError } = await supabase
      .from('resumes')
      .update({
        parsed_data: cleanedData,
        skills_extracted: cleanedData.skills,
        upload_status: 'parsed_success'
      })
      .eq('id', resumeId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Failed to save parsed data: ${updateError.message}`);
    }

    console.log('=== PARSING COMPLETED SUCCESSFULLY ===');

    return new Response(JSON.stringify({ 
      success: true, 
      parsedData: cleanedData,
      skillsCount: cleanedData.skills.length,
      experienceCount: cleanedData.work_experience.length,
      educationCount: cleanedData.education.length,
      message: 'Resume parsed successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== PARSING FAILED ===');
    console.error('Error:', error.message);
    
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
