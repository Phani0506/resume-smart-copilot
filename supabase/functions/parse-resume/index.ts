
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced content extraction with multiple strategies
function extractContentFromFile(rawContent: string, contentType: string): string {
  console.log(`=== CONTENT EXTRACTION STARTED ===`);
  console.log(`Content type: ${contentType}`);
  console.log(`Raw content length: ${rawContent.length} characters`);
  
  if (!rawContent || rawContent.length < 10) {
    throw new Error('File contains no readable content');
  }
  
  let extractedText = '';
  
  // Strategy 1: Handle DOCX files (look for XML content)
  if (contentType?.includes('wordprocessingml') || contentType?.includes('docx')) {
    console.log('Processing DOCX content');
    
    // Extract text from Word document XML structure
    const xmlMatches = rawContent.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (xmlMatches && xmlMatches.length > 0) {
      extractedText = xmlMatches
        .map(match => match.replace(/<[^>]+>/g, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      console.log(`Extracted ${extractedText.length} chars from DOCX XML`);
    }
    
    // Fallback: Look for text between XML tags
    if (extractedText.length < 100) {
      const textBetweenTags = rawContent.match(/>[^<]{3,}/g);
      if (textBetweenTags) {
        extractedText = textBetweenTags
          .map(match => match.substring(1).trim())
          .filter(text => text.length > 2 && /[a-zA-Z]/.test(text))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
  }
  
  // Strategy 2: Handle PDF files with better text pattern extraction
  if (contentType?.includes('pdf') || extractedText.length < 100) {
    console.log('Processing PDF content');
    
    // Look for PDF text streams
    const streamMatches = rawContent.match(/stream\s*([\s\S]*?)\s*endstream/g);
    if (streamMatches) {
      for (const stream of streamMatches) {
        const streamContent = stream.replace(/^stream\s*|\s*endstream$/g, '');
        const readableText = extractReadableText(streamContent);
        if (readableText.length > extractedText.length) {
          extractedText = readableText;
        }
      }
    }
    
    // Look for text objects in PDF
    const textObjects = rawContent.match(/\(([^)]{3,})\)\s*Tj/g);
    if (textObjects && textObjects.length > 0) {
      const pdfText = textObjects
        .map(match => match.replace(/[()]/g, '').replace(/\s*Tj\s*$/g, ''))
        .filter(text => text.length > 1 && /[a-zA-Z0-9@.]/.test(text))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (pdfText.length > extractedText.length) {
        extractedText = pdfText;
      }
    }
  }
  
  // Strategy 3: General ASCII text extraction for all formats
  if (extractedText.length < 100) {
    console.log('Using general ASCII extraction');
    extractedText = extractReadableText(rawContent);
  }
  
  // Clean and enhance the extracted text
  extractedText = cleanExtractedText(extractedText);
  
  if (extractedText.length < 50) {
    throw new Error('Could not extract sufficient readable content from file');
  }
  
  const result = extractedText.substring(0, 12000); // Increased limit
  console.log(`Final extracted content length: ${result.length} characters`);
  console.log(`Sample: ${result.substring(0, 300)}...`);
  
  return result;
}

function extractReadableText(content: string): string {
  let text = '';
  let wordBuffer = '';
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const code = char.charCodeAt(0);
    
    // Include printable ASCII characters and common symbols
    if ((code >= 32 && code <= 126) || char === '\n' || char === '\r' || char === '\t') {
      if (/[a-zA-Z0-9\s@._\-+#():\/\\]/.test(char)) {
        wordBuffer += char;
      } else if (wordBuffer.length > 0) {
        text += wordBuffer + ' ';
        wordBuffer = '';
      }
    } else if (wordBuffer.length > 0) {
      text += wordBuffer + ' ';
      wordBuffer = '';
    }
  }
  
  if (wordBuffer.length > 0) {
    text += wordBuffer;
  }
  
  return text.replace(/\s+/g, ' ').trim();
}

function cleanExtractedText(text: string): string {
  return text
    // Remove PDF artifacts
    .replace(/obj\s+\d+/g, ' ')
    .replace(/endobj/g, ' ')
    .replace(/\/[A-Z][A-Za-z0-9]*\s*/g, ' ')
    .replace(/<<[^>]*>>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    // Remove excessive whitespace and special characters
    .replace(/[^\w\s@._\-(),+#:\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(\w)\s+(\w)/g, '$1 $2')
    .trim();
}

// Enhanced AI parsing with better prompts and validation
async function parseWithAI(content: string, groqApiKey: string): Promise<any> {
  console.log(`=== AI PARSING STARTED ===`);
  console.log(`Content length: ${content.length} characters`);
  
  const systemPrompt = `You are a professional resume parsing expert. Your task is to extract specific information from resume text and return ONLY a valid JSON object.

CRITICAL INSTRUCTIONS:
1. Return ONLY valid JSON - no explanations, no markdown, no text before or after
2. Your response must start with { and end with }
3. Extract information exactly as found - do not invent or guess
4. For missing information, use null for strings/objects or [] for arrays
5. Be thorough in extracting all skills, experience, and contact details

EXTRACTION RULES:
- candidate_name: Look for the person's full name (usually at the top)
- email: Extract any email addresses (look for @ symbol)
- phone: Extract phone numbers (various formats)
- skills: Include ALL technical skills, programming languages, tools, software, certifications
- work_experience: Extract ALL job positions with dates and responsibilities
- dates: Keep original format (e.g., "Jan 2020", "2019-2021", "Present")`;

  const extractionPrompt = `Extract information from this resume and return ONLY the JSON object:

${content}

Return ONLY this JSON structure:
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
  "skills": ["extract", "all", "skills"],
  "work_experience": [
    {
      "job_title": "job title",
      "company_name": "company name",
      "start_date": "start date",
      "end_date": "end date or Present",
      "responsibilities_achievements": ["responsibility 1", "responsibility 2"]
    }
  ]
}`;

  const models = ['llama3-8b-8192', 'llama3-70b-8192', 'mixtral-8x7b-32768'];
  let lastError = null;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Attempt ${attempt}/3`);
      
      if (attempt > 1) {
        const delay = Math.min(5000 * attempt, 15000);
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
          max_tokens: 4000,
          top_p: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Groq API error ${response.status}: ${errorText}`);
        
        if (response.status === 429) {
          const waitTime = Math.min(15000 * attempt, 60000);
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
      const aiContent = data.choices?.[0]?.message?.content;
      
      if (!aiContent) {
        throw new Error('No content in Groq response');
      }

      console.log(`Raw AI Response: ${aiContent.substring(0, 500)}...`);
      
      // Enhanced JSON parsing
      const parsed = parseJSONResponse(aiContent);
      
      if (parsed) {
        console.log(`Successfully parsed AI response on attempt ${attempt}`);
        return parsed;
      } else {
        throw new Error('Failed to parse JSON from AI response');
      }
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      lastError = error;
      
      if (attempt === 3) {
        console.log('All attempts failed, creating enhanced fallback');
        return createEnhancedFallback(content);
      }
    }
  }
  
  throw lastError || new Error('All parsing attempts failed');
}

function parseJSONResponse(aiContent: string): any {
  try {
    // Clean the response
    let jsonStr = aiContent.trim();
    
    // Remove markdown code blocks
    jsonStr = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');
    
    // Extract JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    // Clean common issues
    jsonStr = jsonStr
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/\n/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`Parsing cleaned JSON: ${jsonStr.substring(0, 200)}...`);
    
    const parsed = JSON.parse(jsonStr);
    
    // Validate structure
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    
    return null;
  } catch (error) {
    console.error(`JSON parse error: ${error.message}`);
    return null;
  }
}

function createEnhancedFallback(content: string): any {
  console.log('Creating enhanced fallback with basic extraction');
  
  const fallback = {
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
  
  // Basic email extraction
  const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    fallback.contact_information.email = emailMatch[0];
  }
  
  // Basic phone extraction
  const phoneMatch = content.match(/[\+]?[1-9]?[\-\.\s]?\(?[0-9]{3}\)?[\-\.\s]?[0-9]{3}[\-\.\s]?[0-9]{4}/);
  if (phoneMatch) {
    fallback.contact_information.phone = phoneMatch[0];
  }
  
  // Basic LinkedIn extraction
  const linkedinMatch = content.match(/linkedin\.com\/in\/[a-zA-Z0-9\-]+/);
  if (linkedinMatch) {
    fallback.contact_information.linkedin_url = linkedinMatch[0];
  }
  
  // Basic skills extraction (common technical terms)
  const skillKeywords = [
    'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'HTML', 'CSS', 
    'SQL', 'Git', 'AWS', 'Docker', 'TypeScript', 'Angular', 'Vue.js',
    'MongoDB', 'PostgreSQL', 'MySQL', 'Express', 'Django', 'Flask',
    'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin'
  ];
  
  skillKeywords.forEach(skill => {
    const regex = new RegExp(`\\b${skill}\\b`, 'i');
    if (regex.test(content)) {
      fallback.skills.push(skill);
    }
  });
  
  return fallback;
}

// Enhanced validation with more flexible rules
function validateAndStructureData(data: any): any {
  console.log(`=== DATA VALIDATION STARTED ===`);
  
  if (!data || typeof data !== 'object') {
    console.log('Invalid data structure, using fallback');
    return createEnhancedFallback('');
  }
  
  const result = {
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
  
  // Validate candidate name (more flexible)
  if (data.candidate_name && typeof data.candidate_name === 'string') {
    const name = data.candidate_name.trim();
    if (name.length > 0 && name.length < 150 && /[a-zA-Z]/.test(name)) {
      result.candidate_name = name;
    }
  }
  
  // Validate contact information
  if (data.contact_information && typeof data.contact_information === 'object') {
    const contact = data.contact_information;
    
    // Email validation
    if (contact.email && typeof contact.email === 'string' && contact.email.includes('@')) {
      const email = contact.email.trim().toLowerCase();
      if (email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        result.contact_information.email = email;
      }
    }
    
    // Phone validation (more flexible)
    if (contact.phone && typeof contact.phone === 'string') {
      const phone = contact.phone.trim();
      if (phone.length > 6 && /[\d\-\(\)\s\+]/.test(phone)) {
        result.contact_information.phone = phone;
      }
    }
    
    // URL validations
    ['linkedin_url', 'github_url', 'portfolio_url'].forEach(field => {
      if (contact[field] && typeof contact[field] === 'string') {
        const url = contact[field].trim();
        if (url.length > 5 && (url.includes('http') || url.includes('www.') || url.includes('.com'))) {
          result.contact_information[field] = url;
        }
      }
    });
    
    // Location validation
    if (contact.location && typeof contact.location === 'string') {
      const location = contact.location.trim();
      if (location.length > 0 && location.length < 200) {
        result.contact_information.location = location;
      }
    }
  }
  
  // Validate skills (more inclusive)
  if (Array.isArray(data.skills)) {
    result.skills = data.skills
      .filter(skill => skill && typeof skill === 'string')
      .map(skill => skill.trim())
      .filter(skill => skill.length > 0 && skill.length < 100)
      .slice(0, 100); // Increased limit
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
        
        // More flexible validation for job fields
        if (exp.job_title && typeof exp.job_title === 'string') {
          const title = exp.job_title.trim();
          if (title.length > 0 && title.length < 200) {
            experience.job_title = title;
          }
        }
        
        if (exp.company_name && typeof exp.company_name === 'string') {
          const company = exp.company_name.trim();
          if (company.length > 0 && company.length < 200) {
            experience.company_name = company;
          }
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
            .filter(resp => resp.length > 0 && resp.length < 1000)
            .slice(0, 20); // Increased limit
        }
        
        return experience;
      })
      .filter(exp => exp.job_title || exp.company_name) // Keep if has either
      .slice(0, 25); // Increased limit
  }
  
  console.log(`Validation complete - Name: ${result.candidate_name ? 'Found' : 'Missing'}, Email: ${result.contact_information.email ? 'Found' : 'Missing'}, Skills: ${result.skills.length}, Experience: ${result.work_experience.length}`);
  
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

    console.log(`Processing: ${resume.file_name} (${resume.content_type})`);

    // Download file from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('user-resumes')
      .download(resume.storage_path);

    if (fileError) {
      console.error('File download error:', fileError);
      throw new Error(`File download failed: ${fileError.message}`);
    }

    // Extract text content with content type awareness
    const rawContent = await fileData.text();
    const extractedContent = extractContentFromFile(rawContent, resume.content_type);
    
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
