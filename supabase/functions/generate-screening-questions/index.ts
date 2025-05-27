
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
            content: 'You are an expert interviewer. Generate thoughtful screening questions based on a candidate\'s profile.'
          },
          {
            role: 'user',
            content: `Generate 5-7 technical and 2-3 behavioral screening questions for a candidate with this profile:

Name: ${resumeData.full_name}
Skills: ${resumeData.skills?.join(', ')}
Experience: ${resumeData.work_experience?.map(exp => `${exp.job_title} at ${exp.company_name}`).join(', ')}
Summary: ${resumeData.professional_summary}

Tailor questions to assess:
1. Technical proficiency in their core skills
2. Experience depth and problem-solving ability
3. Cultural fit and motivation
4. Specific technologies/tools they've used

Return as JSON array of question objects:
[
  {
    "category": "technical|behavioral",
    "question": "string",
    "purpose": "string (what this question aims to assess)"
  }
]`
          }
        ],
        temperature: 0.3,
      }),
    });

    const groqData = await groqResponse.json();
    const questionsText = groqData.choices[0].message.content;
    
    let questions;
    try {
      const cleanedText = questionsText.replace(/```json\n?|\n?```/g, '').trim();
      questions = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      throw new Error('Failed to parse AI response as JSON');
    }

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Generate questions error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
