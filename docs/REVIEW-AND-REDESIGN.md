# MyZikr — Senior Review & Redesign

**Prepared as:** tech-lead / product-owner teardown
**Date:** 2026-06-10
**Scope:** whole-app product review, bug audit, UI/UX redesign, and a deep redesign of **الحفظ (Hifz)** into a Tarteel-grade AI recitation engine.

> Method: 8 area code-reviews (each with file:line bug citations), 3 web-research teardowns (Tarteel, Quran-ASR tech, competitor UX), plus a direct read of the full memorization stack. Headline "data-loss / dead-feature" bugs were re-verified by hand.

---

## 0. TL;DR

MyZikr is **already a remarkably complete app** — prayer times, a real KFGQPC mushaf reader with audio, dhikr, fasting, qiyam, wird, targets, badges, a 9-page stats suite, Qibla, zakat, sadaqah, Hijri calendar, Asma, duaa, Android widgets, full-screen adhan alarms, cloud sync, and a voice recite-test. The **breadth is a genuine moat**. The problems are not "missing features" — they're:

1. **A cluster of silent data-loss and dead-feature bugs** that quietly break trust (backup loses your hifz progress; sign-in can wipe local data; badges never unlock; the wird never advances; prayer notifications stop after ~48h).
2. **An information architecture that has outgrown its navigation** — a 5-tab bar + a giant "المزيد" catalog, with no clear daily-loop spine.
3. **A الحفظ feature that is a *reveal-driver*, not a *recitation corrector*.** It leans on the Android system recognizer and a lenient skeleton-matcher, so it can't do what Tarteel does: follow-along highlighting, and real missed/wrong/extra-word mistake detection.

The redesign below keeps the breadth, fixes the trust bugs first, reorganizes the IA around the daily loop, applies a 2026 "premium-calm" visual system, and rebuilds Hifz as a proper streaming-ASR + alignment engine with a clear v1 → v2 path.

---

## 1. The product today — honest assessment

**What's genuinely strong**
- Authentic mushaf rendering (per-page V1 fonts, line auto-fit), offline downloads, tafsir (3 sources), word meanings — this is hard and it's done well.
- Offline-first prayer times via `adhan-js`; full-screen call-style adhan alarm; per-sound notification channels (a real Android-reliability investment most apps skip).
- A hand-built, dependency-light stats suite with a thoughtful "نبض العبادة" pulse score.
- Android home-screen widgets with a JS→native snapshot bridge.
- IME-safe Arabic inputs, in-house motion lib, quota-safe storage — evidence of a team that has already hit and solved real Android/WebView pitfalls.

**What undermines it**
- **Trust:** several silent data-loss paths (see §2). For an app people use *daily for worship*, "I lost my streak / my hifz progress" is fatal.
- **Coherence:** the daily worship loop is spread across Home tiles, module pages, targets, and stats with inconsistent "today" semantics and a few dead motivational mechanics (badges, freezes, wird cursor).
- **The headline feature (Hifz) under-delivers** vs the app it's being compared to (Tarteel).

---

## 2. Ship-blocker bugs (verified by hand)

These are the "fix before anything else" list — each is a silent correctness/data-loss failure a normal user hits.

