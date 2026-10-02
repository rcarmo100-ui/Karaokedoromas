# KARAOKÊ DO ROMAS — ARCHITECTURE

## Overview

The Karaokê do Romas uses a **LOCAL-FIRST hybrid architecture**. The application works fully offline. Firebase is an optional sync/backup layer.

```
                    KARAOKÊ DO ROMAS
                           |
                      APP CORE
                           |
       +-------------------+-------------------+
       |                   |                   |
   Biblioteca           Player            Processamento
       |                   |                   |
   IndexedDB          Áudio local         Worker local
       |                                       |
       +-------------------+-------------------+
                           |
                      SYNC ENGINE
                           |
                  +--------+--------+
                  |                 |
               ONLINE            OFFLINE
                  |                 |
               Firebase       Continua local
                  |
              Firestore
              Storage
```

## PWA / Service Worker (v15.1)

File: `public/sw.js`
Registrar: `src/components/ServiceWorkerRegistrar.tsx`

Strategy:
- `_next/static/` assets → Cache-First (JS, CSS bundles)
- App pages and public assets → Network-First with cache fallback
- Firebase API calls → Network-Only (never cached)
- Offline fallback page: `public/offline.html`

Browser support:
- Chrome/Edge/Firefox: Full support
- Safari 16.4+: Full support (including iOS)
- Safari < 16.4: Service Workers work, push notifications limited
- Private/Incognito: Service Workers may be disabled

After first load, the app shell is cached. If internet is disconnected:
1. User opens app → Service Worker serves cached shell
2. Local library (IndexedDB) loads normally
3. Player works with local audio blobs
4. Queue works offline
5. Adding songs works (saves to IndexedDB, syncs later)

## Core Local Layer

### IndexedDB (src/lib/localDB.ts)

Stores:
- `songs` — LocalSong records with sync/processing status
- `audioBlobs` — Raw audio file data (ArrayBuffer)
- `syncQueue` — Pending sync operations
- `processingJobs` — Local processing job records
- `appSettings` — User preferences (sync enabled, storage limit)

Persistence: Data survives tab close, browser close, and offline periods.
Limit: Browser-managed (typically 50-80% of available disk space).

### Song Repository (src/lib/songRepository.ts)

Single access point for song data. Components MUST use this instead of accessing Firebase or IndexedDB directly.

Operations:
- `repositoryCreateSong()` — Creates song locally
- `repositorySaveAudioFile()` — Saves audio blob to IndexedDB
- `repositoryGetAudioUrl()` — Returns playable blob URL
- `repositoryGetAllSongs()` — Lists all local songs
- `repositoryMarkSynced()` — Links local song to cloud record
- `repositoryMarkSyncError()` — Records sync error (NEVER deletes local data)
- `repositoryDeleteSongLocally()` — Removes from local only
- `repositoryImportFromCloud()` — Imports cloud metadata to local

## Local Song Model (LocalSong)

```typescript
interface LocalSong {
  id: string;                    // local UUID
  title: string;
  artist: string;
  genre: string;
  duration?: string;
  notes?: string;
  youtubeUrl?: string;
  coverColor?: string;

  // Local file references
  localOriginalAudioKey?: string;
  localVocalsAudioKey?: string;
  localInstrumentalAudioKey?: string;
  localLyricsKey?: string;
  localCoverKey?: string;

  // Processing
  processingStatus: 'QUEUED' | 'PROCESSING' | 'DONE' | 'ERROR';
  processingError?: string;

  // Sync
  syncStatus: 'LOCAL_ONLY' | 'SYNC_PENDING' | 'SYNCED' | 'SYNC_ERROR';
  syncError?: string;
  cloudSongId?: string;
  cloudSyncEnabled: boolean;
  localOnly: boolean;

  createdAt: number;
  updatedAt: number;
}
```

## Connectivity Manager (src/lib/connectivityManager.ts)

- Monitors `navigator.onLine` and browser online/offline events
- States: `ONLINE` | `OFFLINE`
- `syncEnabled` is separate from connectivity (default: `false`)
- ONLINE does NOT mean sync is active

## Local Processing Queue (src/lib/localProcessingQueue.ts)

Steps:
1. `audio_preparation` — File stored locally ✅ IMPLEMENTED
2. `vocal_separation` — Requires ML model ⚠️ ARCHITECTURE READY, MODEL PENDING
3. `instrumental_generation` — Depends on vocal_separation ⚠️ PENDING
4. `lyrics_preparation` — LRC parser ⚠️ PARTIAL
5. `finalization` — ⚠️ PENDING

