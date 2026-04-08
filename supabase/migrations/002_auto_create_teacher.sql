-- ============================================================================
-- AUTO-CREATE TEACHER ON SIGNUP
-- ============================================================================
-- When a user signs up via Supabase Auth, automatically create a matching
-- record in the teachers table so foreign keys (sources, translations, etc.)
-- work correctly.

-- Step 1: Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.teachers (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'teacher'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create the trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Step 3: Backfill — create teacher records for any existing auth users
-- that don't have a matching teacher record yet
INSERT INTO public.teachers (id, email, name, role)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
  'teacher'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.teachers t WHERE t.id = au.id
);

-- Step 4: Add RLS policy for teachers to see their own record
CREATE POLICY "Teachers see own profile"
ON teachers FOR SELECT
USING (auth.uid() = id);

-- Step 5: Allow the trigger function to insert into teachers
-- (SECURITY DEFINER already handles this, but add explicit insert policy)
CREATE POLICY "Auth trigger can insert teachers"
ON teachers FOR INSERT
WITH CHECK (true);
