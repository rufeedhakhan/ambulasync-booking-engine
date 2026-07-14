import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ShieldCheck,
  Zap,
  Database,
  ArrowRight,
  Stethoscope,
  MapPin,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "AmbulaSync – Book a doctor in under 2 minutes" },
      {
        name: "description",
        content:
          "Search verified doctors, pick a slot, and confirm your appointment. Zero double-bookings, ever, thanks to atomic database transactions.",
      },
    ],
  }),
});

type Doctor = {
  id: string;
  full_name: string;
  specialty: string;
  bio: string | null;
  years_experience: number;
  consultation_fee: number;
  city: string | null;
  avatar_url: string | null;
};

function Index() {
  const [q, setQ] = useState("");
  const { data: doctors = [], isLoading } = useQuery({
    queryKey: ["doctors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("*")
        .order("years_experience", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Doctor[];
    },
  });

  const filtered = doctors.filter((d) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      d.full_name.toLowerCase().includes(s) ||
      d.specialty.toLowerCase().includes(s) ||
      (d.city ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
          <Badge variant="secondary" className="mb-5 gap-1.5 border border-border/60 bg-background/80 px-3 py-1 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Atomic Postgres transactions · Zero double-bookings
          </Badge>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            The clinic booking platform that <span className="text-brand-gradient">never collides.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Search a specialist, pick a slot, confirm in under two minutes. Every appointment is
            written as an atomic database transaction — so two patients can't ever grab the same slot.
          </p>

          <div className="mt-8 flex max-w-2xl items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-card">
            <Search className="ml-3 h-5 w-5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by specialty, doctor name, or city…"
              className="border-0 shadow-none focus-visible:ring-0"
            />
            <Button className="bg-brand-gradient shadow-glow">
              Find doctor <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-10 grid max-w-3xl grid-cols-3 gap-6 text-sm">
            <Stat icon={<Database className="h-4 w-4" />} value="100%" label="Booking accuracy" />
            <Stat icon={<Zap className="h-4 w-4" />} value="<2 min" label="Avg. booking time" />
            <Stat icon={<ShieldCheck className="h-4 w-4" />} value="0" label="Double-bookings" />
          </div>
        </div>
      </section>

      {/* Doctor list */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Available doctors</h2>
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? "Loading…"
                : `${filtered.length} verified specialist${filtered.length === 1 ? "" : "s"} accepting bookings today`}
            </p>
          </div>
          <Link to="/doctor" className="text-sm text-primary hover:underline">
            Are you a doctor? →
          </Link>
        </div>

        {filtered.length === 0 && !isLoading ? (
          <EmptyDoctors />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((d) => (
              <DoctorCard key={d.id} d={d} />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        AmbulaSync · High-concurrency clinical scheduling · Built for the paper-register era to end.
      </footer>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function DoctorCard({ d }: { d: Doctor }) {
  const initials = d.full_name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
  return (
    <Link
      to="/doctors/$doctorId"
      params={{ doctorId: d.id }}
      className="group block rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-primary-foreground">
          {initials}
        </div>
        <div className="flex-1">
          <div className="font-semibold group-hover:text-primary">Dr. {d.full_name}</div>
          <div className="text-sm text-muted-foreground">{d.specialty}</div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {d.years_experience}y exp
            </span>
            {d.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {d.city}
              </span>
            )}
          </div>
        </div>
      </div>
      {d.bio && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{d.bio}</p>}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <div className="text-sm">
          <span className="font-semibold">₹{d.consultation_fee}</span>
          <span className="text-muted-foreground"> / consult</span>
        </div>
        <span className="text-sm font-medium text-primary group-hover:underline">
          Book slot →
        </span>
      </div>
    </Link>
  );
}

function EmptyDoctors() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
      <Stethoscope className="mx-auto h-10 w-10 text-muted-foreground" />
      <h3 className="mt-4 font-semibold">No doctors yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Sign in and create a doctor profile in the Doctor console to get started.
      </p>
      <Button asChild className="mt-4 bg-brand-gradient">
        <Link to="/auth">Sign in to onboard</Link>
      </Button>
    </div>
  );
}
