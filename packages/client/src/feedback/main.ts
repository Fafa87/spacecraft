import { mountFeedback } from './page.js';
import { PetitionStore } from './store.js';
import './feedback.css';

function firebaseCfg(): { apiKey: string; projectId: string } | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;
  const baseUrl = import.meta.env.VITE_FIRESTORE_URL?.trim() || undefined;
  return { apiKey, projectId, ...(baseUrl ? { baseUrl } : {}) };
}

const root = document.getElementById('feedback')!;
const cfg = firebaseCfg();
const store = cfg ? new PetitionStore(cfg) : null;
mountFeedback(root, store);
