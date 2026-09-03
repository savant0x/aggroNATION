/**
 * Firebase Admin SDK initialization (server only).
 *
 * HARD BOUNDARY: the "server-only" import makes any client-bundle import of
 * this module a build error. Never import from client components.
 *
 * Credential strategy (FID-001):
 * - FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY present →
 *   explicit service-account credentials (production / Vercel).
 * - Otherwise → applicationDefault() (local dev via
 *   `gcloud auth application-default login`, or Firebase emulators).
 *
 * The env pair is validated lazily (not at import) so static builds and
 * emulator development never require production secrets.
 */

import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { getFirebaseProjectId } from "@/lib/firebase/env";

interface ServiceAccountEnv {
  clientEmail: string;
  privateKey: string;
}

function readServiceAccountEnv(): ServiceAccountEnv | null {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!clientEmail && !rawPrivateKey) {
    return null;
  }
  if (!clientEmail || !rawPrivateKey) {
    throw new Error(
      "FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY must be set together. " +
        "Only one is defined — see .env.example.",
    );
  }

  // Vercel (and most secret managers) store literal \n sequences; the SDK
  // needs real newlines in the PEM body.
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error(
      "FIREBASE_ADMIN_PRIVATE_KEY does not look like a PEM private key. " +
        "Copy the full key including the BEGIN/END lines.",
    );
  }

  return { clientEmail, privateKey };
}

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) {
    return existing;
  }

  const serviceAccount = readServiceAccountEnv();

  if (serviceAccount) {
    return initializeApp({
      credential: cert({
        clientEmail: serviceAccount.clientEmail,
        privateKey: serviceAccount.privateKey,
      }),
    });
  }

  // projectId passed explicitly — ADC project detection fails on developer
  // machines without gcloud configuration, producing a cryptic error.
  return initializeApp({
    credential: applicationDefault(),
    projectId: getFirebaseProjectId(),
  });
}

export const adminApp: App = getAdminApp();

export const adminAuth: Auth = getAuth(adminApp);

export const adminDb: Firestore = getFirestore(adminApp);

/**
 * True when running against local emulators. The Firebase SDKs read
 * FIREBASE_EMULATOR_HOST — accepted here as truth to stay in sync with the
 * SDK behavior (also satisfied by `firebase emulators:exec`).
 */
export function isEmulatorMode(): boolean {
  return (
    Boolean(process.env.FIREBASE_EMULATOR_HOST) ||
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
    Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  );
}
