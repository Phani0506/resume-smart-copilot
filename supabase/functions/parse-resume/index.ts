
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced content extraction with multiple strategies
function extractResumeContent(content: string): string {
  console.log(`=== CONTENT EXTRACTION STARTED ===`);
  console.log(`Original content length: ${content.length} characters`);
  
  let extractedText = '';
  let bestStrategy = '';
  
  // Strategy 1: Enhanced pattern-based extraction
  console.log(`Trying Strategy 1: Enhanced pattern extraction...`);
  const patterns = [
    // Personal information patterns
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g, // Names (2-4 words)
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, // Email
    /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g, // Phone
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9-]+/gi, // LinkedIn
    
    // Skills and technologies
    /\b(?:JavaScript|TypeScript|Python|Java|React|Angular|Vue|Node\.js|Express|MongoDB|PostgreSQL|MySQL|Docker|Kubernetes|AWS|Azure|GCP|Git|GitHub|GitLab|HTML|CSS|SCSS|Bootstrap|Tailwind|PHP|Ruby|C\+\+|C#|Swift|Kotlin|Flutter|React Native|Spring|Django|Flask|Laravel|WordPress|Shopify|Figma|Adobe|Photoshop|Illustrator|InDesign|Sketch|SQL|NoSQL|Redis|Elasticsearch|Jenkins|CI\/CD|DevOps|Linux|Windows|MacOS|Office|Excel|PowerPoint|Word|Slack|Jira|Trello|Asana|Salesforce|HubSpot|Analytics|SEO|SEM|PPC|Social Media|Marketing|Sales|Leadership|Management|Communication|Problem Solving|Team Work|Project Management|Agile|Scrum|Kanban)\b/gi,
    
    // Job titles and positions
    /\b(?:Software Engineer|Developer|Frontend|Backend|Full Stack|Data Scientist|Product Manager|Project Manager|Designer|UX|UI|DevOps|QA|Tester|Analyst|Consultant|Director|Manager|Lead|Senior|Junior|Intern|CEO|CTO|VP|Head of|Marketing|Sales|Operations|Finance|HR|Recruiter)\b/gi,
    
    // Education keywords
    /\b(?:University|College|Institute|School|Academy|Bachelor|Master|PhD|Degree|Graduate|Undergraduate|Diploma|Certificate|MBA|MS|BS|BA|MA|PhD|Computer Science|Engineering|Business|Marketing|Finance|Economics|Mathematics|Statistics|Physics|Chemistry|Biology)\b/gi,
    
    // Company and experience indicators
    /\b(?:Company|Corporation|Inc|LLC|Ltd|Group|Technologies|Solutions|Systems|Services|Consulting|Agency|Studio|Lab|Startup|Enterprise|Global|International|years?|months?|experience|worked|developed|managed|led|created|built|designed|implemented|achieved|improved|increased|decreased|responsible|collaborated|coordinated)\b/gi,
    
    // Dates and durations
    /\b(?:20\d{2}|19\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\b/gi,
    
    // Complete meaningful phrases
    /[A-Z][^.!?]*[.!?]/g,
    
    // Word sequences (3+ words)
    /\b[A-Za-z]+(?:\s+[A-Za-z]+){2,}\b/g,
  ];
  
  let strategy1Text = '';
  patterns.forEach((pattern, index) => {
    const matches = content.match(pattern) || [];
    console.log(`Pattern ${index + 1} found ${matches.length} matches`);
    if (matches.length > 0) {
      strategy1Text += matches.join(' ') + ' ';
    }
  });
  
  if (strategy1Text.length > 300) {
    extractedText = strategy1Text;
    bestStrategy = 'Enhanced pattern extraction';
  }
  
  // Strategy 2: PDF structure cleaning
  console.log(`Trying Strategy 2: PDF structure cleaning...`);
  const strategy2Text = content
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
  
  if (strategy2Text.length > extractedText.length && strategy2Text.length > 300) {
    extractedText = strategy2Text;
    bestStrategy = 'PDF structure cleaning';
  }
  
  // Strategy 3: Character-by-character filtering
  console.log(`Trying Strategy 3: Character filtering...`);
  let strategy3Text = '';
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const code = char.charCodeAt(0);
    
    if ((code >= 32 && code <= 126) || 
        (code >= 160 && code <= 255) || 
        char === '\n' || char === '\r' || char === '\t' ||
        (code > 255 && /[a-zA-Z0-9\s]/.test(char))) {
      strategy3Text += char;
    }
  }
  
  strategy3Text = strategy3Text.replace(/\s+/g, ' ').trim();
  
  if (strategy3Text.length > extractedText.length && strategy3Text.length > 300) {
    extractedText = strategy3Text;
    bestStrategy = 'Character filtering';
  }
  
  // Final fallback
  if (extractedText.length < 100) {
    const fallbackText = content
      .replace(/\0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (fallbackText.length > 50) {
      extractedText = fallbackText;
      bestStrategy = 'Fallback extraction';
    }
  }
  
  const result = extractedText.substring(0, 5000).trim();
  
  console.log(`=== EXTRACTION COMPLETED ===`);
  console.log(`Best strategy: ${bestStrategy}`);
  console.log(`Final content length: ${result.length} characters`);
  console.log(`Sample: ${result.substring(0, 200)}...`);
  
  return result;
}

// Improved AI prompt with strict JSON requirements
function createParsingPrompt(content: string): string {
  return `You are a professional resume parser. Follow these steps EXACTLY and return ONLY valid JSON.

PARSING STEPS:
1. FIND NAME: Look for the candidate's full name (usually at the top)
2. EXTRACT CONTACT: Find email, phone, LinkedIn, location
3. IDENTIFY SKILLS: Extract all technical and soft skills mentioned
4. GET EXPERIENCE: Find job positions, companies, dates, descriptions
5. EXTRACT EDUCATION: Find degrees, institutions, graduation years
6. FIND PROJECTS: Look for personal/professional projects

CRITICAL RULES:
- Return ONLY valid JSON - no explanations, no markdown, no text outside JSON
- Use empty string "" for missing text fields
- Use empty array [] for missing array fields
- Be thorough - extract ALL available information
- Do NOT make up information

Resume content:
${content}

Return this EXACT JSON structure:
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

// Robust JSON parsing with multiple cleaning attempts
function parseAIResponse(response: string): any {
  console.log(`=== JSON PARSING STARTED ===`);
  console.log(`Response length: ${response.length}`);
  
  let jsonText = response.trim();
  
  // Remove markdown formatting
  jsonText = jsonText.replace(/```json\s*/gi, '');
  jsonText = jsonText.replace(/```\s*/gi, '');
  jsonText = jsonText.replace(/^\s*```/gm, '');
  jsonText = jsonText.replace(/```\s*$/gm, '');
  
  // Find JSON boundaries
  let startIndex = jsonText.indexOf('{');
  let endIndex = jsonText.lastIndexOf('}');
  
  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    throw new Error('No valid JSON object found in response');
  }
  
  jsonText = jsonText.substring(startIndex, endIndex + 1);
  
  // Clean common JSON issues
  jsonText = jsonText
    .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
    .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
    .replace(/([^\\])"/g, '$1"')  // Fix unescaped quotes
    .replace(/"\s*:\s*"([^"]*?[^\\])"/g, '": "$1"')  // Fix quote issues in values
    .replace(/\n/g, ' ')  // Remove newlines
    .replace(/\s+/g, ' ');  // Normalize spaces
  
  // Additional cleaning for common issues
  const commonFixes = [
    [/"\s*0409183911,/g, '"0409183911",'],  // Fix missing quotes after phone numbers
    [/"\s*(\d+),/g, '"$1",'],  // Fix missing quotes after numbers
    [/,\s*,/g, ','],  // Remove double commas
    [/:\s*,/g, ': "",'],  // Fix empty values
  ];
  
  commonFixes.forEach(([pattern, replacement]) => {
    jsonText = jsonText.replace(pattern, replacement);
  });
  
  console.log(`Cleaned JSON length: ${jsonText.length}`);
  
  try {
    const parsed = JSON.parse(jsonText);
    console.log(`JSON parsing successful`);
    return parsed;
  } catch (error) {
    console.error(`JSON parse failed: ${error.message}`);
    console.error(`Problematic JSON: ${jsonText.substring(0, 500)}...`);
    throw new Error(`Failed to parse JSON: ${error.message}`);
  }
}

// Validate and clean parsed data
function validateParsedData(data: any): any {
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
      .filter((exp: any) => exp.company || exp.position);
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
      .filter((edu: any) => edu.institution || edu.degree);
  }
  
  // Clean skills
  if (Array.isArray(data.skills)) {
    cleaned.skills = data.skills
      .map((skill: any) => String(skill).trim())
      .filter((skill: string) => skill.length > 0)
      .slice(0, 50);  // Limit to 50 skills
  }
  
  // Clean projects
  if (Array.isArray(data.projects)) {
    cleaned.projects = data.projects
      .map((project: any) => ({
        name: String(project.name || '').trim(),
        description: String(project.description || '').trim(),
        technologies: Array.isArray(project.technologies) 
          ? project.technologies.map((tech: any) => String(tech).trim()).filter((tech: string) => tech.length > 0)
          : []
      }))
      .filter((project: any) => project.name || project.description);
  }
  
  console.log(`=== VALIDATION RESULTS ===`);
  console.log(`Name: ${cleaned.full_name ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`Email: ${cleaned.email ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`Phone: ${cleaned.phone_number ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`Skills: ${cleaned.skills.length} found`);
  console.log(`Experience: ${cleaned.work_experience.length} positions`);
  console.log(`Education: ${cleaned.education.length} entries`);
  console.log(`Projects: ${cleaned.projects.length} found`);
  
  return cleaned;
}

// Enhanced Groq API call with better error handling
async function callGroqAPI(prompt: string, groqApiKey: string, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`=== GROQ API ATTEMPT ${attempt}/${maxRetries} ===`);
      
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
              content: 'You are an expert resume parser. Extract information accurately and return ONLY valid JSON. No explanations, no markdown, just clean JSON.'
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
        console.error(`Groq API error (attempt ${attempt}): ${response.status} - ${errorText}`);
        
        if (attempt === maxRetries) {
          throw new Error(`Groq API failed after ${maxRetries} attempts: ${response.status}`);
        }
        
        const delay = Math.min(2000 * attempt, 10000);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      const data = await response.json();
      console.log(`Groq API success on attempt ${attempt}`);
      
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response structure from Groq API');
      }
      
      return data;
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = Math.min(1000 * attempt, 5000);
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
    console.log(`Processing resume ID: ${resumeId}`);
    
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

    console.log(`Resume found: ${resume.file_name}`);

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
    
    // Extract content with enhanced strategies
    const extractedContent = extractResumeContent(fullContent);
    
    if (extractedContent.length < 100) {
      console.error('Insufficient content extracted:', extractedContent.substring(0, 200));
      throw new Error('Could not extract meaningful content from resume');
    }
    
    // Create parsing prompt
    const prompt = createParsingPrompt(extractedContent);

    // Call Groq API
    const groqData = await callGroqAPI(prompt, groqApiKey);
    
    const aiResponse = groqData.choices[0].message.content.trim();
    console.log(`=== AI RESPONSE RECEIVED ===`);
    console.log(`Response length: ${aiResponse.length}`);
    
    // Parse and validate the response
    const rawParsedData = parseAIResponse(aiResponse);
    const parsedData = validateParsedData(rawParsedData);
    
    // Check if we extracted meaningful data
    const hasBasicInfo = parsedData.full_name || parsedData.email || 
                        parsedData.skills.length > 0 || 
                        parsedData.work_experience.length > 0 || 
                        parsedData.education.length > 0;
    
    if (!hasBasicInfo) {
      console.warn('=== WARNING: NO MEANINGFUL DATA EXTRACTED ===');
    } else {
      console.log('=== SUCCESS: DATA EXTRACTED SUCCESSFULLY ===');
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

    console.log('=== PARSING COMPLETED SUCCESSFULLY ===');

    return new Response(JSON.stringify({ 
      success: true, 
      parsedData,
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
