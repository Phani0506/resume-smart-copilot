
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// PDF parsing using a simpler approach that works in Deno
// We'll use the built-in text extraction methods
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function extractTextFromPdf(fileArrayBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log('Attempting PDF text extraction...');
    
    // Convert to string and look for text patterns in PDF
    const uint8Array = new Uint8Array(fileArrayBuffer);
    const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
    
    // Look for text between parentheses (common in PDF text objects)
    const textMatches = binaryString.match(/\(([^)]+)\)/g);
    if (textMatches && textMatches.length > 0) {
      const extractedText = textMatches
        .map(match => match.slice(1, -1)) // Remove parentheses
        .filter(text => text.length > 1 && /[a-zA-Z]/.test(text))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (extractedText.length > 50) {
        console.log(`PDF extraction successful: ${extractedText.length} characters`);
        return extractedText;
      }
    }
    
    // Fallback: look for readable sequences
    return extractReadableSequences(binaryString);
  } catch (error) {
    console.error("Error extracting from PDF:", error.message);
    return "";
  }
}

async function extractTextFromDocx(fileArrayBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log('Attempting DOCX text extraction...');
    
    // Convert ArrayBuffer to Uint8Array for ZIP processing
    const uint8Array = new Uint8Array(fileArrayBuffer);
    
    // Simple ZIP file parsing to find document.xml
    const zipData = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
    
    // Look for the document.xml content within the ZIP
    const xmlStartPattern = 'word/document.xml';
    const xmlStart = zipData.indexOf(xmlStartPattern);
    
    if (xmlStart > -1) {
      // Extract a reasonable chunk that might contain the XML
      const xmlChunk = zipData.substring(xmlStart, xmlStart + 50000);
      
      // Look for Word text content patterns
      const textMatches = xmlChunk.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (textMatches && textMatches.length > 0) {
        const extractedText = textMatches
          .map(match => match.replace(/<[^>]+>/g, ''))
          .filter(text => text.length > 0)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (extractedText.length > 50) {
          console.log(`DOCX extraction successful: ${extractedText.length} characters`);
          return extractedText;
        }
      }
    }
    
    // Fallback to readable sequence extraction
    return extractReadableSequences(zipData);
  } catch (error) {
    console.error("Error extracting from DOCX:", error.message);
    return "";
  }
}

async function extractContentFromFile(fileArrayBuffer: ArrayBuffer, contentType: string | null): Promise<string> {
  console.log(`=== CONTENT EXTRACTION STARTED ===`);
  console.log(`Content type: ${contentType}`);
  console.log(`File size: ${fileArrayBuffer.byteLength} bytes`);
  
  if (!fileArrayBuffer || fileArrayBuffer.byteLength < 10) {
    throw new Error('File is empty or too small');
  }
  
  let extractedText = '';
  
  if (contentType?.includes('pdf')) {
    console.log('Processing PDF content...');
    extractedText = await extractTextFromPdf(fileArrayBuffer);
  } else if (contentType?.includes('wordprocessingml') || contentType?.includes('docx')) {
    console.log('Processing DOCX content...');
    extractedText = await extractTextFromDocx(fileArrayBuffer);
  } else if (contentType?.includes('msword') || contentType?.includes('doc')) {
    console.log('Processing DOC content (legacy format)...');
    // For older DOC files, try generic text extraction
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    const genericText = textDecoder.decode(fileArrayBuffer);
    extractedText = extractReadableSequences(genericText);
  } else if (contentType?.includes('text/plain')) {
    console.log('Processing plain text file...');
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    extractedText = textDecoder.decode(fileArrayBuffer);
  }
  
  // If specific parsers failed or yielded little content, try generic extraction
  if (extractedText.length < 100) {
    console.log('Primary extraction yielded little content, trying generic text extraction...');
    try {
      const textDecoder = new TextDecoder("utf-8", { fatal: false });
      const genericText = textDecoder.decode(fileArrayBuffer);
      const readableSequences = extractReadableSequences(genericText);
      if (readableSequences.length > extractedText.length) {
        extractedText = readableSequences;
      }
    } catch (decodeError) {
      console.warn("Failed to decode as UTF-8 for fallback:", decodeError.message);
    }
  }
  
  // Clean the extracted text
  extractedText = cleanExtractedText(extractedText);
  
  if (extractedText.length < 50) {
    console.warn('Could not extract sufficient readable content from file');
    // Don't throw error, let AI handle minimal content
  }
  
  // Limit content for AI processing (prevent context length issues)
  const result = extractedText.substring(0, 12000);
  console.log(`Final extracted content length: ${result.length} characters`);
  console.log(`Sample extracted text: ${result.substring(0, 300)}...`);
  
  return result;
}