| # | Bug | File | Effect |
|---|-----|------|--------|
| 1 | **Backup/restore silently omits 6 persisted stores** — `STORE_GETTERS` covers 12 of ~19 stores; missing `prayer-log`, **`memorization`**, `targets`, `custom-azkar`, `custom-reminders`, `dhikr-sessions`. | `services/BackupService.ts:37` | Restore on a new phone loses prayer history, **Quran memorization progress**, goals, and user-authored azkar/reminders — while the UI promises "صدّر كل ما يخصّك". |
| 2 | **Sign-in overwrites all local data, no merge / no confirm** — `reconcileOnLogin` pulls the cloud snapshot remote-wins and reloads; the documented `updated_at` last-write check is never actually read. | `services/cloudSyncService.ts:90` | A user with months of local data who signs into an account holding an old/empty snapshot loses everything instantly, no undo. |
| 3 | **Restore captures store actions *after* destroying them** — `setState(entry, true)` replaces state (drops action fns) *before* collecting fns. | `services/BackupService.ts:133` | For ~1.5s post-restore (UI interactive) every store has no actions; any tap/effect calling one throws. |
| 4 | **Badges never auto-unlock** — `evaluateBadges()` is defined but called from nowhere. | `services/BadgeEngine.ts:61` | No badge is ever earned; the gallery shows everything locked forever — an entire motivational system is dead. |
| 5 | **Daily wird never advances** — `advanceWirdCursor()` is defined but never called; `recordWirdAchievement` only stores the count. | `components/quran/util/wirdMath.ts:90` | Every day shows the *same* page/juz. The core "daily portion" premise is broken. |
| 6 | **Prayer notifications stop after ~48h** — only today+tomorrow are scheduled as one-shots, gated by a per-day key; no boot/periodic re-schedule. | `services/PrayerTimeNotificationScheduler.ts:62` | If the user doesn't open the app for ~2 days, adhan notifications stop entirely. |
| 7 | **No boot receiver** — `RECEIVE_BOOT_COMPLETED` declared, no `BootReceiver` shipped. | `android/.../AndroidManifest.xml:114` | Native full-screen adhan alarms and the widget rollover alarm die on reboot until the app is reopened. |
| 8 | **Weekly fasting reminders fire once, never repeat** — `repeats` is only set for `'daily'`; `'weekly'` falls through to a one-shot. | `services/notifications/CapacitorNotificationService.ts:122` | Monday/Thursday fasting reminders fire once and then never recur. |
| 9 | **Qibla pointer double-subtracts heading** — needle animates to `(bearing − heading) + (−heading)` = `bearing − 2·heading`. | `pages/QiblaPage.tsx:104` | The Kaaba arrow points the wrong way whenever a live compass heading exists — the core Qibla feature is wrong. |
| 10 | **Android `deviceorientation.alpha` treated as true-north** — relative-frame heading used unconditionally, no declination. | `hooks/useDeviceHeading.ts:49` | Qibla points to an arbitrary direction on most Android WebViews. |
| 11 | **Mushaf swipe direction inverted for RTL** — code advances on swipe-right; comment + keyboard map say swipe-left = next. | `pages/quran/QuranReaderPage.tsx:258` | Natural RTL page-turn goes backward, contradicting the on-screen hint. |
| 12 | **Period stats include future days** — range end never clamped to today; averages divide by all day-keys. | `pages/StatsPage.tsx:363` (`statsService.ts:74`) | On the default "شهري", a perfect user shows ~33% consistency mid-month; trends crash to zero across future days. |
| 13 | **Prayer calendar heatmap misaligns** — cells come from sparse logged days, but the heatmap assumes dense consecutive dates. | `pages/stats/StatsPrayersPage.tsx:166` | Every unlogged day shifts later cells into the wrong weekday — the prayer calendar shows prayers on wrong days. |
| 14 | **Battery-optimization permission blocks Play upload** — `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` declared + requested unconditionally. | `android/.../AndroidManifest.xml:119` | Play Console rejects the listing; sideload-only per your own memory note. |
| 15 | **Surah download shows success toast on failure** — `offlineService` swallows errors and resolves; `.then()` always toasts success. | `pages/quran/DownloadsPage.tsx:45` | Offline users are told a surah downloaded when nothing was saved. |

**Audio (Quran reader) — high severity, not strictly silent**
- **No MediaSession / audio-focus / background handling** (`services/AudioController.ts:64`): recitation dies when the WebView backgrounds, no lock-screen controls, no resume after a call/headset unplug. For a Quran app this is a core-feature failure.
- **Audio errors silently `stop()`** (`AudioController.ts:352`): a 404/network error empties the queue and the player bar vanishes with no feedback.

---

## 3. Full bug ledger by area

