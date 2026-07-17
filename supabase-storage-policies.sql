-- Run this in Supabase > SQL Editor once.
-- Firebase handles website accounts. Supabase therefore receives browser
-- Storage requests under the anon role, even when the visitor is logged in to Firebase.

DROP POLICY IF EXISTS "Allow library uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow library signed reads" ON storage.objects;

CREATE POLICY "Allow library uploads"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'resources');

CREATE POLICY "Allow library signed reads"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'resources');

-- Deliberately no UPDATE or DELETE policy is granted to browser clients.
-- This prevents any visitor from deleting cloud files using the public key.
