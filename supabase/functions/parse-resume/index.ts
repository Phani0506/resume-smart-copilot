
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// More aggressive content truncation to stay within token limits
function intelligentTruncate(content: string, maxTokens = 2000): string {
  const maxChars = maxTokens * 3.5; // More conservative estimate: 1 token ≈ 3.5 characters
  
  if (content.length <= maxChars) {
    return content;
  }

  console.log(`Content too long (${content.length} chars), truncating to ${maxChars} chars`);

  // Clean up PDF artifacts and extract meaningful text
  let cleanedContent = content
    .replace(/%PDF-[\d.]+/g, '') // Remove PDF headers
    .replace(/\d+ \d+ obj/g, '') // Remove PDF object definitions
    .replace(/<<[^>]*>>/g, '') // Remove PDF dictionaries
    .replace(/stream[\s\S]*?endstream/g, '') // Remove PDF streams
    .replace(/endobj/g, '') // Remove endobj markers
    .replace(/xref[\s\S]*?trailer/g, '') // Remove xref tables
    .replace(/startxref[\s\S]*?%%EOF/g, '') // Remove PDF endings
    .replace(/\/[A-Z][a-zA-Z]*/g, '') // Remove PDF commands
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')') // Fix escaped parentheses
    .replace(/\\n/g, '\n') // Convert literal \n to actual newlines
    .replace(/\\t/g, ' ') // Convert literal \t to spaces
    .replace(/[^\x20-\x7E\n\r]/g, ' ') // Remove non-printable characters except newlines
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Split into lines and prioritize important sections
  const lines = cleanedContent.split(/[\n\r]+/).filter(line => line.trim().length > 2);
  
  // Extract sections that likely contain important info
  const importantLines: string[] = [];
  const otherLines: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      // Personal info patterns
      /@/.test(line) || // Email addresses
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(line) || // Phone numbers
      /linkedin|github/i.test(line) || // Social profiles
      
      // Section headers
      /^(experience|education|skills|summary|objective|contact|projects|certifications)/i.test(line.trim()) ||
      /(experience|education|skills|summary|objective|contact|projects|certifications):?\s*$/i.test(line.trim()) ||
      
      // Job titles and companies (common patterns)
      /(developer|engineer|manager|analyst|consultant|designer|coordinator)/i.test(line) ||
      /(inc\.|llc|corp|ltd|company|technologies|solutions|systems)/i.test(line) ||
      
      // Skills (programming languages, tools)
      /(javascript|python|java|react|node|sql|html|css|aws|azure|docker|kubernetes)/i.test(line) ||
      
      // Education keywords
      /(university|college|bachelor|master|degree|phd|certification)/i.test(line) ||
      
      // Dates (years that look like work experience)
      /\b(19|20)\d{2}\b.*?-.*?\b(19|20)\d{2}\b/.test(line) ||
      /\b(19|20)\d{2}\b.*?(present|current)/i.test(line)
    ) {
      importantLines.push(line);
    } else {
      otherLines.push(line);
    }
  }

  // Build result prioritizing important content
  let result = '';
  let charCount = 0;

  // Add important lines first
  for (const line of importantLines) {
    if (charCount + line.length + 1 < maxChars * 0.8) { // Reserve 20% for other content
      result += line + '\n';
      charCount += line.length + 1;
    }
  }

  // Add other lines if space allows
  for (const line of otherLines) {
    if (charCount + line.length + 1 < maxChars) {
      result += line + '\n';
      charCount += line.length + 1;
    }
  }

  return result.trim() || content.substring(0, maxChars);
}

