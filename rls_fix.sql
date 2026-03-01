-- 1. Fix Insect Visibility (Allow Universal Mode)
DROP POLICY IF EXISTS "Users can view their own insects" ON insects;

CREATE POLICY "Anyone can view all insects" 
ON insects FOR SELECT USING (true);

-- 2. Ensure Profile Visibility
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

CREATE POLICY "Public profiles are viewable by everyone" 
ON profiles FOR SELECT USING (true);
