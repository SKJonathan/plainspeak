import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JargonTerm {
  term: string;
  explanation: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, momentId, explanationStyle = "teen" } = await req.json();

    if (!transcript || !momentId) {
      return new Response(
        JSON.stringify({ error: "Missing transcript or momentId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get style instructions
    const stylePrompts: Record<string, string> = {
      eli5: "Explain like you're talking to a 5-year-old. Use simple words, everyday examples, and avoid any technical language.",
      teen: "Explain clearly for a high school student. Use accessible language but include some proper terminology.",
      academic: "Provide formal, academic definitions with proper terminology and precise language.",
    };

    const styleInstruction = stylePrompts[explanationStyle] || stylePrompts.teen;

    const systemPrompt = `You are an expert at identifying technical jargon, acronyms, and specialized terminology in educational content like lectures.

Your task is to:
1. Analyze the transcript and identify 2-7 items that might confuse students, including:
   - **Acronyms** (e.g., SSH, API, DNS, HTTP, SQL, RAM, CPU) - ALWAYS explain what they stand for
   - **Technical terms** (e.g., polymorphism, recursion, latency)
   - **Domain-specific jargon** (e.g., amortized, idempotent, middleware)
   - **Abbreviations** (e.g., repo, config, env)
2. For each term, provide a clear explanation

IMPORTANT: Pay special attention to acronyms - they are often the most confusing for students. If you see any capitalized abbreviations (2-5 letters), include them.

${styleInstruction}

Respond ONLY with a JSON object in this exact format:
{
  "terms": [
    { "term": "SSH", "explanation": "Secure Shell - a protocol for securely connecting to remote computers over a network" },
    { "term": "example term", "explanation": "Clear explanation of the term" }
  ]
}

If there are no technical terms worth explaining, return: { "terms": [] }`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this lecture transcript for jargon:\n\n${transcript}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse the JSON response
    let parsedTerms: { terms: JargonTerm[] };
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      parsedTerms = JSON.parse(jsonMatch[1].trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      parsedTerms = { terms: [] };
    }

    // Get auth context
    const authHeader = req.headers.get("Authorization");
    
    // Create Supabase client for database operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Save terms to database
    const savedTerms: Array<JargonTerm & { id: string }> = [];
    
    if (parsedTerms.terms && parsedTerms.terms.length > 0) {
      // Get user ID from the moment
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Get the moment to find user_id
      const { data: moment } = await supabase
        .from("captured_moments")
        .select("user_id")
        .eq("id", momentId)
        .single();

      if (moment) {
        for (const term of parsedTerms.terms) {
          const { data, error } = await supabase
            .from("jargon_terms")
            .insert({
              moment_id: momentId,
              user_id: moment.user_id,
              term: term.term,
              explanation: term.explanation,
            })
            .select()
            .single();

          if (!error && data) {
            savedTerms.push({ id: data.id, term: data.term, explanation: data.explanation });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ terms: savedTerms }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("analyze-jargon error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
