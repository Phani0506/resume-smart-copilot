import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Multi-strategy content extraction with enhanced techniques
function extractResumeContent(content: string): string {
  console.log(`=== CONTENT EXTRACTION STARTED ===`);
  console.log(`Original content length: ${content.length} characters`);
  
  let extractedText = '';
  let bestStrategy = '';
  
  // Strategy 1: Extract readable text with enhanced patterns
  console.log(`Trying Strategy 1: Pattern-based extraction...`);
  const enhancedPatterns = [
    // Names and proper nouns
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
    // Email addresses
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    // Phone numbers (various formats)
    /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    // Skills and technologies (common programming terms)
    /\b(?:JavaScript|Python|Java|React|Node\.js|SQL|HTML|CSS|Angular|Vue|Docker|AWS|Git|Linux|Windows|MacOS|Office|Excel|PowerPoint|Word|Photoshop|Illustrator|Figma|Sketch)\b/gi,
    // Experience indicators
    /\b(?:years?|months?|experience|worked|developed|managed|led|created|built|designed|implemented)\b/gi,
    // Education keywords
    /\b(?:University|College|Bachelor|Master|PhD|Degree|Graduate|School|Institute|Academy)\b/gi,
    // Common resume sections
    /\b(?:Experience|Education|Skills|Projects|Certifications|Achievements|Summary|Objective|Contact|Profile)\b/gi,
    // Complete sentences and phrases
    /[A-Z][^.!?]*[.!?]/g,
    // Word sequences (minimum 3 words)
    /\b[A-Za-z]+(?:\s+[A-Za-z]+){2,}\b/g,
  ];
  
  let strategy1Text = '';
  enhancedPatterns.forEach((pattern, index) => {
    const matches = content.match(pattern) || [];
    console.log(`Pattern ${index + 1} found ${matches.length} matches`);
    strategy1Text += matches.join(' ') + ' ';
  });
  
  if (strategy1Text.length > 200) {
    extractedText = strategy1Text;
    bestStrategy = 'Pattern-based extraction';
  }
  
  // Strategy 2: Clean PDF markers and extract readable content
  console.log(`Trying Strategy 2: PDF cleaning extraction...`);
  const strategy2Text = content
    // Remove PDF structure markers
    .replace(/%PDF-[\d.]+/g, ' ')
    .replace(/%%EOF/g, ' ')
    .replace(/\d+\s+\d+\s+obj/g, ' ')
    .replace(/endobj/g, ' ')
    .replace(/stream\s*[\s\S]*?\s*endstream/g, ' ')
    .replace(/\/[A-Z][A-Za-z0-9]*\s*/g, ' ')
    .replace(/<<[^>]*>>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    // Remove non-readable characters but keep important punctuation
    .replace(/[^\w\s@._\-(),]/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  if (strategy2Text.length > extractedText.length && strategy2Text.length > 200) {
    extractedText = strategy2Text;
    bestStrategy = 'PDF cleaning extraction';
  }
  
  // Strategy 3: Character-by-character filtering for heavily encoded PDFs
  console.log(`Trying Strategy 3: Character filtering...`);
  let strategy3Text = '';
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const code = char.charCodeAt(0);
    
    // Keep readable ASCII characters, common punctuation, and some Unicode
    if ((code >= 32 && code <= 126) || // Basic ASCII
        (code >= 160 && code <= 255) || // Extended ASCII
        char === '\n' || char === '\r' || char === '\t') {
      strategy3Text += char;
    } else if (code > 255 && /[a-zA-Z0-9\s]/.test(char)) {
      // Keep Unicode letters and numbers
      strategy3Text += char;
    }
  }
  
  strategy3Text = strategy3Text
    .replace(/\s+/g, ' ')
    .trim();
  
  if (strategy3Text.length > extractedText.length && strategy3Text.length > 200) {
    extractedText = strategy3Text;
    bestStrategy = 'Character filtering';
  }
  
  // Strategy 4: Extract everything and let AI filter
  console.log(`Trying Strategy 4: Raw content with minimal cleaning...`);
  if (extractedText.length < 100) {
    const strategy4Text = content
      .replace(/\0/g, ' ')
      .replace(/\x00/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (strategy4Text.length > 50) {
      extractedText = strategy4Text;
      bestStrategy = 'Raw content extraction';
    }
  }
  
  // Take meaningful portion (up to 4000 characters for better context)
  const result = extractedText.substring(0, 4000).trim();
  
  console.log(`=== EXTRACTION COMPLETED ===`);
  console.log(`Best strategy: ${bestStrategy}`);
  console.log(`Final extracted content length: ${result.length} characters`);
  console.log(`Sample content preview: ${result.substring(0, 500)}...`);
  
  return result;
}

// Enhanced parsing prompt with step-by-step procedure
function createStructuredParsingPrompt(content: string): string {
  return `You are a professional resume parser following a strict procedure. Extract information step by step and return ONLY a valid JSON object.

PARSING PROCEDURE - Follow these checkpoints in order:

CHECKPOINT 1: IDENTIFY NAME
- Look for the candidate's full name (usually at the top of the resume)
- Names are typically in larger fonts or at the beginning
- May be in formats like "John Smith", "JOHN SMITH", "John M. Smith"

CHECKPOINT 2: EXTRACT CONTACT INFO
- Find email address (contains @ symbol)
- Find phone number (various formats with numbers)
- Find LinkedIn URL (contains linkedin.com)
- Find location/address

CHECKPOINT 3: IDENTIFY SKILLS
- Look for "Skills", "Technical Skills", "Technologies" sections
- Extract programming languages, tools, frameworks, software
- Include both hard skills (technical) and soft skills
- Look throughout the document, not just in skills section

CHECKPOINT 4: EXTRACT WORK EXPERIENCE
- Look for "Experience", "Work Experience", "Employment" sections
- Extract company names, job titles, dates, descriptions
- May be in various formats: "Company Name | Position" or separate lines

CHECKPOINT 5: EXTRACT EDUCATION
- Look for "Education", "Academic Background" sections
- Extract institution names, degrees, fields of study, graduation years
- Include universities, colleges, certifications

CHECKPOINT 6: IDENTIFY PROJECTS (if any)
- Look for "Projects", "Personal Projects", "Portfolio" sections
- Extract project names, descriptions, technologies used

IMPORTANT RULES:
- Return ONLY valid JSON, no explanations
- If a section is not found, use empty string "" or empty array []
- Be thorough - extract ALL available information
- Do not make up information that's not in the resume

Resume content to parse:
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

// Enhanced retry function with better error handling
async function callGroqAPIWithRetry(prompt: string, groqApiKey: string, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`=== GROQ API CALL ATTEMPT ${attempt}/${maxRetries} ===`);
      
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
              content: 'You are a professional resume parser. Follow the parsing procedure step by step. Return only valid JSON with the exact structure requested. No explanations, no markdown formatting, just clean JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1, // Very low temperature for consistent parsing
          max_tokens: 2500,
          top_p: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Groq API error (attempt ${attempt}):`, response.status, errorText);
        
        if (attempt === maxRetries) {
          throw new Error(`AI service error after ${maxRetries} attempts: ${response.status}`);
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      const data = await response.json();
      console.log(`AI response received successfully on attempt ${attempt}`);
      
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid AI response structure - no content found');
      }
      
      return data;
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
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
    console.log('=== RESUME PARSING STARTED ===');
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
    
    // Extract meaningful content with enhanced multi-strategy approach
    const extractedContent = extractResumeContent(fullContent);
    
    if (extractedContent.length < 50) {
      console.error('Insufficient content extracted:', extractedContent.substring(0, 200));
      throw new Error('Could not extract meaningful content from resume. The file may be corrupted or in an unsupported format.');
    }
    
    const prompt = createStructuredParsingPrompt(extractedContent);

    // Call Groq API with retry logic
    const groqData = await callGroqAPIWithRetry(prompt, groqApiKey);
    
    const aiResponse = groqData.choices[0].message.content.trim();
    console.log('=== AI PARSING RESPONSE ===');
    console.log('Raw AI response length:', aiResponse.length);
    console.log('Response preview:', aiResponse.substring(0, 300) + '...');
    
    // Enhanced JSON parsing with multiple cleaning strategies
    let parsedData;
    try {
      let jsonText = aiResponse;
      
      console.log('=== JSON CLEANING STARTED ===');
      
      // Remove markdown formatting
      jsonText = jsonText.replace(/```json\s*/gi, '');
      jsonText = jsonText.replace(/```\s*/gi, '');
      jsonText = jsonText.replace(/^\s*```\s*/gm, '');
      jsonText = jsonText.replace(/\s*```\s*$/gm, '');
      
      // Find JSON object boundaries
      let startIndex = jsonText.indexOf('{');
      let endIndex = jsonText.lastIndexOf('}');
      
      if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        console.error('No valid JSON object boundaries found');
        throw new Error('No valid JSON object found in AI response');
      }
      
      jsonText = jsonText.substring(startIndex, endIndex + 1);
      
      // Clean up common JSON formatting issues
      jsonText = jsonText.replace(/,\s*}/g, '}'); // Remove trailing commas in objects
      jsonText = jsonText.replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
      jsonText = jsonText.replace(/\n\s*/g, ' '); // Remove line breaks
      
      console.log('Cleaned JSON length:', jsonText.length);
      
      // Parse the JSON
      parsedData = JSON.parse(jsonText);
      console.log('JSON parsing successful');
      
      // Validate and ensure required structure with comprehensive cleaning
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
            .slice(0, 100) : [], // Increased limit for skills
        projects: Array.isArray(parsedData.projects) ? 
          parsedData.projects.map((project: any) => ({
            name: String(project.name || '').trim(),
            description: String(project.description || '').trim(),
            technologies: Array.isArray(project.technologies) ? 
              project.technologies.map((tech: any) => String(tech).trim()).filter((tech: string) => tech.length > 0) : []
          })).filter((project: any) => project.name || project.description) : []
      };

      parsedData = cleanedData;

      // Log parsing results with checkpoint verification
      console.log('=== PARSING CHECKPOINTS VERIFICATION ===');
      console.log('✓ CHECKPOINT 1 - Name:', parsedData.full_name ? 'FOUND' : 'NOT FOUND');
      console.log('✓ CHECKPOINT 2 - Contact:', parsedData.email || parsedData.phone_number ? 'FOUND' : 'NOT FOUND');
      console.log('✓ CHECKPOINT 3 - Skills:', parsedData.skills.length, 'skills found');
      console.log('✓ CHECKPOINT 4 - Experience:', parsedData.work_experience.length, 'positions found');
      console.log('✓ CHECKPOINT 5 - Education:', parsedData.education.length, 'entries found');
      console.log('✓ CHECKPOINT 6 - Projects:', parsedData.projects.length, 'projects found');
      
    } catch (parseError) {
      console.error('=== JSON PARSING FAILED ===');
      console.error('Parse error:', parseError);
      console.error('Raw AI response was:', aiResponse);
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }

    // Validate that we extracted meaningful data
    const hasBasicInfo = parsedData.full_name || parsedData.email || parsedData.skills.length > 0 || 
                        parsedData.work_experience.length > 0 || parsedData.education.length > 0;
    
    if (!hasBasicInfo) {
      console.warn('=== WARNING: LIMITED DATA EXTRACTED ===');
      console.warn('Proceeding to save minimal data found');
    } else {
      console.log('=== SUCCESS: MEANINGFUL DATA EXTRACTED ===');
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

    console.log('=== RESUME PARSING COMPLETED SUCCESSFULLY ===');

    return new Response(JSON.stringify({ 
      success: true, 
      parsedData,
      checkpoints: {
        name: !!parsedData.full_name,
        contact: !!(parsedData.email || parsedData.phone_number),
        skills: parsedData.skills.length,
        experience: parsedData.work_experience.length,
        education: parsedData.education.length,
        projects: parsedData.projects.length
      },
      message: 'Resume parsed successfully with structured procedure' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== RESUME PARSING FAILED ===');
    console.error('Error details:', error);
    
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
