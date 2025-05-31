
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced function to truncate content while preserving important sections
function intelligentTruncate(content: string, maxTokens = 3000): string {
  const maxChars = maxTokens * 4; // Rough estimate: 1 token ≈ 4 characters
  
  if (content.length <= maxChars) {
    return content;
  }

  // Try to preserve key sections while truncating
  const sections = content.split(/\n\s*\n/); // Split by paragraphs
  let result = '';
  let charCount = 0;

  // Prioritize sections that likely contain important info
  const prioritySections = sections.filter(section => {
    const lower = section.toLowerCase();
    return lower.includes('experience') || 
           lower.includes('education') || 
           lower.includes('skills') || 
           lower.includes('contact') ||
           lower.includes('email') ||
           lower.includes('phone') ||
           lower.includes('name') ||
           lower.includes('summary') ||
           lower.includes('objective');
  });

  // Add priority sections first
  for (const section of prioritySections) {
    if (charCount + section.length < maxChars * 0.7) {
      result += section + '\n\n';
      charCount += section.length;
    }
  }

  // Add remaining sections if space allows
  for (const section of sections) {
    if (!prioritySections.includes(section) && charCount + section.length < maxChars) {
      result += section + '\n\n';
      charCount += section.length;
    }
  }

  return result || content.substring(0, maxChars);
}

