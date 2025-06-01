
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced PDF content extraction with multiple strategies
function extractResumeContent(content: string): string {
  console.log(`Original content length: ${content.length} characters`);
  
  let extractedText = '';
  
  // Strategy 1: Extract readable text patterns
  const textPatterns = [
    /[A-Za-z][A-Za-z\s]{3,}/g, // Words and phrases (minimum 4 chars)
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, // Names (Capital Case)
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, // Emails
    /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g, // Phone numbers
    /\b(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9-]+\b/gi, // LinkedIn URLs
  ];
  
  textPatterns.forEach(pattern => {
    const matches = content.match(pattern) || [];
    extractedText += matches.join(' ') + ' ';
  });
  
  // Strategy 2: Extract text between common PDF markers
  const cleanContent = content
    .replace(/%PDF-[\d.]+/g, ' ')
    .replace(/%%EOF/g, ' ')
    .replace(/\d+\s+\d+\s+obj/g, ' ')
    .replace(/endobj/g, ' ')
    .replace(/stream\s*[\s\S]*?\s*endstream/g, ' ')
    .replace(/\/[A-Z][A-Za-z0-9]*\s*/g, ' ')
    .replace(/<<[^>]*>>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^\w\s@._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Strategy 3: If first strategy didn't work well, use cleaned content
  if (extractedText.length < 200 && cleanContent.length > extractedText.length) {
    extractedText = cleanContent;
  }
  
  // Strategy 4: If still not enough content, extract everything readable
  if (extractedText.length < 100) {
    extractedText = content
      .replace(/[^\w\s@._-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Take meaningful portion (up to 3000 characters for better context)
  const result = extractedText.substring(0, 3000).trim();
  
  console.log(`Extracted content length: ${result.length} characters`);
  console.log(`Sample content: ${result.substring(0, 300)}...`);
  
  return result;
}

// Enhanced parsing prompt with specific instructions
function createParsingPrompt(content: string): string {
  return `You are a professional resume parser. Extract information from this resume text and return ONLY a valid JSON object.

IMPORTANT RULES:
- Return ONLY the JSON object, no explanations or markdown
- If information is not found, use empty string "" or empty array []
- Extract skills from any technical skills, tools, programming languages, or technologies mentioned
- Be thorough in extracting all available information

Resume content:
${content}

Return this exact JSON structure:
{
  "full_name": "",
  "email": "",
  "phone_number": "",
  "linkedin_url": "",
  "location": "",
  "professional_summary": "",
  "work_experience": [
    {
      "company": "",
      "position": "",
      "duration": "",
      "description": ""
    }
  ],
  "education": [
    {
      "institution": "",
      "degree": "",
      "field_of_study": "",
      "graduation_year": ""
    }
  ],
  "skills": [],
  "projects": [
    {
      "name": "",
      "description": "",
      "technologies": []
    }
  ]
}`;
}

// Retry function for API calls
async function callGroqAPIWithRetry(prompt: string, groqApiKey: string, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Groq API attempt ${attempt}/${maxRetries}...`);
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            {
              role: 'system',
              content: 'You are a precise resume parser. Return only valid JSON with the exact structure requested. No explanations, no markdown formatting, just clean JSON.'
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
        console.error(`Groq API error (attempt ${attempt}):`, response.status, errorText);
        
        if (attempt === maxRetries) {
          throw new Error(`AI service error: ${response.status}`);
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      const data = await response.json();
      console.log(`AI response received on attempt ${attempt}`);
      
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid AI response structure');
      }
      
      return data;
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
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
    
    // Extract meaningful content with enhanced extraction
    const extractedContent = extractResumeContent(fullContent);
    
    if (extractedContent.length < 50) {
      throw new Error('Could not extract meaningful content from resume');
    }
    
    const prompt = createParsingPrompt(extractedContent);

    // Call Groq API with retry logic
    const groqData = await callGroqAPIWithRetry(prompt, groqApiKey);
    
    const aiResponse = groqData.choices[0].message.content.trim();
    console.log('Raw AI response:', aiResponse.substring(0, 500) + '...');
    
    // Enhanced JSON parsing with multiple cleaning strategies
    let parsedData;
    try {
      let jsonText = aiResponse;
      
      // Remove markdown formatting
      jsonText = jsonText.replace(/```json\s*/gi, '');
      jsonText = jsonText.replace(/```\s*/gi, '');
      jsonText = jsonText.replace(/^\s*```\s*/gm, '');
      jsonText = jsonText.replace(/\s*```\s*$/gm, '');
      
      // Find JSON object boundaries
      let startIndex = jsonText.indexOf('{');
      let endIndex = jsonText.lastIndexOf('}');
      
      if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        throw new Error('No valid JSON object found in AI response');
      }
      
      jsonText = jsonText.substring(startIndex, endIndex + 1);
      
      // Additional cleaning
      jsonText = jsonText.replace(/,\s*}/g, '}'); // Remove trailing commas
      jsonText = jsonText.replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
      
      console.log('Cleaned JSON text length:', jsonText.length);
      
      // Parse the JSON
      parsedData = JSON.parse(jsonText);
      
      // Validate and ensure required structure
      const cleanedData = {
        full_name: String(parsedData.full_name || '').trim(),
        email: String(parsedData.email || '').trim(),
        phone_number: String(parsedData.phone_number || '').trim(),
        linkedin_url: String(parsedData.linkedin_url || '').trim(),
        location: String(parsedData.location || '').trim(),
        professional_summary: String(parsedData.professional_summary || '').trim(),
        work_experience: Array.isArray(parsedData.work_experience) ? 
          parsedData.work_experience.map((exp: any) => ({
            company: String(exp.company || '').trim(),
            position: String(exp.position || '').trim(),
            duration: String(exp.duration || '').trim(),
            description: String(exp.description || '').trim()
          })).filter((exp: any) => exp.company || exp.position) : [],
        education: Array.isArray(parsedData.education) ? 
          parsedData.education.map((edu: any) => ({
            institution: String(edu.institution || '').trim(),
            degree: String(edu.degree || '').trim(),
            field_of_study: String(edu.field_of_study || '').trim(),
            graduation_year: String(edu.graduation_year || '').trim()
          })).filter((edu: any) => edu.institution || edu.degree) : [],
        skills: Array.isArray(parsedData.skills) ? 
          parsedData.skills
            .map((skill: any) => String(skill).trim())
            .filter((skill: string) => skill.length > 0)
            .slice(0, 50) : [], // Limit to 50 skills
        projects: Array.isArray(parsedData.projects) ? 
          parsedData.projects.map((project: any) => ({
            name: String(project.name || '').trim(),
            description: String(project.description || '').trim(),
            technologies: Array.isArray(project.technologies) ? 
              project.technologies.map((tech: any) => String(tech).trim()).filter((tech: string) => tech.length > 0) : []
          })).filter((project: any) => project.name || project.description) : []
      };

      parsedData = cleanedData;

      console.log('Successfully parsed data:', {
        name: parsedData.full_name,
        email: parsedData.email,
        skills_count: parsedData.skills.length,
        work_experience_count: parsedData.work_experience.length,
        education_count: parsedData.education.length,
        projects_count: parsedData.projects.length
      });
      
    } catch (parseError) {
      console.error('JSON parsing failed:', parseError);
      console.error('Raw AI response was:', aiResponse);
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }

    // Ensure we have at least some meaningful data
    const hasBasicInfo = parsedData.full_name || parsedData.email || parsedData.skills.length > 0 || 
                        parsedData.work_experience.length > 0 || parsedData.education.length > 0;
    
    if (!hasBasicInfo) {
      console.warn('No meaningful data extracted, but saving what we have');
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
      workExperienceCount: parsedData.work_experience.length,
      educationCount: parsedData.education.length,
      projectsCount: parsedData.projects.length,
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
