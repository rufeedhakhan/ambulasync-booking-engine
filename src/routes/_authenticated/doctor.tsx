import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { upsertMyDoctorProfile, createSlots } from "@/lib/doctors.functions";
import { summarizeNote, generateMockPatients } from "@/lib/ai.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, CalendarPlus, User, Wand2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/doctor")({
  component: DoctorConsole,
});

function DoctorConsole() {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertMyDoctorProfile);
  const makeSlots = useServerFn(createSlots);
  const summarize = useServerFn(summarizeNote);
  const mockGen = useServerFn(generateMockPatients);

  const [uid, setUid] = useState<string | null>(null);
  useState(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  });

  const { data: myDoctor, isLoading } = useQuery({
    queryKey: ["me-doctor"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      if (!sess.user) return null;
      const { data } = await supabase.from("doctors").select("*").eq("id", sess.user.id).maybeSingle();
      return data;
    },
  });

  const { data: appts = [] } = useQuery({
    queryKey: ["doctor-appts"],
    enabled: !!myDoctor,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, appointment_slots(start_time)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <Shell>Loading…</Shell>;

  if (!myDoctor) return <OnboardDoctor onSaved={() => qc.invalidateQueries()} upsert={upsert} />;

  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Doctor Console</h1>
        <p className="text-sm text-muted-foreground">
          Manage slots, review appointments, and clean up clinical notes with AI.
        </p>
      </div>

      <Tabs defaultValue="appts">
        <TabsList>
          <TabsTrigger value="appts">Appointments ({appts.length})</TabsTrigger>
          <TabsTrigger value="slots">Open slots</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="appts" className="mt-6">
          <ApptsPanel appts={appts} summarize={summarize} mockGen={mockGen} />
        </TabsContent>

        <TabsContent value="slots" className="mt-6">
          <SlotsPanel makeSlots={makeSlots} onCreated={() => qc.invalidateQueries()} />
        </TabsContent>

        <TabsContent value="profile" className="mt-6">
          <ProfilePanel doctor={myDoctor} upsert={upsert} onSaved={() => qc.invalidateQueries()} />
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="mx-auto max-w-6xl px-4 py-10">{children}</div>
    </div>
  );
}

