-- 1. Fix Insect Visibility (Allow Universal Mode)
DROP POLICY IF EXISTS "Anyone can view all insects" ON insects;
DROP POLICY IF EXISTS "Users can view their own insects" ON insects;

CREATE POLICY "Anyone can view all insects" 
ON insects FOR SELECT USING (true);

-- 2. Ensure Profile Visibility
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

CREATE POLICY "Public profiles are viewable by everyone" 
ON profiles FOR SELECT USING (true);

-- 3. Link Insects to Profiles (Required for Universal Mode Join)
ALTER TABLE insects 
DROP CONSTRAINT IF EXISTS insects_user_id_profiles_fkey;

ALTER TABLE insects 
ADD CONSTRAINT insects_user_id_profiles_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id);
