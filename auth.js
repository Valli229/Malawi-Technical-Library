import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { firebaseConfig, ADMIN_EMAILS } from './firebase-config.js';

const configured = !String(firebaseConfig.apiKey).startsWith('PASTE_');
let auth = null;
if (configured) auth = getAuth(initializeApp(firebaseConfig));

export { auth, configured };
export const isAdmin = (user) => Boolean(user?.email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase()));
export const watchAuth = (callback) => configured ? onAuthStateChanged(auth, callback) : callback(null);
export async function registerAccount(name, email, password) {
  if (!configured) throw new Error('Firebase has not been configured yet.');
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName: name });
  return result.user;
}
export async function loginAccount(email, password) {
  if (!configured) throw new Error('Firebase has not been configured yet.');
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}
export async function logoutAccount() { if (configured) await signOut(auth); }
