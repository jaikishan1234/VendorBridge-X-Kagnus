ALTER TABLE public.users
  ALTER COLUMN role
  SET DEFAULT 'VENDOR'::public.user_role;
