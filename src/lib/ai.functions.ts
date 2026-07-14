import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callLovableAI(messages: Array<{ role: string; content: string }>) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, messages }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached, please retry.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`AI error: ${t}`);
  }
  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content ?? "");
}

export const summarizeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ raw: z.string().min(1).max(4000), appointment_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const content = await callLovableAI([
      {
        role: "system",
        content:
          "You are a clinical scribe. Rewrite the doctor's messy shorthand into a clean SOAP-style medical note. Sections: Subjective, Objective, Assessment, Plan. Keep it concise, factual, no invented facts. Output plain text with those 4 headings.",
      },
      { role: "user", content: data.raw },
    ]);

    const { error } = await context.supabase
      .from("appointments")
      .update({ ai_summary: content, notes: data.raw })
      .eq("id", data.appointment_id);
    if (error) throw new Error(error.message);
    return { summary: content };
  });

export const generateMockPatients = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ count: z.number().min(1).max(10) }).parse(input))
  .handler(async ({ data }) => {
    const content = await callLovableAI([
      {
        role: "system",
        content:
          "Generate a JSON array of realistic Indian patient profiles for a clinic demo. Each item: {name, age, phone, reason}. Only output the JSON array, no prose.",
      },
      { role: "user", content: `Generate ${data.count} patients.` },
    ]);
    // Extract JSON from possible fenced block
    const match = content.match(/\[[\s\S]*\]/);
    try {
      return { patients: JSON.parse(match ? match[0] : content) };
    } catch {
      return { patients: [] };
    }
  });
