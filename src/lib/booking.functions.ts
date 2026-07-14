import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BookInput = z.object({
  slot_id: z.string().uuid(),
  patient_name: z.string().min(1).max(120),
  patient_phone: z.string().max(30).optional().default(""),
  reason: z.string().max(500).optional().default(""),
});

export const bookSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BookInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: appt, error } = await context.supabase.rpc("book_slot", {
      _slot_id: data.slot_id,
      _patient_name: data.patient_name,
      _patient_phone: data.patient_phone,
      _reason: data.reason,
    });

    if (error) {
      const msg = error.message || "";
      if (msg.includes("SLOT_ALREADY_BOOKED"))
        return { ok: false as const, code: "ALREADY_BOOKED", message: "Slot no longer available — someone just booked it." };
      if (msg.includes("SLOT_NOT_FOUND"))
        return { ok: false as const, code: "NOT_FOUND", message: "Slot not found." };
      if (msg.includes("SLOT_IN_PAST"))
        return { ok: false as const, code: "PAST", message: "That time has already passed." };
      if (msg.includes("AUTH_REQUIRED"))
        return { ok: false as const, code: "AUTH", message: "Please sign in to book." };
      return { ok: false as const, code: "ERROR", message: msg };
    }
    return { ok: true as const, appointment: appt };
  });
