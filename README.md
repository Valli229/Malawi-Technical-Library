# Malawi Technical Library

## Run the website
Open `index.html` using the Live Server extension in VS Code. Do not open the pages directly with a `file:///` address because Firebase module imports require a web server.

## Firebase Authentication
The project is connected to the Firebase project `malawi-technical-libraries`.

- Students can register and log in with Email/Password.
- Signed-out visitors can browse, preview and download resources.
- Only `talandirathukuta@gmail.com` is treated as an administrator.
- The Upload link and Delete controls are shown only to the administrator.
- The Upload page redirects unauthorized users.

## Current resource storage
Documents are still stored in IndexedDB in the current browser. Authentication is real, but files are not yet shared between devices. Firebase Storage and Firestore should be connected next to create one public online library.


## Important security note
The interface and page guards restrict normal users from administrator controls. Because resources are still stored in each browser's IndexedDB, this is not server-side security. Real shared storage must use Firebase Storage and Firestore Security Rules before public launch.
