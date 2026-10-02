/**
 * ════════════════════════════════════════════════════════════════════════════
 * FIREBASE INITIALIZATION
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Initializes the Firebase app using environment variables.
 * Exports:
 *   - app      → Firebase App instance
 *   - db       → Firestore database instance
 *   - storage  → Firebase Storage instance
 *
 * Required env variables:
 *   NEXT_PUBLIC_FIREBASE_API_KEY
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 *   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 *   NEXT_PUBLIC_FIREBASE_APP_ID
 * ════════════════════════════════════════════════════════════════════════════
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Direct static references — Next.js inlines these at build time.
// Do NOT use dynamic access (process.env[varName]) for NEXT_PUBLIC_* variables.
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId,
};

// ── Safe runtime diagnostics (never logs full credential values) ─────────────
// A value is a placeholder only if it is missing, empty, or matches known
// placeholder patterns. Real project IDs like "karaoke-9facd" are NOT placeholders.
function isPlaceholder(value: string | undefined): boolean {
  if (!value || value.trim() === '') return true;
  const lower = value.toLowerCase().trim();
  // Known placeholder patterns used in .env template files
  const placeholderPatterns = [
    'your-firebase-api-key-here',
    'your-firebase-project-id-here',
    'your-messaging-sender-id-here',
    'your-firebase-app-id-here',
    'your-firebase-auth-domain-here',
    'your-firebase-storage-bucket-here',
    'your-',
    'placeholder',
    'undefined',
    'null',
    'example',
    'changeme',
    'replace',
    'insert',
  ];
  return placeholderPatterns.some((p) => lower === p || lower.startsWith(p));
}

function varDiag(value: string | undefined): string {
  if (!value || value.trim() === '') return 'AUSENTE';
  return `PRESENTE (primeiros 3: "${value.slice(0, 3)}", tamanho: ${value.length})`;
}

console.log('[firebase] ══ DIAGNÓSTICO DE VARIÁVEIS DE AMBIENTE ══');
console.log('[firebase] NEXT_PUBLIC_FIREBASE_API_KEY          :', varDiag(apiKey));
console.log('[firebase] NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN      :', varDiag(authDomain));
console.log('[firebase] NEXT_PUBLIC_FIREBASE_PROJECT_ID       :', varDiag(projectId));
console.log('[firebase] NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET   :', varDiag(storageBucket));
console.log('[firebase] NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:', varDiag(messagingSenderId));
console.log('[firebase] NEXT_PUBLIC_FIREBASE_APP_ID           :', varDiag(appId));
console.log('[firebase] ══ DIAGNÓSTICO DO OBJETO firebaseConfig ══');
console.log('[firebase] projectId efetivamente usado          :', firebaseConfig.projectId ?? '(undefined)');
console.log('[firebase] apiKey presente (não placeholder)     :', !!firebaseConfig.apiKey && !isPlaceholder(firebaseConfig.apiKey));
console.log('[firebase] authDomain presente (não placeholder) :', !!firebaseConfig.authDomain && !isPlaceholder(firebaseConfig.authDomain));
console.log('[firebase] storageBucket presente (não placeholder):', !!firebaseConfig.storageBucket && !isPlaceholder(firebaseConfig.storageBucket));
console.log('[firebase] messagingSenderId presente (não placeholder):', !!firebaseConfig.messagingSenderId && !isPlaceholder(firebaseConfig.messagingSenderId));
console.log('[firebase] appId presente (não placeholder)      :', !!firebaseConfig.appId && !isPlaceholder(firebaseConfig.appId));

// Prevent duplicate initialization in Next.js hot-reload / SSR environments
const wasAlreadyInitialized = getApps().length > 0;
const app: FirebaseApp = wasAlreadyInitialized ? getApp() : initializeApp(firebaseConfig);

console.log('[firebase] App initialization:', {
  appName: app.name,
  appOptionsProjectId: (app.options as { projectId?: string }).projectId ?? '(not set)',
});

const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

export { app, db, storage };