function OnboardDoctor({
  onSaved,
  upsert,
}: {
  onSaved: () => void;
  upsert: ReturnType<typeof useServerFn<typeof upsertMyDoctorProfile>>;
}) {
  return (
    <Shell>
      <Card className="mx-auto max-w-2xl shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Onboard as a doctor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DoctorForm
            initial={null}
            onSubmit={async (v) => {
              try {
                await upsert({ data: v });
                toast.success("Doctor profile created");
                onSaved();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            }}
          />
        </CardContent>
      </Card>
    </Shell>
  );
}

function ProfilePanel({
  doctor,
  upsert,
  onSaved,
}: {
  doctor: {
    full_name: string;
    specialty: string;
    bio: string | null;
    years_experience: number;
    consultation_fee: number;
    city: string | null;
  };
  upsert: ReturnType<typeof useServerFn<typeof upsertMyDoctorProfile>>;
  onSaved: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Public profile</CardTitle>
      </CardHeader>
      <CardContent>
        <DoctorForm
          initial={doctor}
          onSubmit={async (v) => {
            try {
              await upsert({ data: v });
              toast.success("Saved");
              onSaved();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

function DoctorForm({
  initial,
  onSubmit,
}: {
  initial: {
    full_name: string;
    specialty: string;
    bio: string | null;
    years_experience: number;
    consultation_fee: number;
    city: string | null;
  } | null;
  onSubmit: (v: {
    full_name: string;
    specialty: string;
    bio: string;
    years_experience: number;
    consultation_fee: number;
    city: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.full_name ?? "");
  const [specialty, setSpecialty] = useState(initial?.specialty ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [yrs, setYrs] = useState(initial?.years_experience ?? 5);
  const [fee, setFee] = useState(initial?.consultation_fee ?? 500);
  const [city, setCity] = useState(initial?.city ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit({
          full_name: name,
          specialty,
          bio,
          years_experience: Number(yrs),
          consultation_fee: Number(fee),
          city,
        });
        setBusy(false);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label>Specialty</Label>
          <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Cardiology" required />
        </div>
        <div>
          <Label>Years of experience</Label>
          <Input type="number" value={yrs} onChange={(e) => setYrs(Number(e.target.value))} />
        </div>
        <div>
          <Label>Consultation fee (₹)</Label>
          <Input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
        </div>
        <div className="sm:col-span-2">
          <Label>City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
        </div>
        <div className="sm:col-span-2">
          <Label>Bio</Label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
        </div>
      </div>
      <Button type="submit" className="bg-brand-gradient shadow-glow" disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

function SlotsPanel({
  makeSlots,
  onCreated,
}: {
  makeSlots: ReturnType<typeof useServerFn<typeof createSlots>>;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [startH, setStartH] = useState(9);
  const [endH, setEndH] = useState(17);
  const [dur, setDur] = useState(30);
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="h-5 w-5 text-primary" /> Open new slots
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const res = await makeSlots({
                data: { date, start_hour: startH, end_hour: endH, duration_min: dur },
              });
              toast.success(`Opened ${res.created} slot${res.created === 1 ? "" : "s"}`);
              onCreated();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>From (hour)</Label>
            <Input type="number" min={0} max={23} value={startH} onChange={(e) => setStartH(Number(e.target.value))} />
          </div>
          <div>
            <Label>To (hour)</Label>
            <Input type="number" min={1} max={24} value={endH} onChange={(e) => setEndH(Number(e.target.value))} />
          </div>
          <div>
            <Label>Slot minutes</Label>
            <Input type="number" min={10} max={120} value={dur} onChange={(e) => setDur(Number(e.target.value))} />
          </div>
          <div className="sm:col-span-4">
            <Button type="submit" disabled={busy} className="bg-brand-gradient shadow-glow">
              {busy ? "Opening…" : "Open slots"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type Appt = {
  id: string;
  patient_name: string;
  patient_phone: string | null;
  reason: string | null;
  notes: string | null;
  ai_summary: string | null;
  status: string;
  appointment_slots: { start_time: string } | null;
};

function ApptsPanel({
  appts,
  summarize,
  mockGen,
}: {
  appts: Appt[];
  summarize: ReturnType<typeof useServerFn<typeof summarizeNote>>;
  mockGen: ReturnType<typeof useServerFn<typeof generateMockPatients>>;
}) {
  const [selected, setSelected] = useState<Appt | null>(null);
  const [rawNote, setRawNote] = useState("");
  const [aiOut, setAiOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [mockBusy, setMockBusy] = useState(false);
  const qc = useQueryClient();

  async function doSummarize() {
    if (!selected) return;
    setBusy(true);
    try {
      const { summary } = await summarize({
        data: { raw: rawNote, appointment_id: selected.id },
      });
      setAiOut(summary);
      toast.success("AI note generated");
      qc.invalidateQueries({ queryKey: ["doctor-appts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally {
      setBusy(false);
    }
  }

  async function seedMock() {
    setMockBusy(true);
    try {
      const { patients } = await mockGen({ data: { count: 5 } });
      toast.success(`Generated ${patients.length} mock patients`, {
        description: patients
          .slice(0, 3)
          .map((p: { name: string }) => p.name)
          .join(", "),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally {
      setMockBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={seedMock} disabled={mockBusy}>
          <Wand2 className="h-4 w-4" /> {mockBusy ? "Generating…" : "AI mock patients"}
        </Button>
      </div>

      {appts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
          No appointments yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left font-semibold">Patient</th>
                <th className="p-3 text-left font-semibold">When</th>
                <th className="p-3 text-left font-semibold">Reason</th>
                <th className="p-3 text-left font-semibold">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {appts.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{a.patient_name}</div>
                        {a.patient_phone && (
                          <div className="text-xs text-muted-foreground">{a.patient_phone}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {a.appointment_slots
                      ? new Date(a.appointment_slots.start_time).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">{a.reason || "—"}</td>
                  <td className="p-3">
                    <Badge variant="secondary" className="bg-success/10 text-success">
                      {a.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelected(a);
                        setRawNote(a.notes ?? "");
                        setAiOut(a.ai_summary ?? "");
                      }}
                    >
                      <Sparkles className="h-3 w-3" /> Notes
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Consultation notes · {selected?.patient_name}</DialogTitle>
            <DialogDescription>
              Type shorthand — AmbulaSync AI formats it into a professional SOAP-style note.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Raw notes</Label>
              <Textarea
                rows={12}
                value={rawNote}
                onChange={(e) => setRawNote(e.target.value)}
                placeholder="cough 5d, low fever, no SOB. lungs clr. rx azith 500 x 3d…"
              />
              <Button
                className="mt-3 w-full bg-brand-gradient shadow-glow"
                disabled={!rawNote || busy}
                onClick={doSummarize}
              >
                <Sparkles className="h-4 w-4" /> {busy ? "Summarizing…" : "Summarize with AI"}
              </Button>
            </div>
            <div>
              <Label>AI SOAP note</Label>
              <div className="min-h-[280px] whitespace-pre-wrap rounded-md border border-border bg-secondary/50 p-3 text-sm">
                {aiOut || (
                  <span className="text-muted-foreground">Generated note appears here…</span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