## Sync Engine (src/lib/syncEngine.ts)

- Sync is **DISABLED by default**
- User must explicitly enable sync AND confirm before upload
- `analyzePendingSync()` — Shows what would be synced (size, count)
- `executeSyncToCloud()` — Performs actual sync after user confirmation
- `pullSongsFromCloud()` — Imports cloud metadata to local
- CRITICAL: On sync error, local data is NEVER deleted

## Cloud Import Service (src/lib/cloudImport.ts) — v15.1

Handles explicit, user-selected import of songs from Firebase to local.

Functions:
- `listCloudSongsForImport()` — Lists Firestore songs with file availability info
- `importSongFromCloud()` — Downloads metadata + all available audio files
- `estimateImportBytes()` — Estimates download size for selected songs

What is imported per song:
- Metadata (title, artist, genre, etc.)
- `originalAudio` — downloaded from Storage if available
- `vocalsAudio` — downloaded from Storage if available
- `instrumentalAudio` — downloaded from Storage if available
- `lyrics` — downloaded from Storage if available

CRITICAL: Import is EXPLICIT and SELECTIVE. Never automatic.

## Player (src/app/karaoke-player-screen)

- Supports `?localId=` param for local songs
- Supports `?songId=` param for Firebase songs (backward compatible)
- Uses real HTMLAudioElement for local audio files
- Falls back to mock timer when no audio available

## Offline Mode

When offline:
- App opens normally (Service Worker serves cached shell)
- Local library works (IndexedDB)
- Player works with local audio
- Queue works
- Adding songs works (saves locally, syncs later)
- Firebase operations are skipped gracefully

## Online Mode

When online:
- All offline features work
- Firebase backup is available (if sync enabled)
- AddMusicForm saves locally first, then optionally to Firebase
- SyncEngine can push local songs to Firebase
- Cloud Import can pull songs from Firebase to local

## Sync Flow (Local → Cloud)

1. User opens Sync & Storage page
2. Enables sync toggle
3. Clicks "Sincronizar músicas locais"
4. System analyzes pending songs (shows size, count)
5. User reviews and confirms
6. System checks storage limit
7. If limit exceeded: shows warning with options
8. Upload proceeds song by song
9. On error: local data preserved, error recorded, retry available

## Import Flow (Cloud → Local) — v15.1

1. User opens Sync & Storage page
2. Clicks "Importar da Nuvem" section
3. System lists all Firestore songs with file availability
4. User selects individual songs to import
5. System shows estimated download size
6. User confirms
7. System downloads metadata + audio files from Storage
8. Files saved to IndexedDB
9. Song appears in local library, playable offline

## Sync Error Recovery — v15.1

When sync fails:
1. Local data is PRESERVED (never deleted)
2. `syncStatus` set to `SYNC_ERROR`
3. Error message stored in `syncError` field
4. Retry badge shown in SyncManagerPanel
5. User clicks "Tentar novamente" button
6. Only SYNC_ERROR songs are retried (not all songs)
7. No local data is recreated or overwritten

## Firebase (Preserved)

- Project: karaoke-9facd
- Firestore: songs collection, processingJobs subcollection
- Storage: audio/{songId}/original.mp3, vocals.mp3, instrumental.mp3
- Firebase is now OPTIONAL — app works without it

## Storage Safety

- User-configurable storage limit (default: 5 GB)
- This is an APPLICATION SAFETY LIMIT, not a financial limit
- Pre-sync size calculation
- Warning when upload would exceed limit
- Cost disclaimer shown (no fake estimates, no invented prices)
- "Delete from cloud" NEVER deletes local files

## Checkpoints

- CHECKPOINT_0_ESTADO_ATUAL_ESTAVEL — Initial state documented
- CHECKPOINT_1_CORE_LOCAL — IndexedDB + Repository + ConnectivityManager
- CHECKPOINT_2_PROCESSAMENTO_LOCAL — Processing queue architecture
- CHECKPOINT_3_PLAYER_LOCAL — Player with local audio support
- CHECKPOINT_4_SYNC_ENGINE — SyncEngine + SyncManagerPanel
- CHECKPOINT_5_CONTROLE_DE_CUSTOS — CloudStorageManager + safety limit
- CHECKPOINT_6_ARQUITETURA_HIBRIDA — Full hybrid architecture complete
- LOCAL_FIRST_V1 — Version 15 complete (preserved)
- LOCAL_FIRST_V1.1 — Version 15.1 complete (PWA + Cloud Import + Retry)
