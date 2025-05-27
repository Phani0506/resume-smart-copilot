
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
    const { resumeData, jobContext } = await req.json();
    const groqApiKey = Deno.env.get('GROQ_API_KEY')!;

    const contextPrompt = jobContext 
      ? `We are hiring for ${jobContext.jobTitle} at ${jobContext.company}.` 
      : 'We are interested in connecting with talented professionals.';

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
            content: 'You are an expert recruiter who writes compelling, personalized outreach messages that get responses.'
          },
          {
            role: 'user',
            content: `Draft a personalized outreach email for this candidate:

Name: ${resumeData.full_name}
Current Role: ${resumeData.work_experience?.[0]?.job_title || 'Professional'}
Skills: ${resumeData.skills?.slice(0, 5).join(', ')}
Experience: ${resumeData.professional_summary}

Context: ${contextPrompt}

Write an engaging email that:
1. Addresses them by name
2. References 1-2 specific skills/experiences from their background
3. Expresses genuine interest
4. Includes a clear, friendly call to action
5. Keeps it concise (under 200 words)
6. Maintains a professional but warm tone

Return only the email content, no additional formatting or subject line.`
          }
        ],
        temperature: 0.4,
      }),
    });

    const groqData = await groqResponse.json();
    const message = groqData.choices[0].message.content;

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Generate outreach error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
