
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Advanced content extraction with multiple strategies
function extractResumeContent(content: string): string {
  console.log(`=== CONTENT EXTRACTION STARTED ===`);
  console.log(`Original content length: ${content.length} characters`);
  
  let extractedText = '';
  let bestStrategy = '';
  
  // Strategy 1: Enhanced pattern-based extraction for structured data
  console.log(`Trying Strategy 1: Pattern-based extraction...`);
  const patterns = [
    // Personal information
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}\b/g, // Full names
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, // Email addresses
    /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g, // Phone numbers
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9-]+/gi, // LinkedIn URLs
    
    // Skills and technologies (comprehensive list)
    /\b(?:JavaScript|TypeScript|Python|Java|React|Angular|Vue|Node\.js|Express|MongoDB|PostgreSQL|MySQL|Docker|Kubernetes|AWS|Azure|GCP|Git|GitHub|GitLab|HTML|CSS|SCSS|Bootstrap|Tailwind|PHP|Ruby|C\+\+|C#|Swift|Kotlin|Flutter|React Native|Spring|Django|Flask|Laravel|WordPress|Shopify|Figma|Adobe|Photoshop|Illustrator|InDesign|Sketch|SQL|NoSQL|Redis|Elasticsearch|Jenkins|CI\/CD|DevOps|Linux|Windows|MacOS|Office|Excel|PowerPoint|Word|Slack|Jira|Trello|Asana|Salesforce|HubSpot|Analytics|SEO|SEM|PPC|Social Media|Marketing|Sales|Leadership|Management|Communication|Problem Solving|Team Work|Project Management|Agile|Scrum|Kanban|API|REST|GraphQL|Microservices|Machine Learning|AI|Data Science|Business Intelligence|Tableau|Power BI|Pandas|NumPy|TensorFlow|PyTorch)\b/gi,
    
    // Job titles and positions
    /\b(?:Software Engineer|Developer|Frontend|Backend|Full Stack|Data Scientist|Product Manager|Project Manager|Designer|UX|UI|DevOps|QA|Tester|Analyst|Consultant|Director|Manager|Lead|Senior|Junior|Intern|CEO|CTO|VP|Head of|Marketing|Sales|Operations|Finance|HR|Recruiter|Architect|Specialist|Coordinator|Assistant|Associate|Executive)\b/gi,
    
    // Education and institutions
    /\b(?:University|College|Institute|School|Academy|Bachelor|Master|PhD|Degree|Graduate|Undergraduate|Diploma|Certificate|MBA|MS|BS|BA|MA|PhD|Computer Science|Engineering|Business|Marketing|Finance|Economics|Mathematics|Statistics|Physics|Chemistry|Biology|Information Technology|Software Engineering)\b/gi,
    
    // Companies and experience indicators
    /\b(?:Company|Corporation|Inc|LLC|Ltd|Group|Technologies|Solutions|Systems|Services|Consulting|Agency|Studio|Lab|Startup|Enterprise|Global|International|years?|months?|experience|worked|developed|managed|led|created|built|designed|implemented|achieved|improved|increased|decreased|responsible|collaborated|coordinated|delivered|executed)\b/gi,
    
    // Dates and time periods
    /\b(?:20\d{2}|19\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\b/gi,
    
    // Complete sentences and phrases
    /[A-Z][^.!?]*[.!?]/g,
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
  
  if (strategy1Text.length > 500) {
    extractedText = strategy1Text;
    bestStrategy = 'Pattern-based extraction';
  }
  
  // Strategy 2: PDF structure cleaning and text extraction
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
  
  if (strategy2Text.length > extractedText.length && strategy2Text.length > 500) {
    extractedText = strategy2Text;
    bestStrategy = 'PDF structure cleaning';
  }
  
  // Strategy 3: Character-by-character filtering for corrupted PDFs
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
  
  if (strategy3Text.length > extractedText.length && strategy3Text.length > 500) {
    extractedText = strategy3Text;
    bestStrategy = 'Character filtering';
  }
  
  // Strategy 4: Raw text extraction as fallback
  if (extractedText.length < 200) {
    const fallbackText = content
      .replace(/\0/g, ' ')
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (fallbackText.length > 100) {
      extractedText = fallbackText;
      bestStrategy = 'Raw text extraction';
    }
  }
  
  const result = extractedText.substring(0, 8000).trim();
  
  console.log(`=== EXTRACTION COMPLETED ===`);
  console.log(`Best strategy: ${bestStrategy}`);
  console.log(`Final content length: ${result.length} characters`);
  console.log(`Sample: ${result.substring(0, 300)}...`);
  
  return result;
}

// Step-by-step AI parsing with multiple attempts
async function parseResumeWithAI(content: string, groqApiKey: string): Promise<any> {
  console.log(`=== AI PARSING STARTED ===`);
  
  // Step 1: Parse basic information
  const basicInfoPrompt = `Extract ONLY the basic contact information from this resume text. Return ONLY valid JSON with no additional text.

Resume text: ${content.substring(0, 3000)}

Return this exact JSON structure:
{
  "full_name": "",
  "email": "",
  "phone_number": "",
  "linkedin_url": "",
  "location": ""
}`;

  console.log(`Step 1: Extracting basic information...`);
  const basicInfo = await callGroqAPI(basicInfoPrompt, groqApiKey);
  console.log(`Basic info extracted:`, basicInfo);

  // Step 2: Parse skills
  const skillsPrompt = `Extract ALL skills, technologies, and competencies from this resume text. Return ONLY a JSON array of skills.

Resume text: ${content}

Return ONLY a JSON array like this:
["JavaScript", "Python", "React", "Node.js", "SQL", "Project Management"]`;

  console.log(`Step 2: Extracting skills...`);
  const skillsResponse = await callGroqAPI(skillsPrompt, groqApiKey);
  const skills = Array.isArray(skillsResponse) ? skillsResponse : [];
  console.log(`Skills extracted:`, skills);

  // Step 3: Parse work experience
  const experiencePrompt = `Extract ALL work experience from this resume text. Return ONLY valid JSON array.

Resume text: ${content}

Return this exact JSON structure:
[
  {
    "company": "",
    "position": "",
    "duration": "",
    "description": ""
  }
]`;

  console.log(`Step 3: Extracting work experience...`);
  const workExperience = await callGroqAPI(experiencePrompt, groqApiKey);
  const experience = Array.isArray(workExperience) ? workExperience : [];
  console.log(`Experience extracted:`, experience);

  // Step 4: Parse education
  const educationPrompt = `Extract ALL education information from this resume text. Return ONLY valid JSON array.

Resume text: ${content}

Return this exact JSON structure:
[
  {
    "institution": "",
    "degree": "",
    "field_of_study": "",
    "graduation_year": ""
  }
]`;

  console.log(`Step 4: Extracting education...`);
  const educationResponse = await callGroqAPI(educationPrompt, groqApiKey);
  const education = Array.isArray(educationResponse) ? educationResponse : [];
  console.log(`Education extracted:`, education);

  // Step 5: Parse projects
  const projectsPrompt = `Extract ANY projects or portfolios from this resume text. Return ONLY valid JSON array.

Resume text: ${content}

Return this exact JSON structure:
[
  {
    "name": "",
    "description": "",
    "technologies": []
  }
]`;

  console.log(`Step 5: Extracting projects...`);
  const projectsResponse = await callGroqAPI(projectsPrompt, groqApiKey);
  const projects = Array.isArray(projectsResponse) ? projectsResponse : [];
  console.log(`Projects extracted:`, projects);

  // Step 6: Generate professional summary
  const summaryPrompt = `Based on this resume content, write a 2-3 sentence professional summary. Return ONLY the summary text, no JSON.

Resume text: ${content.substring(0, 2000)}`;

  console.log(`Step 6: Generating professional summary...`);
  const summaryResponse = await callGroqAPI(summaryPrompt, groqApiKey);
  const professionalSummary = typeof summaryResponse === 'string' ? summaryResponse : '';
  console.log(`Summary generated:`, professionalSummary);

  // Combine all extracted data
  const finalData = {
    full_name: basicInfo?.full_name || '',
    email: basicInfo?.email || '',
    phone_number: basicInfo?.phone_number || '',
    linkedin_url: basicInfo?.linkedin_url || '',
    location: basicInfo?.location || '',
    professional_summary: professionalSummary.substring(0, 500),
    work_experience: experience,
    education: education,
    skills: skills.slice(0, 50),
    projects: projects
  };

  console.log(`=== AI PARSING COMPLETED ===`);
  console.log(`Final extracted data:`, JSON.stringify(finalData, null, 2));
  
  return finalData;
}

// Enhanced Groq API call with robust error handling
async function callGroqAPI(prompt: string, groqApiKey: string, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Groq API attempt ${attempt}/${maxRetries}`);
      
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
              content: 'You are an expert resume parser. Extract information accurately and return ONLY the requested JSON format. No explanations, no markdown, just clean JSON or the requested format.'
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
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content in Groq response');
      }

      console.log(`Raw AI response: ${content.substring(0, 200)}...`);

      // Try to parse as JSON first
      try {
        return JSON.parse(content.trim());
      } catch (jsonError) {
        // If not JSON, clean and try again
        let cleanedContent = content.trim();
        
        // Remove markdown formatting
        cleanedContent = cleanedContent.replace(/```json\s*/gi, '');
        cleanedContent = cleanedContent.replace(/```\s*/gi, '');
        
        // Find JSON boundaries
        const jsonStart = cleanedContent.indexOf('{') !== -1 ? cleanedContent.indexOf('{') : cleanedContent.indexOf('[');
        const jsonEnd = cleanedContent.lastIndexOf('}') !== -1 ? cleanedContent.lastIndexOf('}') : cleanedContent.lastIndexOf(']');
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
          cleanedContent = cleanedContent.substring(jsonStart, jsonEnd + 1);
          
          try {
            return JSON.parse(cleanedContent);
          } catch (secondJsonError) {
            console.log(`JSON parsing failed, returning raw content: ${cleanedContent}`);
            return cleanedContent; // Return raw text for summary
          }
        }
        
        return content; // Return raw content if no JSON found
      }
      
    } catch (error) {
      console.error(`Groq API attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = Math.min(2000 * attempt, 8000);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
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
      .slice(0, 50);
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
    
    // Extract content with multiple strategies
    const extractedContent = extractResumeContent(fullContent);
    
    if (extractedContent.length < 100) {
      console.error('Insufficient content extracted:', extractedContent.substring(0, 200));
      throw new Error('Could not extract meaningful content from resume');
    }
    
    // Parse with AI step by step
    const parsedData = await parseResumeWithAI(extractedContent, groqApiKey);
    
    // Validate and clean the data
    const cleanedData = validateParsedData(parsedData);
    
    // Check if we extracted meaningful data
    const hasBasicInfo = cleanedData.full_name || cleanedData.email || 
                        cleanedData.skills.length > 0 || 
                        cleanedData.work_experience.length > 0 || 
                        cleanedData.education.length > 0;
    
    if (!hasBasicInfo) {
      console.warn('=== WARNING: LIMITED DATA EXTRACTED ===');
      console.warn('This may be due to poor file quality or unusual formatting');
    } else {
      console.log('=== SUCCESS: COMPREHENSIVE DATA EXTRACTED ===');
    }

    // Update resume with parsed data
    const { error: updateError } = await supabase
      .from('resumes')
      .update({
        parsed_data: cleanedData,
        skills_extracted: cleanedData.skills || [],
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
      message: 'Resume parsed successfully with comprehensive data extraction'
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
