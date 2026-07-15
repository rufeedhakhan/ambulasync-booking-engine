
-- 1. Restrict profiles SELECT to self only
DROP POLICY IF EXISTS "Profiles are viewable by all" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- 2. Add INSERT policy on appointments (patient can insert own)
CREATE POLICY "Patients insert own appts" ON public.appointments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = patient_id);

-- 3. Lock down SECURITY DEFINER function execute grants
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE ALL ON FUNCTION public.book_slot(uuid, text, text, text) FROM PUBLIC, anon;
-- keep authenticated execute for book_slot: it's the patient booking entry point,
-- checks auth.uid() internally and raises AUTH_REQUIRED otherwise.
GRANT EXECUTE ON FUNCTION public.book_slot(uuid, text, text, text) TO authenticated, service_role;
