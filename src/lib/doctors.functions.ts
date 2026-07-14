import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const UpsertDoctor = z.object({
  full_name: z.string().min(2),
  specialty: z.string().min(2),
  bio: z.string().max(1000).optional().default(""),
  years_experience: z.number().min(0).max(70),
  consultation_fee: z.number().min(0).max(100000),
  city: z.string().max(80).optional().default(""),
});

export const upsertMyDoctorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpsertDoctor.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("doctors").upsert({
      id: context.userId,
      ...data,
    });
    if (error) throw new Error(error.message);
    // grant doctor role
    await context.supabase
      .from("user_roles")
      .insert({ user_id: context.userId, role: "doctor" });
    return { ok: true };
  });

export const createSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      date: z.string(), // YYYY-MM-DD
      start_hour: z.number().min(0).max(23),
      end_hour: z.number().min(1).max(24),
      duration_min: z.number().min(10).max(120),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const slots: Array<{ doctor_id: string; start_time: string; end_time: string }> = [];
    const [y, m, d] = data.date.split("-").map(Number);
    const dur = data.duration_min * 60_000;
    for (let h = data.start_hour * 60; h < data.end_hour * 60; h += data.duration_min) {
      const start = new Date(Date.UTC(y, m - 1, d, 0, h - new Date().getTimezoneOffset()));
      // simpler: interpret as local using components
      const local = new Date(y, m - 1, d, Math.floor(h / 60), h % 60);
      slots.push({
        doctor_id: context.userId,
        start_time: local.toISOString(),
        end_time: new Date(local.getTime() + dur).toISOString(),
      });
      void start;
    }
    const { error, data: inserted } = await context.supabase
      .from("appointment_slots")
      .upsert(slots, { onConflict: "doctor_id,start_time", ignoreDuplicates: true })
      .select();
    if (error) throw new Error(error.message);
    return { created: inserted?.length ?? 0 };
  });