// Enhanced prompt for better extraction
function createExtractionPrompt(content: string): string {
  return `You are an expert resume parser. Extract ALL available information from this resume text with high accuracy. 

IMPORTANT INSTRUCTIONS:
1. Extract the candidate's FULL NAME - look carefully in headers, contact sections, or document titles
2. Find ALL contact information including email, phone, LinkedIn, location
3. Extract ALL skills mentioned - technical skills, soft skills, programming languages, tools, frameworks
4. Extract complete work experience with job titles, companies, dates, and responsibilities
5. Extract education details including degrees, institutions, and graduation dates
6. If any field is truly not found, use empty string or empty array - DO NOT make up information
7. Return ONLY valid JSON with no markdown formatting

Resume text to parse:
${content}

Return JSON in this exact format:
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

    // Convert file to text based on content type
    let fullContent: string;
    try {
      // For all supported file types, try to extract as text
      if (resume.content_type?.includes('pdf') || resume.file_name.toLowerCase().endsWith('.pdf')) {
        console.log('Processing PDF file');
        fullContent = await fileData.text();
      } else if (resume.content_type?.includes('wordprocessingml') || 
                 resume.content_type?.includes('msword') ||
                 resume.file_name.toLowerCase().endsWith('.docx') ||
                 resume.file_name.toLowerCase().endsWith('.doc')) {
        console.log('Processing Word document');
        fullContent = await fileData.text();
      } else {
        console.log('Processing as text file');
        fullContent = await fileData.text();
      }
    } catch (textError) {
      console.error('Text extraction error:', textError);
      throw new Error('Failed to extract text from file. The file may be corrupted or in an unsupported format.');
    }

    console.log('Original file content length:', fullContent.length);
    console.log('File content preview (first 500 chars):', fullContent.substring(0, 500));
    
    if (!fullContent || fullContent.trim().length < 50) {
      throw new Error('File appears to be empty or contains insufficient text content');
    }
    
    // Use intelligent truncation to preserve important sections
    const fileContent = intelligentTruncate(fullContent, 2800);
    console.log('Processed content length:', fileContent.length);

    // Create enhanced prompt
    const prompt = createExtractionPrompt(fileContent);

    // Call Groq API for parsing with enhanced prompt
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
            content: 'You are an expert resume parser with 100% accuracy. Extract ALL information from resumes and return ONLY valid JSON. Never include markdown formatting, explanations, or any text outside the JSON object.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2500,
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

    // Check if response has the expected structure
    if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
      console.error('Unexpected Groq response structure:', JSON.stringify(groqData));
      throw new Error('Invalid response structure from AI service');
    }

    const parsedDataText = groqData.choices[0].message.content;
    console.log('Raw AI response length:', parsedDataText.length);
    console.log('Raw AI response preview:', parsedDataText.substring(0, 300));
    
    // Enhanced JSON parsing with better error handling
    let parsedData;
    try {
      // Clean up the response and parse JSON
      let cleanedText = parsedDataText.trim();
      
      // Remove various markdown formatting patterns
      cleanedText = cleanedText.replace(/```json\s*/gi, '');
      cleanedText = cleanedText.replace(/```\s*/gi, '');
      cleanedText = cleanedText.replace(/^json\s*/gi, '');
      
      // Find the JSON object boundaries
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
      }
      
      console.log('Cleaned JSON text preview:', cleanedText.substring(0, 200));
      
      // Parse the JSON
      parsedData = JSON.parse(cleanedText);
      console.log('Successfully parsed JSON data');
      
      // Validate and enhance the parsed data
      parsedData = {
        full_name: (parsedData.full_name || '').trim() || 'Name Not Found',
        email: (parsedData.email || '').trim(),
        phone_number: (parsedData.phone_number || '').trim(),
        linkedin_url: (parsedData.linkedin_url || '').trim(),
        location: (parsedData.location || '').trim(),
        professional_summary: (parsedData.professional_summary || '').trim(),
        work_experience: Array.isArray(parsedData.work_experience) ? parsedData.work_experience : [],
        education: Array.isArray(parsedData.education) ? parsedData.education : [],
        skills: Array.isArray(parsedData.skills) ? parsedData.skills.filter(skill => skill && skill.trim()) : [],
        projects: Array.isArray(parsedData.projects) ? parsedData.projects : []
      };

      console.log('Final parsed data:', {
        name: parsedData.full_name,
        skills_count: parsedData.skills.length,
        experience_count: parsedData.work_experience.length,
        education_count: parsedData.education.length
      });
      
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Failed to parse text (first 500 chars):', parsedDataText.substring(0, 500));
      
      // Create fallback data structure with partial extraction
      const fallbackName = extractNameFallback(fullContent);
      const fallbackSkills = extractSkillsFallback(fullContent);
      
      parsedData = {
        full_name: fallbackName || 'Parsing Error - Manual Review Needed',
        email: extractEmailFallback(fullContent) || '',
        phone_number: extractPhoneFallback(fullContent) || '',
        linkedin_url: '',
        location: '',
        professional_summary: 'Resume content could not be parsed automatically. Manual review recommended.',
        work_experience: [],
        education: [],
        skills: fallbackSkills,
        projects: []
      };
      
      console.log('Using fallback parsing:', parsedData);
    }

    // Extract skills for quick access
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

// Fallback extraction functions for when AI parsing fails
function extractNameFallback(content: string): string {
  const lines = content.split('\n').slice(0, 10); // Check first 10 lines
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Look for lines that might be names (not emails, not too long, has spaces)
    if (trimmed.length > 3 && 
        trimmed.length < 50 && 
        !trimmed.includes('@') && 
        !trimmed.includes('http') &&
        /^[A-Za-z\s]+$/.test(trimmed) &&
        trimmed.split(' ').length >= 2) {
      return trimmed;
    }
  }
  
  return '';
}

function extractEmailFallback(content: string): string {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = content.match(emailRegex);
  return matches ? matches[0] : '';
}

function extractPhoneFallback(content: string): string {
  const phoneRegex = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
  const matches = content.match(phoneRegex);
  return matches ? matches[0] : '';
}

function extractSkillsFallback(content: string): string[] {
  const commonSkills = [
    'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'HTML', 'CSS',
    'TypeScript', 'Angular', 'Vue.js', 'PHP', 'C++', 'C#', 'Ruby', 'Go',
    'Swift', 'Kotlin', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
    'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Git', 'Agile', 'Scrum'
  ];
  
  const foundSkills: string[] = [];
  const lowerContent = content.toLowerCase();
  
  for (const skill of commonSkills) {
    if (lowerContent.includes(skill.toLowerCase())) {
      foundSkills.push(skill);
    }
  }
  
  return foundSkills;
}
