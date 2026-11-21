# Second Brain Setup — Handoff

> **DELETE THIS FILE once the entire setup is complete.**

---

## What We're Building

```
Voice/Text (any device)
    → Obsidian vault (drafts/, journal/, Attachments/)
    → Syncthing syncs to homelab
    → Whisper auto-transcribes voice → saves as draft
    → AI pipeline indexes notes → semantic search + Q&A via Ollama/LiteLLM
    → Kopia backs up nightly to B2 + pendrive
```

---

## Vault Structure

```
vault/
├── drafts/              ← everything lands here (typing + transcribed voice)
├── journal/             ← dated daily notes
├── Attachments/         ← audio files, images, PDFs
└── old-2026-11-21/      ← migrated from existing iCloud "Brain dump" vault
```

---

## Infrastructure (Homelab)

| Component | What | Resource |
|-----------|------|----------|
| Syncthing | Syncs vault across all devices | ~64MB RAM |
| Whisper ASR | Transcribes audio → text | GPU (on-demand) |
| Transcription watcher | Watches `Attachments/`, calls Whisper, creates drafts | ~64MB RAM |
| Kopia (existing) | Add vault to nightly backup | No change to service, 2 lines added to cronjob |

---

## Sync Architecture

```
MacBook (Syncthing)
iPhone  (Möbius Sync)   ←→   Homelab Syncthing pod   ←→   vault on disk
iPad    (Möbius Sync)
```

No iCloud. No Apple ID dependency. Each device pairs directly with homelab via Device ID.

---

## Sessions

### Session 0 — Migrate off iCloud (~5 min)
**On iPhone:**
1. Open Obsidian → tap vault name (top left) → vault settings
2. Move "Brain dump" vault → **On My iPhone**
3. This becomes the `old-2026-11-21/` folder once synced

### Session 1 — Homelab (~30 min)
**SSH into homelab (`ssh hitesh@192.168.29.146`), then git push.**

Create vault directories:
```bash
mkdir -p /mnt/external/second-brain/vault/{drafts,journal,Attachments}
mkdir -p /mnt/external/second-brain/vault/old-2026-11-21
```

Files to create:

- `gitops/apps/syncthing.yaml`
- `gitops/manifests/syncthing/deployment.yaml`
- `gitops/manifests/ingress-routes/syncthing-route.yaml`
- `gitops/apps/whisper.yaml`
- `gitops/manifests/whisper/deployment.yaml`
- `gitops/apps/brain-watcher.yaml`
- `gitops/manifests/brain-watcher/deployment.yaml`

Files to modify:

- `gitops/manifests/kopia/cronjob.yaml` — add `kopia snapshot create /mnt/external/second-brain` to `backup_all()` (runs for both B2 and pendrive)

Verify:
```bash
kubectl get pods -n syncthing
kubectl get pods -n whisper
kubectl get pods -n brain-watcher
# Then open https://syncthing.lab.hiteshp.in
```

Configure Syncthing:
1. Open `https://syncthing.lab.hiteshp.in`
2. Remove the default folder
3. Add Folder → ID: `vault`, Path: `/vault`
4. Note your **Device ID** (Actions → Show ID) — needed for Sessions 2 and 3

### Session 2 — MacBook (~20 min)
```bash
brew install syncthing
brew services start syncthing
```
1. Open `http://localhost:8384`
2. Add Remote Device → paste homelab Device ID → name it `homelab`
3. Accept MacBook on homelab Syncthing UI
4. Share vault folder with MacBook → local path: `~/second-brain/vault`
5. Copy existing Obsidian notes into `~/second-brain/vault/old-2026-11-21/`
6. Install Obsidian → Open folder as vault → `~/second-brain/vault`

### Session 3 — iPhone + iPad (~15 min)
1. App Store → install **Möbius Sync**
2. Add homelab Device ID → accept on homelab Syncthing UI
3. Share vault folder → accept on Möbius Sync → pick local path
4. App Store → install **Obsidian**
5. Open Obsidian → Open folder as vault → pick the Möbius Sync folder (not iCloud)

### Session 4 — Quick Capture Shortcut (~15 min)

**Text capture (iOS Shortcut):**
1. Shortcuts app → New shortcut
2. Ask for Input — prompt: "Quick note"
3. Get Current Date — format: `yyyy-MM-dd`
4. Save File → vault/drafts/`[date]-quick.md`

**Voice capture (iOS Shortcut):**
1. Shortcuts app → New shortcut
2. Record Audio
3. Get Current Date — format: `yyyy-MM-dd`
4. Save File → vault/Attachments/`[date]-voice.m4a`
5. Syncthing syncs it → Whisper watcher transcribes → draft appears in `drafts/`

**MacBook voice capture:**
- Install Obsidian plugin: **Audio Recorder**
- Saves directly to `vault/Attachments/` → same Whisper pipeline picks it up

---

## Files to Create/Modify (Summary)

| File | Action |
|------|--------|
| `gitops/apps/syncthing.yaml` | Create |
| `gitops/manifests/syncthing/deployment.yaml` | Create |
| `gitops/manifests/ingress-routes/syncthing-route.yaml` | Create |
| `gitops/apps/whisper.yaml` | Create |
| `gitops/manifests/whisper/deployment.yaml` | Create |
| `gitops/apps/brain-watcher.yaml` | Create |
| `gitops/manifests/brain-watcher/deployment.yaml` | Create |
| `gitops/manifests/kopia/cronjob.yaml` | Add 2 lines to `backup_all()` |

---

## Phase 2 (Deferred)

- AI semantic search + Q&A (Qdrant + embedding pipeline + FastAPI query service)
- Browser extension for web clipping
- Daily digest / resurface old notes
- Knowledge graph visualization
