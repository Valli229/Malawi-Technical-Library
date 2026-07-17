# Cloud setup

The website layout and existing pages remain unchanged. All JavaScript files are in the project root; there is no `assets/js/` folder.

## Services used

- Firebase Authentication: registration and login
- Cloud Firestore: resource information, approval status and ownership
- Supabase Storage: PDF, DOCX, PPTX, XLSX and text files

Firebase and Supabase can work on the same website. They are separate services, so Supabase does not automatically understand a Firebase login token. This project keeps approval security in Firestore and permits only upload/read operations through the browser-safe Supabase publishable key.

## 1. Publish Firestore rules

Open Firebase Console > Firestore Database > Rules. Replace the rules with the contents of `firestore.rules`, then click Publish.

Your administrator document must remain at:

`users/YOUR_FIREBASE_ADMIN_UID`

with `role` set to `admin`.

## 2. Apply Supabase Storage policies

Open Supabase > SQL Editor, paste the contents of `supabase-storage-policies.sql`, and run it.

Keep the Storage bucket name as `resources` and keep it private. Preview and download links are temporary signed links.

## 3. Test with Live Server

1. Open `index.html` using VS Code Live Server.
2. Register or log in as a student.
3. Open Upload and submit a small PDF.
4. Log in as the administrator.
5. Open Resources and approve the pending resource.
6. Log out and confirm the approved resource is visible and previewable.

## Important deletion limitation

The Delete button securely removes the Firestore library record, so the resource disappears from the website. The underlying Supabase object is not deleted by browser code because granting delete access to a public publishable key would let anyone delete files. Remove orphaned files manually in Supabase Storage. A future Supabase Edge Function or trusted server can perform secure automatic file deletion after verifying the Firebase administrator token.

## Upload troubleshooting added
The upload button now reports three separate stages: cloud connection/upload progress, then saving metadata to Firestore. Supabase uploads stop after 90 seconds and Firestore writes stop after 30 seconds with a specific error instead of remaining on "Uploading" forever.