function extractReadableSequences(content: string): string {
  const sequences = [];
  let currentSequence = '';
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const code = char.charCodeAt(0);
    
    // Check for readable ASCII characters and common Unicode
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255) || 
        char === '\n' || char === '\r' || char === '\t') {
      if (/[a-zA-Z0-9\s@._\-+#!?"$%&'()*,\/:;<=>[\]^_`{|}~]/.test(char)) {
        currentSequence += char;
      } else if (currentSequence.trim().length >= 3) {
        sequences.push(currentSequence.trim());
        currentSequence = '';
      } else {
        currentSequence = '';
      }
    } else if (currentSequence.trim().length >= 3) {
      sequences.push(currentSequence.trim());
      currentSequence = '';
    } else {
      currentSequence = '';
    }
  }
  
  if (currentSequence.trim().length >= 3) {
    sequences.push(currentSequence.trim());
  }
  
  return sequences
    .filter(seq => seq.length >= 3 && /[a-zA-Z]/.test(seq))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanExtractedText(text: string): string {
  return text
    // Remove common PDF artifacts
    .replace(/obj\s+\d+/g, ' ')
    .replace(/endobj/g, ' ')
    .replace(/\/[A-Z][A-Za-z0-9]*\s*/g, ' ')
    .replace(/<<[^>]*>>/g, ' ')
    .replace(/\d+\s+0\s+R/g, ' ')
    // Clean up excessive whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

async function parseWithAI(content: string, groqApiKey: string): Promise<any> {
  console.log(`=== AI PARSING STARTED ===`);
  
  if (!content || content.trim().length < 10) {
    console.warn("Content for AI is too short or empty. Creating enhanced fallback.");
    return createEnhancedFallback(content || "");
  }
  
  console.log(`Content length for AI: ${content.length} characters`);
  
  const systemPrompt = `You are an expert resume parsing system. Extract information from resume text and return ONLY a valid JSON object.

CRITICAL RULES:
1. Return ONLY valid JSON - no explanations, markdown, or other text
2. Your response must start with { and end with }
3. Extract information exactly as found - do not invent details
4. For missing information: use null for strings/objects, [] for arrays
5. Pay attention to resume structure and common patterns

REQUIRED JSON STRUCTURE:
{
  "candidate_name": "full name or null",
  "contact_information": {
    "email": "email address or null",
    "phone": "phone number or null", 
    "linkedin_url": "LinkedIn URL or null",
    "github_url": "GitHub URL or null",
    "portfolio_url": "portfolio URL or null",
    "location": "location or null"
  },
  "skills": ["skill1", "skill2"],
  "work_experience": [
    {
      "job_title": "title",
      "company_name": "company", 
      "start_date": "start date",
      "end_date": "end date or Present",
      "responsibilities_achievements": ["responsibility 1", "responsibility 2"]
    }
  ]
}`;

  const models = ['llama3-70b-8192', 'llama3-8b-8192', 'gemma2-9b-it', 'mixtral-8x7b-32768'];
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= models.length; attempt++) {
    try {
      console.log(`AI Parsing Attempt ${attempt}/${models.length}`);
      
      if (attempt > 1) {
        const delay = Math.min(2000 * (attempt - 1), 8000);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const selectedModel = models[attempt - 1];
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
            { role: 'user', content: `Extract information from this resume text and return ONLY the JSON object:\n\n${content}` }
          ],
          temperature: 0.05,
          max_tokens: 3000,
          top_p: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Groq API error ${response.status} with model ${selectedModel}: ${errorText}`);
        lastError = new Error(`Groq API error: ${response.status} with ${selectedModel} - ${errorText}`);
        
        if (response.status === 429) {
          const waitTime = Math.min(6000 * attempt, 20000);
          console.log(`Rate limited, waiting ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        continue;
      }

      const data = await response.json();
      const aiContent = data.choices?.[0]?.message?.content;
      
      if (!aiContent) {
        lastError = new Error(`No content in Groq response from model ${selectedModel}`);
        console.warn(lastError.message);
        continue;
      }

      console.log(`Raw AI Response from ${selectedModel}: ${aiContent.substring(0, 500)}...`);
      
      const parsed = parseJSONResponse(aiContent);
      
      if (parsed && typeof parsed === 'object') {
        console.log(`Successfully parsed AI response from ${selectedModel} on attempt ${attempt}`);
        return parsed;
      } else {
        lastError = new Error(`Failed to parse valid JSON from ${selectedModel}`);
        console.warn(lastError.message);
      }
      
    } catch (error) {
      console.error(`Attempt ${attempt} with model ${models[attempt-1]} failed:`, error.message);
      lastError = error;
    }
  }
  
  console.error('All AI parsing attempts failed. Last error:', lastError?.message);
  console.log('Creating enhanced fallback due to AI parsing failure.');
  return createEnhancedFallback(content);
}

