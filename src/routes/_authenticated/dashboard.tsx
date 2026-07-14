import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: appts = [], isLoading } = useQuery({
    queryKey: ["my-appts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, appointment_slots(start_time, end_time), doctors(full_name, specialty)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My appointments</h1>
            <p className="text-sm text-muted-foreground">Everything booked to your account.</p>
          </div>
          <Button asChild className="bg-brand-gradient shadow-glow">
            <Link to="/">Book another</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : appts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
            <Calendar className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">No appointments yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Find a doctor to book your first visit.</p>
            <Button asChild className="mt-4 bg-brand-gradient">
              <Link to="/">Browse doctors</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {appts.map((a) => {
              const slot = (a as { appointment_slots: { start_time: string } | null }).appointment_slots;
              const doc = (a as { doctors: { full_name: string; specialty: string } | null }).doctors;
              const when = slot ? new Date(slot.start_time) : null;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-5 shadow-card"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-gradient text-primary-foreground">
                      <Stethoscope className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold">Dr. {doc?.full_name}</div>
                      <div className="text-sm text-muted-foreground">{doc?.specialty}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <div className="font-medium">
                        {when?.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                      <div className="flex items-center justify-end gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {when?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-success/10 text-success">
                      {a.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