### Settings / Backup / Cloud sync
- (See §2 #1–3.) Plus: **sign-out doesn't push pending changes, doesn't clear local data, and pull never deletes stale keys** (`authStore.ts:115`, `cloudSyncService.ts:73`) → account-switch on a shared device mixes user A's data into user B (privacy leak + corruption). **Double `reconcileOnLogin`** (direct call + `SIGNED_IN` listener) and web tab-refocus re-firing `SIGNED_IN` cause surprise pull+reload (`authStore.ts:100`). **Cloud snapshot uploads the ~3MB Quran API cache + downloads registry** (`cloudSyncService.ts:27`) → megabytes over mobile data, quota blowouts on pull, and "downloaded ✓" surahs that don't exist on the other device. **Restore bypasses persist migrations** (`BackupService.ts:117`) and stamps current version, so old backups can never be repaired. **Module/azkar reminders never rescheduled after restore/pull** — `notificationStore.scheduleAll()` has no caller (`notificationStore.ts:197`).

### Stats
- Period range includes future days (§2 #12); calendar heatmap misaligns (§2 #13). Plus: **period selection resets between landing and sub-pages** (each route mounts its own `StatsProvider`, `App.tsx:331`); **sticky PeriodSelector slides under the TopAppBar** on sub-pages (`PeriodSelector.tsx:25`); **Quran "موضع القراءة" = surah/114** so deep-in-Baqarah reads "2%" (`StatsQuranPage.tsx:121`); **"متوسط يومي" sums pages + ayat as one unit** (`StatsQuranPage.tsx:115`); **history buckets UTC timestamps by UTC date** so post-midnight events show on the previous day (`StatsHistoryPage.tsx:219`); all 8 portal cards reuse the *same* global sparkline (misinforms drill-down); heatmap day-detail unreachable on touch (uses `title` attr); dhikr "بلوغ الأهداف" compares lifetime count to a per-session target (bars pinned 100%).

### Daily worship modules
- Badges dead (§2 #4); wird cursor dead (§2 #5). Plus: **Duaa Journal never calls `markModuleComplete('duaa')`** (`DuaaJournalModule.tsx:44`) — its ring is permanently 0% yet `duaa` counts toward streaks/badges; **streak-freeze API entirely dead** (`progressStore.ts:200`); **PrayersModule writes yesterday's key if mounted across midnight** (`PrayersModule.tsx:38`); **`computeStreak` two-day grace overstates active streaks** (`progressStore.ts:142`); **day rollover is device-local only** (no Maghrib/Islamic-day, clock-change rewrites which day a log lands on); **qiyam rakaat/witr selection is decorative** (only a boolean is saved); **recurring target deadlines drift later each period** (`targetsStore.ts:143`).

### Prayer / notifications
- §2 #6–8, #14. Plus: **DST/clock-change drift** in queued one-shot alarms (`PrayerTimeNotificationScheduler.ts:78`); **`PermissionService.requestExactAlarm` is a near no-op** on Capacitor 7+ (`PermissionService.ts:67`); **widget data goes stale** when the app isn't opened (30-min re-render uses the same old JSON; no native prayer-time recompute) (`widgetBridge.ts:150`); **full-screen alarm always rings the full 5 min** regardless of chosen duration (`FullScreenAlarmActivity.java:93`); aggregate pending-notification count (5 prayers × 3 × 2 days + habits + azkar + fasting + special) is creeping toward Android's per-app limit — needs an audit/prune.

### Quran reader
- §2 #11, #15, audio items above. Plus: **`changeQari` mid-range leaves a stale preloaded track** → one verse plays the old reciter (`AudioController.ts:213`); **text-mode tajweed branch ignores IndoPak + tashkeel toggles** (`TextPageView.tsx:116`); **`TextPageView` retry button doesn't refetch** (`TextPageView.tsx:137`); **resume position hardcodes `ayah:1`** (`QuranReaderPage.tsx:166`); reciter labels in the player bar don't match the picker (raw ids shown); auto-download-on-view silently consumes data/storage with no opt-out.

### Misc features
- §2 #9–10. Plus: **`deviceorientationabsolute` + `deviceorientation` both bound to one handler** → relative overwrites absolute (`useDeviceHeading.ts:62`); **Hijri date has no adjustment offset**, can be ±1 day with no fix, and feeds Ramadan detection (`HijriService.ts:56`, `useRamadanState.ts:35`); **zakat nisab uses `min(gold,silver)` including a 0-ed price** → zakat charged on any wealth if a price is cleared (`ZakatService.ts:51`); **Ramadan suhoor/iftar countdown never rolls to tomorrow** after Maghrib (`useRamadanState.ts:55`); **Mosques/Qibla EmptyState CTA reads stale `geo.coords`** so the first tap does nothing (`MosquesPage.tsx:70`); tasbih pins lost on reload; Asma flashcards don't mark "studied".

### Shell / Home / Onboarding
- **Dark-mode flash on every cold start** — theme applied only in a React effect, no pre-paint inline script (`index.html`, `App.tsx:443`). **StatusBar never re-syncs to dark theme** (`main.tsx:50`) → light status bar over dark UI. **Onboarding advances with no validation** — can finish with empty location → Home shows `--:--` with no explanation (`OnboardingPage.tsx:47`). Features-hub search is substring-only (no alef/hamza normalization). Greeting fallback "يا أخي" assumes male.

---

## 4. Redesign — information architecture & visual system

### 4.1 The IA problem
Today: **Home · Quran · Adhkar · Targets · More(catalog)** + a Settings gear, with the daily worship loop scattered. "More" is a 20+ item catalog — a junk drawer. There is no single surface that answers *"what does Allah want from me right now, and how am I doing today?"*

### 4.2 Proposed 5-tab IA (worship-loop spine)

```
┌─ اليوم (Today) ─ Quran ─ الحفظ (Hifz) ─ الإحصاء (Stats) ─ المزيد (More) ─┐
```

- **اليوم / Today** (was Home) — the daily cockpit. One focal element: **next prayer countdown**, then **"وردك اليوم"** (a single card combining prayers ring + dhikr + wird + fasting/qiyam as a checklist), then verse/hadith of the day. Everything else demoted.
- **Quran** — reader, landing, bookmarks, downloads, audio. Unchanged in scope, fixed in audio/swipe.
- **⭐ الحفظ / Hifz** — promoted to a **top-level tab** (it's the differentiator and your focus). Its own home: "due for review today", hifz map of the whole Quran, start/continue a session, mistakes to review. (Full design in §6.)
- **الإحصاء / Stats** — one hoisted `StatsProvider`, persisted period, clamped-to-today numbers.
- **المزيد / More** — *organized* into clear groups (Tools: Qibla, Mosques, Zakat, Sadaqah, Hijri; Knowledge: Asma, Hadith, Duaa, Adhkar), not a flat list; with normalized Arabic search.

Settings moves to a top-bar avatar/gear on Today (standard pattern), with **a single "بياناتك والمزامنة" hub** merging cloud + file backup (today they're in two unrelated places).

### 4.3 Visual system — "premium calm" (2026 benchmark)
The reviewed market leaders (Pillars, Quran.com, Dhikr&Dua) win on **restraint**: generous whitespace, one focal element per screen, soft dusk/teal palettes, subtle Islamic geometry instead of mosque clipart, an authentic mushaf, and "satisfying micro-interactions." Concretely:

- **Type:** keep Uthmani/Amiri for sacred text; pair UI with a single clean Arabic sans (Tajawal/IBM Plex Arabic) at a tighter type scale. Numbers always Arabic-Indic (fix the `ConsistencyScore`/`StreakBadge` Western-digit leaks).
- **Color:** one teal→gold gradient accent already exists — lean into a calmer, lower-chroma "dawn/dusk" palette; ensure dark mode is first-class (pre-paint theme script + StatusBar sync).
- **Motion:** count-up tasbih, streak-flame tick, page-turn, completion ritual — already partly present; make `layoutId` nav-pill actually slide (today it's a no-op).
- **Cards:** reduce the number of competing cards per screen; promote one "hero" per page. The stats landing's 12 mixed KPI tiles → a tighter, period-consistent set.
- **System integration as a feature:** the widgets + reliability onboarding are a real differentiator — surface "إشعارات موثوقة" as a selling point (Athan's only moat; Muslim Pro's biggest complaint is dying notifications).

---

## 5. Section-by-section UX upgrades (highest-value)

**Today / Home**
- Add a **"تابِع من حيث توقفت"** card (last surah / last dhikr) — strings already exist.
- Today-progress ring + streak on the hero (retention driver).
- Real empty/error state when prayer times fail, with a "set location" CTA inside the hero.
- Personalize greeting by name + gender (drop the male default).

**Quran**
- Fix swipe direction; add edge tap-zones in single-page mode.
- **MediaSession + audio focus** so recitation survives backgrounding, with lock-screen controls — the single biggest reader upgrade.
- Toast on audio load failure instead of silently stopping.
- Opt-in toggle for auto-download-on-view; show MB estimates + Wi-Fi-only for the 604-page job.

**Stats**
- Clamp ranges to today; **fair deltas** ("better than the same day last month").
- Hoist one `StatsProvider`; persist period across the whole section.
- Per-domain sparklines on portal cards (not one shared series).
- Tap-through day drill-down (heatmap cell → day sheet).
- **Khatma ETA** ("بهذا المعدّل ستختم خلال 94 يومًا") and a **shareable weekly report card** (image → WhatsApp) — cheap, big organic-growth lever for this audience.

**Daily modules**
- Wire `evaluateBadges()` into `markModuleComplete`; wire `advanceWirdCursor`; route Duaa through `progressStore` (or drop it from `MODULE_IDS`).
- Centralize one `todayKey()` and make modules reactive to date change (subscribe to a midnight/visibility tick).
- Rewrite `computeStreak` as a single backward walk (+ unit tests); then actually use the freeze tokens (or delete them).

**Notifications / reliability**
- Add a `BootReceiver` + a daily `WorkManager`/`AlarmManager` job that recomputes & re-arms prayer + full-screen alarms (fixes reboot, 48h-exhaustion, and DST drift at once).
- Move prayer-time computation native so widgets/alarms stay fresh without the JS app running.
- Remove the battery-optimization permission for the Play build.

**Settings / data**
- **First-sign-in conflict chooser** with previews + an automatic local safety snapshot before any pull.
- Confirm dialog on restore (show backup date + included sections); auto safety-export first.
- Merge-based cloud sync (per-store `updated_at`, additive merge for counters/logs) — marketable "never lose a hasanah."

---

## 6. ⭐ الحفظ / Hifz 2.0 — Tarteel-grade recitation engine

> This is the centerpiece. The goal: make الحفظ feel like Tarteel — **follow-along highlighting** + **real missed/wrong/extra-word mistake detection** — *without the restrictions of the current flow*, and on a Capacitor/Android budget.

### 6.1 What the current Hifz actually is (and why it falls short)

**Today's flow** (`MemorizationPage.tsx`, `useReciteTester.ts`, `arabicMatch.ts`, `speechRecognition.ts`, `SpeechStreamPlugin.java`, `memorizationStore.ts`):
- Pick a surah → render its mushaf page with all words **hidden**; session always starts fully masked.
- Voice "تسميع": native Android `SpeechRecognizer` (ar-SA, FREE_FORM, partial results), **re-armed every utterance** (~every 900 ms of silence). JS tokenizes the transcript, normalizes both sides to a **bare-letter skeleton** (strip tashkeel, fold alef/hamza/ta-marbuta), and matches the next expected word with a 6-word look-ahead that can only skip **short** function words. A match reveals the word; the pointer advances.
- "Mistake" = only after **≥3 consecutive clearly-wrong long (≥4-char) words**, debounced 2.5 s → a buzz + red full-page flash. There is **no per-word red marking**.
- Progress is **not** auto-saved; an explicit "حفظ التقدم" stores one `{page, count}` bookmark per surah.

**Why it under-delivers (the honest list):**
1. **It's a reveal-driver, not a corrector.** It can't tell you *which* word you got wrong, or that you *skipped* or *added* a word — it just refuses to advance, or buzzes after 3 wrong words. Tarteel's whole value is "your word turned red."
2. **No follow-along mode.** Tarteel's *free* core is: text stays visible, words highlight green as you recite. Here the only mode is hide-everything — strictly harder and more restrictive.
3. **Accuracy is capped by the generic Android recognizer.** ar-SA ASR has no Quranic vocabulary and no tashkeel, so the skeleton-matcher *has* to be extremely lenient — which means it also can't catch real mistakes. It's a fundamental ceiling, not a tuning problem.
4. **Forward-only, tiny window, no recovery.** A single garbled long word can stall; there's no global re-alignment if the reciter jumps or the ASR drops a phrase.
5. **Re-arm churn drops audio.** Destroying/recreating the recognizer every utterance loses words spoken in the ~80–120 ms gap and burns battery; the silence windows force unnatural pauses.
6. **Restrictive scope.** One surah at a time, page-by-page, in reading order, from the surah's first word on the page. No arbitrary ayah range ("آخر ١٠ آيات من البقرة"), no cross-surah, no "juz 30" set.
7. **No memory of memorization.** No SRS / "due today" queue, no per-word weakness history, no hifz map of the whole Quran, no mistake heatmap — `memorizationStore` is a single bookmark.
8. **The beep-mute hack is risky.** `SpeechStreamPlugin` mutes MUSIC/SYSTEM/NOTIFICATION/RING for the whole session; a crash before `stop()` can leave streams muted, and some streams need DND access.

### 6.2 Target UX (what we're building)

Three modes, picked per session, all sharing one engine:

**A. وضع المتابعة (Follow-along) — free, the on-ramp**
- Text stays **fully visible**. As you recite, each word lights **green** the instant it's matched; a soft pointer underline sits on the next expected word; the page auto-scrolls to keep it centered.
- Mistakes are highlighted but **forgiving** — this is reading practice, not a test. No hiding, no buzz.
- This is the Tarteel free-tier hook and removes the current "everything is hidden and hard" restriction.

**B. وضع التسميع (Memorization test) — hidden text + real mistake detection**
- Page starts hidden (or "faded" — keep the existing toggle). Recite from memory; correct words reveal.
- **Real mistake marking**, Tarteel-style:
  - **Wrong word** (substitution) → the expected word reveals in **red** with a dotted underline; clears when you self-correct, stays red as a session record.
  - **Skipped word** (you jumped ahead) → the skipped word(s) reveal in **amber**.
  - **Extra word** (you added something not in the text) → a small inline "＋" marker; doesn't block progress.
- **Peek** briefly reveals the next word/line — and a peek is **logged as a mistake** (Tarteel's exact mechanic) so the SRS knows it was hard.
- Gentle haptic on a confirmed mistake (keep `errorBuzz`), but **per-word**, not a full-page flash.

**C. ملخّص الجلسة (Session summary + review)**
- After a session: accuracy %, words recited, a list of mistakes (tap a mistake → see expected vs heard, jump to the ayah, optionally hear the correct recitation from the existing audio engine).
- **SRS scheduling:** each reviewed ayah/page gets a next-due date (SM-2-lite). The Hifz tab shows **"مراجعة اليوم" (due today)**.
- **Mistake heatmap** on the hifz map: ayat colored by historical error frequency (red→green), like Tarteel's "Historical Mistakes."

**Remove these current restrictions:** allow an **arbitrary ayah range** and **cross-page/cross-surah sets** (juz, hizb, custom range); allow starting mid-ayah; don't force the surah's first word; auto-save session state (the explicit "حفظ التقدم" becomes a fallback, not the only path).

### 6.3 Engine architecture

```
mic ─▶ [native audio capture] ─▶ VAD ─▶ ASR (streaming) ─▶ partial transcript
                                                              │
                                              ┌───────────────▼────────────────┐
                                              │  WebView JS (the brain)         │
                                              │  normalize(Uthmani→skeleton)    │
                                              │  align(transcript ↔ expected)   │  ← Needleman–Wunsch
                                              │  classify(missed/wrong/extra)   │     over a sliding window
                                              │  debounce + emit UI events      │
                                              └───────────────┬────────────────┘
                                                  reveal / green / red / amber / pointer-move
```

- **Audio capture + VAD + ASR run native** (a Capacitor plugin emitting `result` events — exactly your existing `SpeechStream` event contract). **The matcher/alignment runs in WebView JS** (pure TypeScript, reuses your masked-word UI). Keeping the engine boundary identical to today means the JS UI barely changes between v1 and v2 — you only swap the audio→text source.
- **Message protocol** (unchanged from today, extended): native → JS `{ text, isFinal, tStart?, tEnd?, confidence? }`. Timestamps/confidence are optional and only present with the v2 CTC ASR; the matcher degrades gracefully without them.
- **Latency target:** Tarteel's internal budget is **<300 ms** word-to-feedback. v1 (system recognizer) realistically lands at partial-result cadence (~300–800 ms). v2 (on-device CTC, VAD-chunked at 1–2 s) targets ~1 s but with far higher accuracy.

### 6.4 Tech-choice matrix

| Option | Quranic accuracy | Latency | Offline | Cost | APK/download | Verdict |
|---|---|---|---|---|---|---|
| **Android system `SpeechRecognizer`** (current) | Low (generic ar-SA, no tashkeel) | Good (live partials) | No (Google) | Free | 0 MB | **v1 source** — keep it, add a better matcher |
| **Cloud streaming** (ElevenLabs Scribe v2 RT ~$0.005/min; Soniox; Munsit) | Med–High (generic Arabic, no tashkeel) | ~150–300 ms | No | ~$2–8/mo per 15-min/day user | 0 MB | **v1 fallback / premium** for bad OEM recognizers |
| **On-device NVIDIA FastConformer-AR (CTC) ONNX, int8 ~130 MB** | High, **diacritized**, frame timings | ~1 s (VAD-chunked) | **Yes** | Free after download | ~130 MB post-install download | **v2 recommendation** |
| On-device whisper-tiny-ar-quran q5 (~40 MB) | Med-High, diacritized | 1–3 s (whisper is non-streaming) | Yes | Free | ~40 MB | low-end-device fallback |
| Vosk Arabic (mgb2 ~318 MB) | Low, no tashkeel | — | Yes | Free | 318 MB | reject |

**v1 recommendation (1–2 weeks):** keep `SpeechStreamPlugin` as the audio→text source; **invest in the matcher** (next section); add an optional cloud-ASR toggle for devices whose recognizer is weak. Accept v1 limits (word-level only, no tashkeel mistakes).

**v2 recommendation:** ship the **FastConformer-AR CTC ONNX** as a **post-install download** (you already do post-install downloads for mushaf/fonts), run it via a thin Capacitor plugin around **ONNX Runtime Android** (or `sherpa-onnx`'s NeMo-CTC runner), VAD-chunked, streaming partial tokens **+ frame timestamps**. Because output is diacritized, you also unlock **tashkeel-level mistake detection** ("wrong harakah"). Same event contract → the JS UI is unchanged.

**Reference projects to lift from** (all surfaced in research, mostly MIT/Apache):
- `yayaiu6/Real-Time-Quran-recitation-tracker-System` — a complete follow-along aligner (windowed search + Needleman–Wunsch + skip detection). **Port this to TS for v1.**
- `yazinsai/offline-tarteel` — FastConformer ONNX in the browser via onnxruntime-web (proves the v2 WASM path).
- `yazinsai/quran-validator` — Uthmani/Imlaei normalization + multi-tier fuzzy matching.
- **QUL (qul.tarteel.ai)** — Uthmani + Imlaei **word-level** scripts and word-by-word timing segments (open) — your normalization map and follow-along timing for free.
- `cpfair/quran-align` — precomputed word-level audio timestamps (CC-BY-4.0) for highlight-during-playback.

### 6.5 The matcher (the part that actually makes it feel like Tarteel)

This is where v1 gets most of its value *today*, with the existing recognizer:

1. **Normalize both sides to a skeleton** (you already do this in `arabicMatch.ts`): strip tashkeel + waqf marks + Uthmani quirks (dagger alef, alef-wasla, hamza variants); fold alef/ya/ta-marbuta. **Match on skeleton, display Uthmani.** Build the reference skeleton from QUL word tables once, offline.
2. **Sliding-window alignment instead of forward-only single-word matching.** Maintain a pointer; search a window of **±N words (e.g. ±15)** around it. Run **Needleman–Wunsch** between the incoming transcript tokens and the expected window, with costs: match 0, substitution 1, gap (skip/insert) 1, **short-function-word gap 0.3** (cheap to skip — your existing instinct, generalized). This gives you, per spoken word, exactly one of: **match / wrong (substitution) / skipped (gap in hypothesis) / extra (gap in reference)**.
3. **Two pointer modes** (from the reference tracker): **tracking** (normal, small window) and **search/recovery** (after K consecutive low-confidence alignments, widen to the whole page/surah to re-find where they are — fixes the "stall" problem).
4. **Debounce mistakes by confirmation:** only *commit* a mistake (turn a word red) once the pointer has advanced **≥2 words past it** — because partial transcripts retract and the ASR revises. This kills false positives at speed (Tarteel's #1 complaint).
5. **Confidence gating (v2):** with CTC frame confidences, suppress mistakes on low-confidence audio (mumbling, noise) instead of flagging them — another false-positive killer.
6. **Tashkeel layer (v2 only):** when the ASR output is diacritized, additionally compare harakat against the Uthmani text for "wrong harakah" feedback — gated behind a toggle (Tarteel makes it optional).

**Fix the re-arm churn now (v0.5):** raise the silence windows / keep a single session where possible, and replace the global stream-mute hack with muting only on the recognizer's audio cue (or accept the beep on devices where muting needs DND) — and guarantee `unmute` in a `finally`/`onDestroy` path so a crash can't leave the device muted.

### 6.6 Data model changes (`memorizationStore`)

Replace the single-bookmark model with:

```ts
// per memorization unit (ayah-range or page)
interface HifzItem {
  id: string;                 // e.g. "2:255" or "page:50"
  range: { surah: number; from: number; to: number } | { page: number };
  strength: number;           // 0..1 SM-2-lite ease
  dueAt: number;              // epoch ms — drives "مراجعة اليوم"
  lastReviewedAt: number;
  reps: number;
}
interface WordMistake {
  wordKey: string;            // "2:255:7"
  type: 'wrong' | 'missed' | 'extra' | 'peek' | 'tashkeel';
  count: number;              // frequency → heatmap color
  lastAt: number;
}
interface HifzSession {
  id: string; startedAt: number; endedAt: number;
  itemId: string; mode: 'follow' | 'test';
  wordsTotal: number; wordsCorrect: number;
  mistakes: WordMistake[];
}
interface MemorizationState {
  items: Record<string, HifzItem>;
  sessions: HifzSession[];           // cap/rotate to keep storage bounded
  mistakeHistory: Record<string, WordMistake>;  // by wordKey, for the heatmap
}
```

…and **add all of these to `BackupService.STORE_GETTERS`** (today even the existing bookmark isn't backed up — §2 #1).

### 6.7 Phased delivery

- **v0.5 — quick wins on the current recognizer (2–4 dev-days):** add **follow-along mode** (text visible, green-on-match) using the existing recognizer + matcher; per-word red marking via the existing wrong-word detection (lower the 3-word gate to a confirmed single substitution with the 2-word debounce); fix the re-arm/mute risks; allow an arbitrary ayah range; auto-save session state.
- **v1 — proper matcher + SRS (1.5–2.5 dev-weeks):** port the Needleman–Wunsch sliding-window aligner (tracking/search modes, missed/wrong/extra classification, debounce); session summary + mistake review (reuse the audio engine for "hear it correct"); SM-2-lite SRS + "مراجعة اليوم" on the Hifz tab; mistake heatmap; optional cloud-ASR toggle for weak devices. Backup/restore includes hifz.
- **v2 — on-device Quranic ASR (3–5 dev-weeks + model work):** Capacitor ONNX-Runtime plugin running FastConformer-AR (int8, post-install download), VAD-chunked CTC with timestamps; same JS event contract; unlock tashkeel-level mistakes + confidence gating. Optional LoRA fine-tune on EveryAyah + the Tarteel crowd dataset if real-user accuracy disappoints; distill to whisper-tiny-q5 for low-end fallback.

---

## 7. New features & bigger picture

Opportunities the research says an indie app can win on (gaps the incumbents leave open):

1. **Hifz as the flagship** (above) — the clearest differentiator vs every prayer-times app, and the thing Tarteel paywalls hardest. A *generous free* follow-along + word-level mistakes undercuts Tarteel's ~$100/yr.
2. **Social Khatma circles, done beautifully** — group khatma with juz auto-split + live family/halaqah progress exists only in tiny utility apps; no polished modern app owns it. Your cloud-sync + targets infra is most of the way there.
3. **"Reliable adhan" as a marketed feature** — your full-screen alarm + reliability onboarding + widgets already beat Muslim Pro's dying notifications and Athan's ads. Make it a headline once §2 #6–8 are fixed.
4. **Mercy-driven retention** (Habl's "I don't feel like praying" gentle re-entry, streak freezes, qaza recovery) — barely explored; fits an ibadah app's tone far better than guilt streaks. You already have freeze tokens — *wire them up*.
5. **Shareable report cards & Khatma ETA** — organic-growth levers for a WhatsApp-heavy audience.
6. **Hijri-aware everything** — white-days fasting markers, Ramadan/Dhul-Hijjah overlays on heatmaps, Hijri labels — a differentiator no generic habit app has (after you add the Hijri offset fix, §2-area Misc).
7. **Auto cloud backups to Google Drive AppData** (you already have Google sign-in) — one-tap restore on reinstall is a huge safety net and directly answers the trust gap.

---

## 8. Monetization & positioning

The research is blunt about anti-patterns: **don't paywall the act of worship, don't run ads on worship surfaces, don't bloat into a super-app.** What works:

- **Generous free core:** reader, prayer times, follow-along Hifz, basic stats, streaks — all free, ad-free. This is now table stakes (Quran.com is free; Pillars is free).
- **Premium ("MyZikr+", ~$3–5/mo, lifetime option):** on-device/cloud high-accuracy Hifz mistake detection + tashkeel, advanced analytics & report cards, auto cloud backups, family Khatma circles, custom adhan packs. Mirror Tarteel's **pay-what-you-can "Alim" tier** — it earns enormous goodwill in this audience.
- **Lead with privacy** (Pillars' moat): "no account required, your data stays yours, optional encrypted sync." Post-Muslim-Pro-scandal this is a real differentiator.

---

## 9. Prioritized roadmap

**Phase 0 — Trust (must ship first, ~1 week)**
Fix §2 #1–3 (backup/restore + sign-in data loss), #4–5 (badges + wird dead), #6–8 (notification reliability), #14 (Play-blocking permission), #9–11 (Qibla + swipe). These are silent failures eroding daily-use trust.

**Phase 1 — Coherence & polish (~1–2 weeks)**
IA reorg (§4.2), Today cockpit, stats clamp+hoist (§5), dark-mode flash + StatusBar, MediaSession audio, settings data hub. Visual-system pass (§4.3).

**Phase 2 — Hifz 2.0 v0.5 → v1 (§6.7, ~3–4 weeks)**
Follow-along mode, real matcher, SRS, mistake review, hifz tab.

**Phase 3 — Differentiators (~ongoing)**
On-device Quranic ASR (v2), Khatma circles, report cards, auto Drive backups, mercy mechanics, monetization.

---

### Appendix — research sources
Full source lists (Tarteel teardown, Quran-ASR options, competitor UX) are in the salvaged research JSON under
`…/workflows/salvage/research-{tarteel,asr-tech,competitors}.json`. Key anchors: Tarteel Help Center + NVIDIA/Zeet case studies (engine + UX), Hugging Face `tarteel-ai/*` + NVIDIA FastConformer-AR + `yayaiu6`/`yazinsai`/`cpfair` repos + QUL (the build path), FivePrayer/islamtics/QuranicMA 2026 round-ups (the visual + monetization benchmark).