function parseJSONResponse(aiContent: string): any {
  try {
    let jsonStr = aiContent.trim();
    
    // Remove markdown code blocks
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    
    // Find JSON object boundaries
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      console.warn("Valid JSON object delimiters not found");
      return null;
    }
    
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    
    // Clean up common JSON issues
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1'); // Remove trailing commas
    
    console.log(`Attempting to parse JSON: ${jsonStr.substring(0, 200)}...`);
    const parsed = JSON.parse(jsonStr);
    
    return (typeof parsed === 'object' && parsed !== null) ? parsed : null;
  } catch (error) {
    console.error(`JSON parse error: ${error.message}`);
    return null;
  }
}

function createEnhancedFallback(extractedContent: string): any {
  console.log('Creating enhanced fallback with regex extraction');
  
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
  
  // Email extraction
  const emailMatch = extractedContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    fallback.contact_information.email = emailMatch[0];
  }
  
  // Phone extraction
  const phoneMatch = extractedContent.match(/[\+]?([0-9]{1,3}[\s.-]?)?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}/);
  if (phoneMatch) {
    fallback.contact_information.phone = phoneMatch[0].replace(/[^\d+]/g, "");
  }
  
  // LinkedIn extraction
  const linkedinMatch = extractedContent.match(/linkedin\.com\/in\/[a-zA-Z0-9\-_]+/i);
  if (linkedinMatch) {
    fallback.contact_information.linkedin_url = `https://${linkedinMatch[0]}`;
  }
  
  // GitHub extraction
  const githubMatch = extractedContent.match(/github\.com\/[a-zA-Z0-9\-_]+/i);
  if (githubMatch) {
    fallback.contact_information.github_url = `https://${githubMatch[0]}`;
  }
  
  // Skills extraction
  const skillKeywords = [
    'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'HTML', 'CSS', 'TypeScript',
    'SQL', 'Git', 'AWS', 'Docker', 'Angular', 'Vue.js', 'MongoDB', 'PostgreSQL',
    'MySQL', 'Express', 'Django', 'Flask', 'C#', 'PHP', 'Ruby', 'Go',
    'Rust', 'Swift', 'Kotlin', 'React Native', 'Flutter', 'Redux', 'GraphQL',
    'REST API', 'Microservices', 'Kubernetes', 'Jenkins', 'CI/CD', 'Agile', 'Scrum'
  ];
  
  skillKeywords.forEach(skill => {
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(extractedContent)) {
      if (!fallback.skills.includes(skill)) {
        fallback.skills.push(skill);
      }
    }
  });
  
  // Name extraction from beginning of content
  const lines = extractedContent.split('\n').map(l => l.trim()).filter(line => line.length > 0);
  if (lines.length > 0) {
    const firstFewLines = lines.slice(0, 3).join(' ');
    const nameMatch = firstFewLines.match(/^([A-Z][a-z'-]+(\s+[A-Z][a-z'-]+){1,2})/);
    if (nameMatch && nameMatch[0].length < 50) {
      fallback.candidate_name = nameMatch[0].trim();
    }
  }
  
  return fallback;
}

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
  
  // Validate candidate name
  if (data.candidate_name && typeof data.candidate_name === 'string') {
    const name = data.candidate_name.trim();
    if (name.length > 0 && name.length < 150 && name.toLowerCase() !== 'null' && 
        name.toLowerCase() !== "full name or null" && /[a-zA-Z]/.test(name)) {
      result.candidate_name = name;
    }
  }
  
  // Validate contact information
  if (data.contact_information && typeof data.contact_information === 'object') {
    const contact = data.contact_information;
    
    // Email validation
    if (contact.email && typeof contact.email === 'string') {
      const email = contact.email.trim().toLowerCase();
      if (email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) && email !== 'email address or null') {
        result.contact_information.email = email;
      }
    }
    
    // Phone validation
    if (contact.phone && typeof contact.phone === 'string') {
      const phone = contact.phone.trim();
      if (phone.length > 6 && phone !== 'phone number or null') {
        result.contact_information.phone = phone;
      }
    }
    
    // URL validations
    ['linkedin_url', 'github_url', 'portfolio_url'].forEach(field => {
      if (contact[field] && typeof contact[field] === 'string') {
        const url = contact[field].trim();
        if (url.length > 5 && url.toLowerCase() !== 'null' && 
            !url.toLowerCase().includes('url or null')) {
          result.contact_information[field] = url.startsWith('http') ? url : `https://${url}`;
        }
      }
    });
    
    // Location validation
    if (contact.location && typeof contact.location === 'string') {
      const location = contact.location.trim();
      if (location.length > 0 && location.length < 200 && 
          location.toLowerCase() !== 'null' && location.toLowerCase() !== 'location or null') {
        result.contact_information.location = location;
      }
    }
  }
  
  // Validate skills
  if (Array.isArray(data.skills)) {
    result.skills = data.skills
      .filter(skill => skill && typeof skill === 'string')
      .map(skill => skill.trim())
      .filter(skill => skill.length > 0 && skill.length < 100 && 
               skill.toLowerCase() !== 'null' && !skill.toLowerCase().startsWith('skill'))
      .filter((value, index, self) => self.indexOf(value) === index)
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
          const title = exp.job_title.trim();
          if (title.length > 0 && title.length < 200 && 
              title.toLowerCase() !== 'null' && title.toLowerCase() !== 'title') {
            experience.job_title = title;
          }
        }
        
        if (exp.company_name && typeof exp.company_name === 'string') {
          const company = exp.company_name.trim();
          if (company.length > 0 && company.length < 200 && 
              company.toLowerCase() !== 'null' && company.toLowerCase() !== 'company') {
            experience.company_name = company;
          }
        }
        
        if (exp.start_date && typeof exp.start_date === 'string') {
          const date = exp.start_date.trim();
          if (date.toLowerCase() !== 'null' && date.toLowerCase() !== 'start date') {
            experience.start_date = date;
          }
        }
        
        if (exp.end_date && typeof exp.end_date === 'string') {
          const date = exp.end_date.trim();
          if (date.toLowerCase() !== 'null' && !date.toLowerCase().includes('end date')) {
            experience.end_date = date;
          }
        }
        
        if (Array.isArray(exp.responsibilities_achievements)) {
          experience.responsibilities_achievements = exp.responsibilities_achievements
            .filter(resp => resp && typeof resp === 'string')
            .map(resp => resp.trim())
            .filter(resp => resp.length > 0 && resp.length < 1000 && 
                     resp.toLowerCase() !== 'null' && 
                     !resp.toLowerCase().startsWith("responsibility"))
            .slice(0, 10);
        }
        
        return experience;
      })
      .filter(exp => exp.job_title || exp.company_name)
      .slice(0, 20);
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
    const body = await req.json();
    resumeId = body.resumeId;
    
    if (!resumeId) {
      throw new Error("resumeId is missing from request body");
    }
    
    console.log('=== RESUME PARSING STARTED ===');
    console.log(`Resume ID: ${resumeId}`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get resume record
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('id, file_name, storage_path, content_type')
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
    
    if (!fileData) {
      throw new Error("Downloaded file data is null");
    }

    // Extract content using the improved extraction methods
    const fileArrayBuffer = await fileData.arrayBuffer();
    const extractedContent = await extractContentFromFile(fileArrayBuffer, resume.content_type);
    
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
    console.error('Stack:', error.stack);
    
    // Update status to error in database
    if (resumeId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          await supabase
            .from('resumes')
            .update({ 
              upload_status: 'parsing_error',
              parsed_data: { 
                error_message: error.message,
                error_stack: error.stack?.substring(0, 500)
              }
            })
            .eq('id', resumeId);
        }
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
