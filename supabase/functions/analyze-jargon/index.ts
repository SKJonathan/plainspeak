import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface JargonTerm {
  term: string;
  explanation: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const authToken = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(authToken);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claimsData.claims.sub;

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const stylePrompts: Record<string, string> = {
      eli5: "Explain like you're talking to a 5-year-old. Use simple words, everyday examples, and avoid any technical language.",
      teen: "Explain clearly for a high school student. Use accessible language but include some proper terminology.",
      academic: "Provide formal, academic definitions with proper terminology and precise language.",
    };

    const styleInstruction = stylePrompts[explanationStyle] || stylePrompts.teen;

    const systemPrompt = `You are an expert at identifying technical jargon, acronyms, and specialized terminology in educational content like lectures.

IMPORTANT: Only analyze ENGLISH text. If the transcript is not in English or contains mostly non-English content, return an empty terms array.

Your task is to:
1. Analyze the transcript and identify 2-7 items that might confuse students, including:
   - **Acronyms** (e.g., SSH, API, DNS, HTTP, SQL, RAM, CPU) - ALWAYS explain what they stand for
   - **Technical terms** (e.g., polymorphism, recursion, latency)
   - **Domain-specific jargon** (e.g., amortized, idempotent, middleware)
   - **Abbreviations** (e.g., repo, config, env)
2. For each term, provide a clear explanation in English

IMPORTANT: Pay special attention to acronyms - they are often the most confusing for students. If you see any capitalized abbreviations (2-5 letters), include them.

${styleInstruction}

Respond with a JSON object:
{
  "terms": [
    { "term": "SSH", "explanation": "Secure Shell - a protocol for securely connecting to remote computers over a network" }
  ]
}

If there are no technical terms or the text is not English, return: { "terms": [] }`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this lecture transcript for jargon:\n\n${transcript}` },
        ],
        response_format: { type: "json_object" },
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

    let parsedTerms: { terms: JargonTerm[] };
    try {
      parsedTerms = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      parsedTerms = { terms: [] };
    }

    const savedTerms: Array<JargonTerm & { id: string }> = [];

    if (parsedTerms.terms && parsedTerms.terms.length > 0) {
      // Use the authenticated user's ID instead of fetching from the moment
      for (const term of parsedTerms.terms) {
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/jargon_terms`, {
          method: "POST",
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            moment_id: momentId,
            user_id: userId,
            term: term.term,
            explanation: term.explanation,
          }),
        });

        if (insertRes.ok) {
          const insertedData = await insertRes.json();
          if (insertedData?.[0]) {
            savedTerms.push({
              id: insertedData[0].id,
              term: insertedData[0].term,
              explanation: insertedData[0].explanation,
            });
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
