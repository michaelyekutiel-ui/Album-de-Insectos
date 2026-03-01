-- 1. Fix Insect Visibility (Allow Universal Mode)
DROP POLICY IF EXISTS "Anyone can view all insects" ON insects;
DROP POLICY IF EXISTS "Users can view their own insects" ON insects;

CREATE POLICY "Anyone can view all insects" 
ON insects FOR SELECT USING (true);

-- 2. Link Insects to Profiles (Required for Universal Mode Join)
-- Explicitly naming the relationship help PostgREST find it
ALTER TABLE insects 
DROP CONSTRAINT IF EXISTS insects_user_id_profiles_fkey;

ALTER TABLE insects 
ADD CONSTRAINT insects_user_id_profiles_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id);

-- 3. Ensure Profile Visibility for Icons
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

CREATE POLICY "Public profiles are viewable by everyone" 
ON profiles FOR SELECT USING (true);

-- 4. Storage Setup (Avatars Bucket) 
-- Ensure you have a bucket named 'avatars' in Supabase Storage.
-- This script will try to create it and make it PUBLIC.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public access to read avatars
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

-- Allow users to upload their own avatars into a folder named after their UID
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
CREATE POLICY "Users can upload avatars" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
);
