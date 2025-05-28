
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resumeData } = await req.json();
    const groqApiKey = Deno.env.get('GROQ_API_KEY')!;

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
            content: 'You are an expert interviewer. You must respond ONLY with valid JSON format. Do not include any explanatory text before or after the JSON.'
          },
          {
            role: 'user',
            content: `Generate 5-7 technical and 2-3 behavioral screening questions for a candidate with this profile:

Name: ${resumeData.full_name || 'N/A'}
Skills: ${resumeData.skills?.join(', ') || 'N/A'}
Experience: ${resumeData.work_experience?.map(exp => `${exp.job_title} at ${exp.company_name}`).join(', ') || 'N/A'}
Summary: ${resumeData.professional_summary || 'N/A'}

Return ONLY a JSON array of question objects in this exact format:
[
  {
    "category": "technical",
    "question": "Can you explain your experience with [specific technology from their resume]?",
    "purpose": "Assess technical depth and hands-on experience"
  },
  {
    "category": "behavioral",
    "question": "Tell me about a challenging project you worked on and how you overcame obstacles.",
    "purpose": "Evaluate problem-solving skills and resilience"
  }
]

IMPORTANT: Return ONLY the JSON array, no other text.`
          }
        ],
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const groqData = await response.json();
    console.log('Groq response:', groqData);

    if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
      throw new Error('Invalid response structure from Groq API');
    }

    const questionsText = groqData.choices[0].message.content.trim();
    console.log('Raw AI response:', questionsText);
    
    let questions;
    try {
      // Remove any markdown code blocks if present
      const cleanedText = questionsText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/^[^[\{]*/, '') // Remove any text before the first [ or {
        .replace(/[^}\]]*$/, '') // Remove any text after the last } or ]
        .trim();
      
      console.log('Cleaned text:', cleanedText);
      questions = JSON.parse(cleanedText);
      
      // Validate the structure
      if (!Array.isArray(questions)) {
        throw new Error('Response is not an array');
      }
      
      // Ensure each question has the required fields
      questions = questions.map((q, index) => ({
        category: q.category || 'technical',
        question: q.question || `Question ${index + 1}`,
        purpose: q.purpose || 'Assess candidate capabilities'
      }));
      
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Failed to parse:', questionsText);
      
      // Fallback: create default questions based on resume data
      questions = [
        {
          category: "technical",
          question: `Can you walk me through your experience with ${resumeData.skills?.[0] || 'the technologies'} mentioned in your resume?`,
          purpose: "Assess technical depth and hands-on experience"
        },
        {
          category: "technical", 
          question: "Describe a challenging technical problem you solved recently and your approach.",
          purpose: "Evaluate problem-solving methodology"
        },
        {
          category: "technical",
          question: `How do you stay updated with the latest developments in ${resumeData.skills?.[0] || 'your field'}?`,
          purpose: "Assess continuous learning mindset"
        },
        {
          category: "behavioral",
          question: "Tell me about a time when you had to work with a difficult team member.",
          purpose: "Evaluate interpersonal and conflict resolution skills"
        },
        {
          category: "behavioral",
          question: "Describe a project where you had to learn something completely new.",
          purpose: "Assess adaptability and learning agility"
        }
      ];
    }

    console.log('Final questions:', questions);

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Generate questions error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      questions: [
        {
          category: "technical",
          question: "Can you describe your technical background and key skills?",
          purpose: "Assess overall technical competency"
        },
        {
          category: "behavioral", 
          question: "Tell me about your most significant professional achievement.",
          purpose: "Evaluate accomplishments and impact"
        }
      ]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