// Simplified and more focused extraction prompt
function createExtractionPrompt(content: string): string {
  return `Extract resume information from this text. Return ONLY valid JSON with no markdown formatting.

Text to parse:
${content}

Return this exact JSON structure:
{
  "full_name": "",
  "email": "",
  "phone_number": "",
  "linkedin_url": "",
  "location": "",
  "professional_summary": "",
  "work_experience": [{"job_title": "", "company_name": "", "start_date": "", "end_date": "", "responsibilities": ""}],
  "education": [{"degree": "", "institution_name": "", "graduation_date": ""}],
  "skills": ["skill1", "skill2"],
  "projects": [{"project_name": "", "description": "", "technologies_used": []}]
}`;
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

    console.log('Resume found:', resume.file_name, 'Status:', resume.upload_status, 'Content-Type:', resume.content_type);

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
      throw new Error('Failed to extract text from file. The file may be corrupted or in an unsupported format.');
    }

    console.log('Original file content length:', fullContent.length);
    
    if (!fullContent || fullContent.trim().length < 20) {
      throw new Error('File appears to be empty or contains insufficient text content');
    }
    
    // Use more aggressive truncation to stay within limits
    const fileContent = intelligentTruncate(fullContent, 1800); // Even more conservative
    console.log('Processed content length:', fileContent.length);
    console.log('Sample processed content:', fileContent.substring(0, 300));

    // Create simplified prompt
    const prompt = createExtractionPrompt(fileContent);

    // Call Groq API with more conservative settings
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
            content: 'You are a resume parser. Extract information and return ONLY valid JSON. No explanations or markdown.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1500, // Reduced max tokens
        top_p: 0.9,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errorText);
      throw new Error(`AI parsing service failed: ${groqResponse.status} - ${errorText}`);
    }

    const groqData = await groqResponse.json();
    console.log('Groq response received, choices length:', groqData.choices?.length);

    if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
      console.error('Unexpected Groq response structure:', JSON.stringify(groqData));
      throw new Error('Invalid response structure from AI service');
    }

    const parsedDataText = groqData.choices[0].message.content;
    console.log('Raw AI response length:', parsedDataText.length);
    console.log('Raw AI response:', parsedDataText);
    
    // Enhanced JSON parsing
    let parsedData;
    try {
      let cleanedText = parsedDataText.trim();
      
      // Remove markdown formatting
      cleanedText = cleanedText.replace(/```json\s*/gi, '');
      cleanedText = cleanedText.replace(/```\s*/gi, '');
      cleanedText = cleanedText.replace(/^json\s*/gi, '');
      
      // Extract JSON object
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
      }
      
      console.log('Cleaned JSON text:', cleanedText);
      
      parsedData = JSON.parse(cleanedText);
      console.log('Successfully parsed JSON data');
      
      // Validate and clean the parsed data
      parsedData = {
        full_name: (parsedData.full_name || '').trim() || extractNameFallback(fullContent),
        email: (parsedData.email || '').trim() || extractEmailFallback(fullContent),
        phone_number: (parsedData.phone_number || '').trim() || extractPhoneFallback(fullContent),
        linkedin_url: (parsedData.linkedin_url || '').trim(),
        location: (parsedData.location || '').trim(),
        professional_summary: (parsedData.professional_summary || '').trim(),
        work_experience: Array.isArray(parsedData.work_experience) ? parsedData.work_experience : [],
        education: Array.isArray(parsedData.education) ? parsedData.education : [],
        skills: Array.isArray(parsedData.skills) ? parsedData.skills.filter(skill => skill && skill.trim()) : extractSkillsFallback(fullContent),
        projects: Array.isArray(parsedData.projects) ? parsedData.projects : []
      };

      console.log('Final parsed data:', {
        name: parsedData.full_name,
        email: parsedData.email,
        skills_count: parsedData.skills.length,
        experience_count: parsedData.work_experience.length
      });
      
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Failed to parse text:', parsedDataText);
      
      // Use comprehensive fallback extraction
      parsedData = {
        full_name: extractNameFallback(fullContent) || 'Name extraction failed',
        email: extractEmailFallback(fullContent) || '',
        phone_number: extractPhoneFallback(fullContent) || '',
        linkedin_url: extractLinkedInFallback(fullContent) || '',
        location: extractLocationFallback(fullContent) || '',
        professional_summary: 'AI parsing encountered an issue. Please review manually.',
        work_experience: [],
        education: [],
        skills: extractSkillsFallback(fullContent),
        projects: []
      };
      
      console.log('Using fallback parsing:', parsedData);
    }

    // Extract skills for database
    const skillsExtracted = parsedData.skills || [];
    console.log('Final extracted skills:', skillsExtracted);

    // Update resume with parsed data
    const { error: updateError } = await supabase
      .from('resumes')
      .update({
        parsed_data: parsedData,
        skills_extracted: skillsExtracted,
        upload_status: 'parsed_success'
      })
      .eq('id', resumeId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Failed to save parsed data: ${updateError.message}`);
    }

    console.log('Resume parsing completed successfully for:', parsedData.full_name);

    return new Response(JSON.stringify({ 
      success: true, 
      parsedData,
      skillsCount: skillsExtracted.length,
      message: 'Resume parsed successfully' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Parse resume error:', error);
    
    // Update status to error if we have resumeId
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
      details: 'Resume parsing failed. Please check the file format and try again.',
      resumeId: resumeId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Enhanced fallback extraction functions
function extractNameFallback(content: string): string {
  // Clean content and look for names in first few lines
  const cleanContent = content.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ');
  const lines = cleanContent.split('\n').slice(0, 20);
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Look for name patterns
    if (trimmed.length > 3 && 
        trimmed.length < 50 && 
        !trimmed.includes('@') && 
        !trimmed.includes('http') &&
        !trimmed.includes('www') &&
        !/^\d/.test(trimmed) &&
        /^[A-Za-z\s\-\.]+$/.test(trimmed) &&
        trimmed.split(' ').length >= 2 &&
        trimmed.split(' ').length <= 4) {
      return trimmed;
    }
  }
  
  return '';
}

function extractEmailFallback(content: string): string {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const matches = content.match(emailRegex);
  return matches ? matches[0] : '';
}

function extractPhoneFallback(content: string): string {
  const phoneRegex = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
  const matches = content.match(phoneRegex);
  return matches ? matches[0] : '';
}

function extractLinkedInFallback(content: string): string {
  const linkedinRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9\-]+/gi;
  const matches = content.match(linkedinRegex);
  return matches ? matches[0] : '';
}

function extractLocationFallback(content: string): string {
  // Look for common location patterns
  const locationRegex = /([A-Za-z\s]+),\s*([A-Z]{2}|[A-Za-z\s]+)(?:\s+\d{5})?/g;
  const matches = content.match(locationRegex);
  if (matches) {
    // Return the first match that looks like a city, state pattern
    for (const match of matches) {
      if (match.length < 50 && !match.includes('@')) {
        return match.trim();
      }
    }
  }
  return '';
}

function extractSkillsFallback(content: string): string[] {
  const commonSkills = [
    'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'HTML', 'CSS',
    'TypeScript', 'Angular', 'Vue.js', 'PHP', 'C++', 'C#', 'Ruby', 'Go',
    'Swift', 'Kotlin', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
    'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Git', 'Agile', 'Scrum',
    'Express', 'Spring', 'Django', 'Flask', 'Laravel', 'Bootstrap', 'Tailwind',
    'GraphQL', 'REST', 'API', 'Microservices', 'DevOps', 'CI/CD', 'Jenkins',
    'Terraform', 'Ansible', 'Linux', 'Ubuntu', 'Windows', 'macOS'
  ];
  
  const foundSkills: string[] = [];
  const lowerContent = content.toLowerCase();
  
  for (const skill of commonSkills) {
    const skillLower = skill.toLowerCase();
    if (lowerContent.includes(skillLower)) {
      // Make sure it's a whole word match
      const regex = new RegExp(`\\b${skillLower}\\b`, 'i');
      if (regex.test(lowerContent)) {
        foundSkills.push(skill);
      }
    }
  }
  
  return foundSkills;
}
