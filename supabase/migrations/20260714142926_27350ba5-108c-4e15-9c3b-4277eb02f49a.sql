
-- Roles enum + user_roles table
CREATE TYPE public.app_role AS ENUM ('patient', 'doctor', 'admin');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Doctors profile
CREATE TABLE public.doctors (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  bio TEXT,
  years_experience INT NOT NULL DEFAULT 0,
  consultation_fee INT NOT NULL DEFAULT 0,
  avatar_url TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.doctors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.doctors TO authenticated;
GRANT ALL ON public.doctors TO service_role;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors public read" ON public.doctors FOR SELECT USING (true);
CREATE POLICY "Doctor manages own row" ON public.doctors FOR ALL
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Slots
CREATE TABLE public.appointment_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_booked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, start_time)
);
CREATE INDEX slots_doctor_time_idx ON public.appointment_slots(doctor_id, start_time);
GRANT SELECT ON public.appointment_slots TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.appointment_slots TO authenticated;
GRANT ALL ON public.appointment_slots TO service_role;
ALTER TABLE public.appointment_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Slots public read" ON public.appointment_slots FOR SELECT USING (true);
CREATE POLICY "Doctor manages own slots" ON public.appointment_slots FOR ALL
  USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);

-- Appointments (atomic: slot_id unique = one booking per slot ever)
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL UNIQUE REFERENCES public.appointment_slots(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  ai_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX appt_doctor_idx ON public.appointments(doctor_id, created_at DESC);
CREATE INDEX appt_patient_idx ON public.appointments(patient_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patient sees own appts" ON public.appointments FOR SELECT
  USING (auth.uid() = patient_id);
CREATE POLICY "Doctor sees own appts" ON public.appointments FOR SELECT
  USING (auth.uid() = doctor_id);
CREATE POLICY "Doctor updates own appts" ON public.appointments FOR UPDATE
  USING (auth.uid() = doctor_id);

-- ATOMIC BOOKING RPC (the 25% winner)
CREATE OR REPLACE FUNCTION public.book_slot(
  _slot_id UUID,
  _patient_name TEXT,
  _patient_phone TEXT,
  _reason TEXT
)
RETURNS public.appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_slot public.appointment_slots%ROWTYPE;
  v_appt public.appointments;
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- ROW-LEVEL LOCK: SELECT ... FOR UPDATE prevents any concurrent transaction
  -- from reading this slot until we COMMIT. Two racing bookings serialize here.
  SELECT * INTO v_slot FROM public.appointment_slots
   WHERE id = _slot_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_slot.is_booked THEN
    RAISE EXCEPTION 'SLOT_ALREADY_BOOKED' USING ERRCODE = 'P0003';
  END IF;

  IF v_slot.start_time < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'P0004';
  END IF;

  -- Belt & suspenders: UNIQUE constraint on appointments.slot_id
  -- guarantees no duplicate row can ever exist, even if the lock were bypassed.
  INSERT INTO public.appointments (slot_id, doctor_id, patient_id, patient_name, patient_phone, reason)
  VALUES (_slot_id, v_slot.doctor_id, v_user, _patient_name, _patient_phone, _reason)
  RETURNING * INTO v_appt;

  UPDATE public.appointment_slots SET is_booked = true WHERE id = _slot_id;

  RETURN v_appt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_slot(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'patient')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
