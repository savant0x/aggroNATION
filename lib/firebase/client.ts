/**
 * Firebase Client SDK initialization (browser + client components).
 *
 * Idempotent: guarded by getApps() so Next.js fast-refresh / module
 * re-evaluation never creates duplicate apps.
 *
 * Server code must NEVER import from this file — use lib/firebase/admin.ts.
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

import { firebaseClientEnv } from "./env";

function getFirebaseApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) {
    return existing;
  }
  return initializeApp({
    apiKey: firebaseClientEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: firebaseClientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: firebaseClientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: firebaseClientEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId:
      firebaseClientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: firebaseClientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}

export const firebaseApp: FirebaseApp = getFirebaseApp();

export const auth: Auth = getAuth(firebaseApp);

export const db: Firestore = getFirestore(firebaseApp);

export const googleProvider: GoogleAuthProvider = new GoogleAuthProvider();

/**
 * Connect client SDK to local emulators. Call once from client entry when
 * NEXT_PUBLIC_USE_FIREBASE_EMULATORS is set (dev only). Safe to call
 * repeatedly — the underlying connect* functions tolerate re-invocation
 * after the first successful connection on the same auth/firestore instance.
 */
export async function connectToEmulatorsIfConfigured(): Promise<void> {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true") {
    return;
  }
  const { connectAuthEmulator } = await import("firebase/auth");
  const { connectFirestoreEmulator } = await import("firebase/firestore");

  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
