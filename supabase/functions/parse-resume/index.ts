import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Improved PDF content extraction function
function extractResumeContent(content: string): string {
  console.log(`Original content length: ${content.length} characters`);
  
  // For PDF files, we need to extract meaningful text from the raw content
  let cleanContent = content;
  
  // Remove PDF headers and metadata
  cleanContent = cleanContent.replace(/%PDF-[\d.]+/g, '');
  cleanContent = cleanContent.replace(/%%EOF/g, '');
  
  // Remove PDF object structures but keep text content
  cleanContent = cleanContent.replace(/\d+\s+\d+\s+obj/g, ' ');
  cleanContent = cleanContent.replace(/endobj/g, ' ');
  cleanContent = cleanContent.replace(/stream\s*[\s\S]*?\s*endstream/g, ' ');
  
  // Remove PDF commands and keep text
  cleanContent = cleanContent.replace(/\/[A-Z][A-Za-z0-9]*\s*/g, ' ');
  cleanContent = cleanContent.replace(/<<.*?>>/g, ' ');
  cleanContent = cleanContent.replace(/\[.*?\]/g, ' ');
  
  // Extract readable text by looking for common patterns
  const textPatterns = [
    /[A-Za-z][A-Za-z\s]{2,}/g, // Words and phrases
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, // Names (First Last)
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Emails
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone numbers
    /\b(?:JavaScript|Python|Java|React|Node\.js|SQL|HTML|CSS|AWS|Docker|Kubernetes|Git|Angular|Vue|MongoDB|PostgreSQL|MySQL|TypeScript|PHP|C\+\+|C#|Ruby|Swift|Kotlin|Go|Rust|Scala|R|MATLAB|Tableau|Power BI|Excel|Salesforce|Adobe|Photoshop|Illustrator|AutoCAD|SolidWorks|Linux|Windows|macOS|Agile|Scrum|DevOps|CI\/CD|REST|API|GraphQL|Machine Learning|AI|Data Science|Analytics|Cloud|Azure|GCP|Terraform|Jenkins|JIRA|Confluence|Slack|Teams|Zoom|Project Management|Leadership|Communication|Problem Solving|Critical Thinking|Time Management|Teamwork|Adaptability|Creativity|Innovation|Strategic Planning|Budget Management|Risk Management|Quality Assurance|Testing|Debugging|Troubleshooting|Documentation|Training|Mentoring|Coaching|Negotiation|Sales|Marketing|Customer Service|Business Analysis|Process Improvement|Six Sigma|Lean|ITIL|PMP|Certified|Certification|Bachelor|Master|PhD|Degree|University|College|Institute|School|Education|Experience|Work|Employment|Job|Career|Professional|Skills|Technical|Soft|Hard|Core|Key|Primary|Secondary|Advanced|Intermediate|Beginner|Expert|Proficient|Familiar|Knowledge|Understanding|Expertise|Competency|Ability|Capability|Talent|Strength|Achievement|Accomplishment|Award|Recognition|Honor|Certificate|License|Accreditation)\b/gi, // Skills and keywords
  ];
  
  let extractedText = '';
  textPatterns.forEach(pattern => {
    const matches = cleanContent.match(pattern) || [];
    extractedText += matches.join(' ') + ' ';
  });
  
  // If extraction didn't work well, fall back to simple cleaning
  if (extractedText.length < 100) {
    extractedText = content
      .replace(/[^\w\s@._-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Take first 3000 characters to stay under token limits
  const result = extractedText.substring(0, 3000).trim();
  
  console.log(`Extracted content length: ${result.length} characters`);
  console.log(`Sample content: ${result.substring(0, 300)}...`);
  
  return result;
}

// Enhanced prompt for better parsing
function createParsingPrompt(content: string): string {
  return `You are a professional resume parser. Extract information from this resume text and return ONLY a valid JSON object with the exact structure shown below.

IMPORTANT RULES:
1. Return ONLY the JSON object, no explanations or markdown
2. If you cannot find a field, use empty string "" or empty array []
3. For skills, include both technical skills (programming languages, tools, software) and soft skills
4. For work experience, include company, position, duration, and description
5. For education, include institution, degree, field of study, and graduation year

Resume text:
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
    
    // Extract meaningful content
    const extractedContent = extractResumeContent(fullContent);
    
    if (extractedContent.length < 50) {
      throw new Error('Could not extract meaningful content from resume');
    }
    
    const prompt = createParsingPrompt(extractedContent);

    console.log('Calling Groq API with enhanced prompt...');

    // Call Groq API with better parameters
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
            content: 'You are a resume parsing specialist. Return only valid JSON objects with extracted resume information. Never include explanations or formatting.'
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

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errorText);
      throw new Error(`AI service error: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    console.log('AI response received');

    if (!groqData.choices?.[0]?.message?.content) {
      throw new Error('Invalid AI response');
    }

    const aiResponse = groqData.choices[0].message.content.trim();
    console.log('Raw AI response:', aiResponse.substring(0, 500) + '...');
    
    // Parse JSON response
    let parsedData;
    try {
      // Clean response more thoroughly
      let jsonText = aiResponse;
      
      // Remove markdown formatting
      jsonText = jsonText.replace(/```json/gi, '');
      jsonText = jsonText.replace(/```/gi, '');
      
      // Find JSON object boundaries
      const startIndex = jsonText.indexOf('{');
      const endIndex = jsonText.lastIndexOf('}');
      
      if (startIndex === -1 || endIndex === -1) {
        throw new Error('No JSON object found in AI response');
      }
      
      jsonText = jsonText.substring(startIndex, endIndex + 1);
      
      console.log('Attempting to parse JSON...');
      parsedData = JSON.parse(jsonText);
      
      // Validate and clean parsed data
      parsedData = {
        full_name: String(parsedData.full_name || '').trim(),
        email: String(parsedData.email || '').trim(),
        phone_number: String(parsedData.phone_number || '').trim(),
        linkedin_url: String(parsedData.linkedin_url || '').trim(),
        location: String(parsedData.location || '').trim(),
        professional_summary: String(parsedData.professional_summary || '').trim(),
        work_experience: Array.isArray(parsedData.work_experience) ? parsedData.work_experience : [],
        education: Array.isArray(parsedData.education) ? parsedData.education : [],
        skills: Array.isArray(parsedData.skills) ? parsedData.skills.filter(skill => skill && String(skill).trim()) : [],
        projects: Array.isArray(parsedData.projects) ? parsedData.projects : []
      };

      console.log('Successfully parsed data:', {
        name: parsedData.full_name,
        email: parsedData.email,
        skills_count: parsedData.skills.length,
        work_experience_count: parsedData.work_experience.length
      });
      
    } catch (parseError) {
      console.error('JSON parsing failed:', parseError);
      console.error('Raw AI response was:', aiResponse);
      throw new Error('Failed to parse AI response as JSON');
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
