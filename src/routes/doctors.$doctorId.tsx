import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { bookSlot } from "@/lib/booking.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MapPin, Star, Clock, ShieldCheck, ArrowLeft, Lock } from "lucide-react";

export const Route = createFileRoute("/doctors/$doctorId")({
  component: DoctorPage,
});

type Slot = { id: string; start_time: string; end_time: string; is_booked: boolean };

function DoctorPage() {
  const { doctorId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const book = useServerFn(bookSlot);

  const { data: doctor } = useQuery({
    queryKey: ["doctor", doctorId],
    queryFn: async () => {
      const { data, error } = await supabase.from("doctors").select("*").eq("id", doctorId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: slots = [] } = useQuery({
    queryKey: ["slots", doctorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("doctor_id", doctorId)
        .gte("start_time", new Date().toISOString())
        .order("start_time")
        .limit(60);
      if (error) throw error;
      return data as Slot[];
    },
    refetchInterval: 5000, // show concurrency in action
  });

  const grouped = useMemo(() => {
    const g = new Map<string, Slot[]>();
    for (const s of slots) {
      const d = new Date(s.start_time).toDateString();
      if (!g.has(d)) g.set(d, []);
      g.get(d)!.push(s);
    }
    return Array.from(g.entries());
  }, [slots]);

  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleBook() {
    if (!openSlot) return;
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        toast.error("Please sign in to book");
        navigate({ to: "/auth" });
        return;
      }
      const res = await book({
        data: { slot_id: openSlot.id, patient_name: name, patient_phone: phone, reason },
      });
      if (!res.ok) {
        toast.error(res.message);
        qc.invalidateQueries({ queryKey: ["slots", doctorId] });
        setOpenSlot(null);
        return;
      }
      toast.success("Appointment confirmed", {
        description: `${new Date(openSlot.start_time).toLocaleString()} · locked by atomic transaction`,
      });
      setOpenSlot(null);
      qc.invalidateQueries({ queryKey: ["slots", doctorId] });
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!doctor) {
    return (
      <div className="min-h-screen bg-background">
        <SiteNav />
        <div className="mx-auto max-w-3xl p-10">Loading doctor…</div>
      </div>
    );
  }

  const initials = doctor.full_name.split(" ").map((s: string) => s[0]).slice(0, 2).join("");

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All doctors
        </Link>

        <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
          {/* Left: profile */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-brand-gradient text-2xl font-bold text-primary-foreground">
              {initials}
            </div>
            <h1 className="mt-4 text-2xl font-bold">Dr. {doctor.full_name}</h1>
            <div className="text-sm text-muted-foreground">{doctor.specialty}</div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {doctor.years_experience}y</span>
              {doctor.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {doctor.city}</span>}
            </div>
            {doctor.bio && <p className="mt-4 text-sm text-muted-foreground">{doctor.bio}</p>}
            <div className="mt-4 rounded-lg bg-secondary p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Consultation fee</div>
              <div className="text-2xl font-bold">₹{doctor.consultation_fee}</div>
            </div>
            <Badge variant="secondary" className="mt-4 gap-1">
              <ShieldCheck className="h-3 w-3 text-primary" /> Slots protected by DB-level lock
            </Badge>
          </div>

          {/* Right: slots */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="text-lg font-semibold">Available slots</h2>
            <p className="text-sm text-muted-foreground">
              Slots refresh every 5 seconds. Try booking the same slot from two tabs — one will
              always fail with <span className="font-mono text-xs">SLOT_ALREADY_BOOKED</span>.
            </p>

            {grouped.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No slots posted yet. The doctor needs to open availability from their console.
              </div>
            ) : (
              <div className="mt-4 space-y-6">
                {grouped.map(([day, ss]) => (
                  <div key={day}>
                    <div className="text-sm font-semibold">
                      {new Date(day).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {ss.map((s) => (
                        <button
                          key={s.id}
                          disabled={s.is_booked}
                          onClick={() => {
                            setOpenSlot(s);
                            setName("");
                            setPhone("");
                            setReason("");
                          }}
                          className={`rounded-lg border px-2 py-2 text-sm font-medium transition-all ${
                            s.is_booked
                              ? "cursor-not-allowed border-border bg-muted text-muted-foreground line-through"
                              : "border-border hover:border-primary hover:bg-brand-gradient hover:text-primary-foreground hover:shadow-glow"
                          }`}
                        >
                          {s.is_booked && <Lock className="mr-1 inline h-3 w-3" />}
                          {new Date(s.start_time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!openSlot} onOpenChange={(o) => !o && setOpenSlot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm appointment</DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              {openSlot && new Date(openSlot.start_time).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}
              <span className="text-muted-foreground"> · Dr. {doctor.full_name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Your name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" />
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98…" />
            </div>
            <div>
              <Label>Reason for visit</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Persistent cough for 5 days…" />
            </div>
            <div className="rounded-md bg-secondary p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mr-1 inline h-3 w-3 text-primary" />
              This booking runs inside a Postgres <code className="font-mono">SELECT … FOR UPDATE</code> lock and a
              <code className="font-mono"> UNIQUE(slot_id)</code> constraint. Double-booking is physically impossible.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenSlot(null)}>Cancel</Button>
            <Button className="bg-brand-gradient shadow-glow" onClick={handleBook} disabled={!name || submitting}>
              {submitting ? "Locking slot…" : "Confirm booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
