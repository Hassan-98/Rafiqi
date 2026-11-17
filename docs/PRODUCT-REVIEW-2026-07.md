# MyZikr — Product Review & Redesign 2.0

**Prepared as:** senior product designer / product owner, pre-release teardown
**Date:** 2026-07-02
**Scope:** whole-product review (mobile + desktop), UX audit, bug hunt, complete UI-rebuild spec, feature redesigns, prioritized roadmap.
**Method:** 6 parallel area code-audits (shell/nav/home/onboarding · prayer+notifications · adhkar/wird/content · Quran+Hifz · stats/badges · settings/sync/design-system), each with file:line citations; the highest-impact claims re-verified by hand. Builds on — and verifies — `docs/REVIEW-AND-REDESIGN.md` (2026-06-10).

---

## 0. TL;DR

Since June, the team shipped the hard part: **Hifz 2.0 v1 is real** (windowed aligner with wrong/skipped/extra/peek classification, follow-along mode, SM-2-lite SRS, session summaries, desktop Whisper ASR), and the Phase-0 trust fixes landed (backup stores, merge-ish cloud sync, wird cursor, qibla math, stats clamping). The app's breadth and its Android-reliability engineering remain a genuine moat.

**What still blocks a premium release** falls into four buckets:

1. **Religious-correctness bugs** — the most dangerous class for this product. Prayer notifications keep firing at the *old city's times* after the user travels or changes calculation method; a user who types their city (instead of GPS) silently gets **no prayer times at all**; every archived hadith is stamped **صحيح** regardless of its real grade; zakat is computed from **hardcoded 2023-era gold/silver prices**; the Ramadan widget's juz ring renders **100% at zero progress** and taraweeh/juz logging has **no UI at all**.
2. **A motivation system that is half theater.** Streak freezes have prominent UI but are never awarded, never spent, and never consulted; badge titles promise "consecutive worship days" but unlock on `Math.max` across modules; "skip all adhkar" counts as completing them; hifz sessions don't advance the daily loop; and multiple built-and-never-rendered motivational hooks (comeback detection, trend direction, encouraging copy) sit dead in the code.
3. **The IA never got the June reorg.** Six tabs with no Stats tab, Settings exposed three times, a junk-drawer المزيد, duplicate destinations on Home, two different badge screens, and most of the app (all full-screen pages) having *no navigation at all* on desktop.
4. **The design system exists on paper only.** Spacing/type/z-index/motion tokens are defined and ignored; hardcoded hexes bypass the palette; `layoutId` and `drag` silently no-op (so the nav pill doesn't slide and sheets can't be swiped away); "reduce motion" doesn't actually stop the motion library; pinch-zoom is disabled app-wide.

The good news: almost everything below is **wiring, not construction**. The primitives — tokens, SRS, freeze tokens, reactivation detection, reliability checklist, widgets — already exist. This document specifies how to connect them into a coherent, calm, premium product.

---

## 1. What shipped since June (verified)

| June item | Status |
|---|---|
| Backup covers all stores (memorization, targets…) | ✅ Done (`BackupService.ts` v3 envelope, 18 stores) |
| Cloud sync no longer blind-overwrites | ✅ Mostly (3-way diff + safety snapshot) — but see §2.4 |
| Wird cursor advances daily | ✅ Done (`rolloverWird()` at boot + card mount) |
| Badges auto-evaluate | ✅ Wired in `main.tsx` — but award logic is wrong, §2.6 |
| Qibla double-subtract, swipe direction, stats future-days, download toast | ✅ Done |
| **Hifz 2.0 v1** (aligner, follow-along, SRS, summary) | ✅ Shipped — the flagship works |
| On-device Quranic ASR | ◐ Desktop only (Whisper ONNX); Android reverted to system recognizer + biasing strings (deliberate, 2026-06-11) |
| MediaSession / audio focus | ❌ Not done — recitation still dies on backgrounding |
| Notification reliability (BootReceiver, re-arm, DST) | ❌ Not done — queue still drains after ~2 days unopened |
| IA reorg (Today / Quran / Hifz / Stats / More) | ❌ Not done |
| Visual system pass | ◐ Tokens defined in `index.css`, never enforced |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` removal for Play | ❌ Still declared |

---

## 2. Release blockers (P0) — fix before any visual work

Ordered by user harm. Each of these silently betrays trust in an app people use *for worship*.

### 2.1 Prayer times & notifications

| # | Bug | Where | Impact / fix |
|---|-----|-------|--------------|
| 1 | **Location/method/madhab changes never reschedule prayer notifications.** `handleUpdateLocation` (`SettingsPage.tsx:134-145`), method buttons (`:430`), madhab (`:450`) are plain setters; `reschedule()` is only called from notification rows. Scheduler is idempotent per calendar day (`PrayerTimeNotificationScheduler.ts:62`). | Settings → adhan fires at the **old city's times** until the next cold start on a new day. Travel = wrong adhan. **Fix:** subscribe in `main.tsx` to `coords/prayerMethod/madhabSchool` changes → `reschedule()`. One-line-per-setting. |
| 2 | **Typed city never becomes coordinates.** Onboarding stores the string (`OnboardingPage.tsx:63`); there is no forward geocoder (`geocodeService.ts` has only `reverseGeocode`). Review step then *shows* the typed city as the user's location. | City-only users get **no prayer times and no adhan, ever**, and the UI tells them they're set up. **Fix:** forward-geocode on submit (Nominatim/Photon), or clearly mark manual city as display-only and require detection/map-pin for times. |
| 3 | **Notification queue drains after ~2 days unopened** (only today+tomorrow armed, re-armed only on cold boot, `PrayerTimeNotificationScheduler.ts:78-79`, `main.tsx:150`); no BootReceiver despite `RECEIVE_BOOT_COMPLETED` being declared. | Deferred since June; it's the app's core promise. **Fix:** native BootReceiver + daily WorkManager re-arm (also fixes DST drift). |
| 4 | **Hijri fasting reminders ignore their toggle.** `fastingReminderScheduler.schedule()` runs unconditionally at boot (`main.tsx:149`) and never reads `getConfig('fasting').enabled` (default **false**). | Mon/Thu/ayyam-al-bid/Arafah reminders fire with the toggle off and **cannot be disabled from the UI**. Fix: gate on the toggle (and split "fasting-day reminders" from the 03:30 suhoor reminder as two visible settings). |
| 5 | **Home hero countdown goes dark after Isha** — `usePrayerTimes.ts:60-80` only considers today; `nextPrayer=null` post-Isha. The Android widget already rolls to tomorrow's Fajr (`widgetBridge.ts:78-81`). | Every night the app's focal element degrades for hours. Fix: roll to tomorrow's Fajr like the widget. |
| 6 | **Snooze drops custom sound** — snooze reschedule carries `soundKey` but not `customChannelId` (`main.tsx:101-114`). | Fix: pass it through. |

### 2.2 Religious-content integrity

| # | Bug | Where | Impact / fix |
|---|-----|-------|--------------|
| 7 | **Every remote hadith is stamped `grade:'sahih'`** (`HadithService.ts:64`). | The app asserts authenticity it doesn't know — for hadith this is a real integrity problem, not polish. Fix: don't show a grade unless sourced; or ship a graded dataset. |
| 8 | **Zakat uses hardcoded gold/silver prices** (250/3 SAR/g, `ZakatPage.tsx:34-35`) with no fetch, no "as-of" date, no warning. | Wrong nisab → wrong zakat obligation. Fix: prices must be user-confirmed each session (big "آخر تحديث" affordance) or fetched with a visible timestamp; never silently defaulted. |
| 9 | **Skipping every dhikr marks the set — and the whole dhikr module — complete.** `isItemDone` counts skips (`DhikrModule.tsx:36-38`); last-item skip completes silently without blessing (`:264-272`); completing *any one* set (e.g. morning) marks the entire `dhikr` module done for streaks. | Streaks/badges assert worship that didn't happen. Fix: skips don't count toward completion; per-set completion records (morning/evening separately) feeding a day-record engine (§6). |
| 10 | **Ramadan widget is a dead feature with an inverted ring.** `toggleTaraweeh`/`markJuzComplete` have zero UI callers; juz ring renders `((30-done)/30)` → **100% gold at zero progress** (`RamadanWidget.tsx:57`). | First Ramadan after release, the hero widget is broken. Fix ring math; add tap-to-log taraweeh/juz (or cut the widget until it works). |
| 11 | **Hijri date has no manual ±1 adjustment** and Home vs Calendar use two different Hijri sources that can disagree (`HomePage.tsx:55-61` vs `HijriService.ts`). | Hijri drives Ramadan detection and fasting days. Fix: one service, cached, with a ±2-day user offset (standard in every prayer app). |

### 2.3 Crash & data-safety basics

| # | Bug | Where | Impact / fix |
|---|-----|-------|--------------|
| 12 | **No ErrorBoundary anywhere** (`main.tsx:267` renders `<App/>` bare). | Any render throw = permanent white screen — the worst possible failure for a daily app. Fix: root boundary with a calm "أعد المحاولة" screen + error persistence for support. |
| 13 | **Restore fires instantly on file pick, destructive replace, no confirmation** (`BackupPage.tsx:180-188` → `BackupService.ts:163` + forced reload). | One mistaken tap replaces everything. Fix: confirm dialog showing backup date + contents + auto safety-export first (was specified in June §5, never built). |
| 14 | **Cloud sync silently discards the remote side of true conflicts** (`cloudSyncService.ts:540-542`), and `hasMeaningfulLocalData` ignores bookmarks/tasbih/duaa/asma (`:280-300`) so a device holding only those is "fresh" and gets overwritten + reloaded. Double-reconcile race: `SIGNED_IN` listener *and* `handleCallbackUrl` both call `reconcileOnLogin` (`authStore.ts:49` vs `:122`). | Cross-device data loss, invisible. Fix: per-store merge for logs/counters (additive), conflict toast ("تم الدمج"), widen the meaningful-data check, single reconcile entry point. |
| 15 | **Bulk mushaf download lies about completeness** — failed pages are skipped silently, then `status:'done', done:TOTAL` (`offlineService.ts:132-143`); UI shows "المصحف كامل متاح دون إنترنت". | User boards a plane trusting it. Fix: track failures, show "٥٩٨/٦٠٤ — أعد تنزيل الناقص", verify-on-complete pass. |
| 16 | **A personal phone number ships in About** (`SettingsPage.tsx:603`, `tel:01146321817`). | Remove or replace with a support address before any public build. |
| 17 | **Sadaqah sums mix currencies** into monthly-goal % and year total (`sadaqahStore.ts:47-59`); the monthly goal lives in a raw localStorage key outside backup/sync (`SadaqahPage.tsx:50`). | Wrong "goal met ✓"; goal lost on migration. Fix: per-currency goal or convert-with-rate; move goal into the store. |

### 2.4 Play-store & platform blockers

- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` still declared + requested — **Play Console rejection** (deferred since June; must be build-flavored out).
- `user-scalable=no, maximum-scale=1` (`index.html:7`) — accessibility rejection risk and genuinely hostile to low-vision users; the in-app 3-step font scale is not a substitute. Remove; the mushaf page can opt out locally via `touch-action` if pinch conflicts with its gestures.

---

## 3. High-priority bug ledger (P1) — correctness users will eventually notice

**Motivation / stats**
- **Streak freezes are 100% dead**: `awardFreeze`/`useFreeze`/`isFrozen` have zero callers, and *neither* streak engine reads `isFrozen` (`progressStore.ts:200-218`) — yet a landing KPI tile and an entire StatsHabits section (`StatsHabitsPage.tsx:480-547`) render the permanently-zero data. Wire it (§7.2) or delete every surface.
- **Two divergent streak engines**: `statsService.computeStreakFromActiveDates` vs `progressStore.computeStreak` (capped at 365, `progressStore.ts:138`); prayers double-tracked (`prayerLogStore` feeds the stats pages/pulse, `progressStore` feeds badges) → badge streaks and stats streaks can disagree.
- **Badge logic contradicts badge copy**: overall-streak badges use `Math.max` across modules (`BadgeEngine.ts:11-21`); `count_dhikr_100` says "١٠٠ جلسة" but counts completed *days* (`:27-33`); the handled `ramadan_full` special badge doesn't exist in the catalog (`data/badges.ts`) so that code is unreachable.
- **`periodDelta` reports "+100%" whenever the previous period was 0** (`statsService.ts:186-192`) — misleading hero delta.
- **Fasting page mixes scopes**: taraweeh/juz panels iterate the whole store while the heatmap respects the selected range (`StatsFastingPage.tsx:154-206`); juz bars use ordinal x-labels so real gap-days are invisible.
- **Hifz doesn't feed the daily loop**: a recitation session never calls `recordWirdAchievement`/`markModuleComplete` — and the reader only advances wird when `unit==='page'` (`QuranReaderPage.tsx:219`); ayat/juz/hizb/surah wird units can only move via a manual button.
- **Hadith reading streak is a private localStorage counter** (`HadithPage.tsx:67-99`) invisible to stats/backup; Asma "studied" is granted on merely *opening* a detail (`AsmaUlHusnaPage.tsx:206-208`).

**Quran**
- **No MediaSession/audio-focus** (whole `AudioController.ts`): playback dies on background/screen-off, no lock-screen controls, no pause-on-call. Biggest single reader gap, carried from June.
- **Resume never remembers the verse** — `ayah:1` hardcoded, page smuggled via `scrollOffset` (`QuranReaderPage.tsx:187-191`).
- Auto-download-on-view still has no opt-out and the 604-page job has no Wi-Fi guard/size estimate (June §5, still open).
- Word-by-word audio errors swallowed (`AudioController.ts:307,326`).

**Location-based tools**
- **First tap does nothing** on Qibla & Mosques empty-state CTAs — they read stale `geo.coords` instead of the value `request()` returns (`QiblaPage.tsx:51-56`, `MosquesPage.tsx:70-74`). Onboarding/Settings already do this right.
- No-magnetometer devices never see the qibla **angle** even though it's computable from coords (`QiblaPage.tsx:142-144`); mosque list "direction" icons are static bearings that look like live pointers (`MosquesPage.tsx:122`).
- **Hijri calendar offline = infinite hero skeleton + silently empty grid** (`HijriCalendarPage.tsx:57,73-77`) — no error, no retry (Mosques has both).
- 3 of 8 supported calculation methods aren't selectable in any UI; unsupported ids silently fall back to MWL (`PrayerTimeService.ts:27`).

**Targets/wird**
- `updateTarget` skips `withFreshPeriod` → editing an expired recurring wird shows a stale period (`targetsStore.ts:333-340`).
- **Unbounded carry-over debt**: a month untouched turns a daily 200-dhikr wird into a multi-thousand mountain (loop at `targetsStore.ts:366`). Cap carried debt (e.g. ≤2× base) — this is the "mercy, not guilt" principle in code form.
- Manual-entry input: LTR field, Arabic-digit placeholder, `Number()` parse — format mismatch (`TargetDetailPage.tsx:278`).
- Tasbih pinned favorites are un-persisted component state (`TasbihPage.tsx:52-53`) — lost on every navigation.

**Notifications plumbing**
- `cancelAll('dhikr.postPrayer')` cleanup is a no-op (substring `_${id}_` never matches, `notificationStore.ts:215`; same latent trap for `_prayer_` ids).
- Onboarding "لاحقاً" on permissions is never followed up — denied notifications = a silent, permanent dead app with no re-prompt nudge.

---

## 4. Information architecture — the redesign

### 4.1 Problems (confirmed in code)
- **6 tabs** (`BottomNavBar.tsx:16-23`), labels at `text-[10px]`, ~62px per tab on small phones — over the 5-tab ceiling with the *wrong* five: Settings has a tab, **Stats does not** (10 sub-pages reachable only through المزيد).
- Settings triple-exposed (tab + Home gear + hub entry). Two badge screens (`/badges`, `/stats/achievements`). Home has two tap targets to the same prayers screen and repeats the الأذكار tab as a card.
- `/module/:id` renders outside both layouts (no transition, no rail); `ComingSoonPage` and `QuickActionsStrip` are orphaned dead code; the `*` route silently bounces deep links to `/` — the exact dead-end ComingSoonPage was written to prevent.
- Desktop: **every full-screen page (most of the app) has no persistent navigation** — only a back chevron on a 1920px monitor.

### 4.2 Target IA (5 tabs, worship-loop spine)

```
اليوم (Today) · القرآن (Quran) · الحفظ (Hifz) · الإحصاء (Stats) · المزيد (More)
```

- **اليوم** — the daily cockpit (§5.1). Absorbs Home + the daily wird checklist. Settings becomes a top-bar gear/avatar *here only*.
- **القرآن** — reader, bookmarks, downloads, audio. Unchanged scope.
- **الحفظ** — promoted to a tab. It's the differentiator, it has an SRS "due today" queue that *wants* daily visits, and it currently hides behind a Home card. Its landing: due reviews → continue memorizing → hifz map → mistake heatmap.
- **الإحصاء** — promoted to a tab (replaces Settings). The pulse/consistency hero is the app's retention engine; burying it in a junk drawer wastes it.
- **المزيد** — grouped catalog (أدوات: قبلة/مساجد/زكاة/صدقة/تقويم · معرفة: أسماء/حديث/دعاء · حسابك: نسخ/مزامنة/أوسمة), normalized Arabic search (fold hamza/alef/tashkeel — `arabicMatch.ts` already exists, use it).
- **الأذكار والأوراد** move into اليوم as the checklist + retain deep links; the adhkar *library* stays reachable from المزيد. (If removing the أوراد tab tests badly, swap Stats↔أوراد — but the day-one instinct should be: the Today screen *is* the wird.)
- Route hygiene: give NoNav pages a desktop rail (§9), wrap `/module/:id` in `NoNavLayout`, route unknown paths to a real ComingSoon/NotFound screen, delete dead components.

**Why:** one surface must answer *"what does Allah want from me right now, and how am I doing today?"* Today the answer is smeared across Home tiles, module pages, a targets tab, and stats — with different completion semantics in each.

---

## 5. Screen-by-screen review & redesign

### 5.1 اليوم (Home → Today cockpit)
**Now:** greeting → prayer hero → ayah card → hadith card → 4 feature cards → 3 quick cards. Two cards to the same destination; decorative content above actionable content; prayer errors/empty coords silently swallowed (`HomePage.tsx:44`); countdown dies after Isha.

**Redesign (order matters):**
1. **Hero: next prayer** — one focal element: prayer name, live countdown (rolls to Fajr after Isha), tiny 5-prayer strip. Tap = log/view prayers. If coords are missing: the hero *itself* becomes the "حدّد موقعك" CTA — never a silent `--:--`.
2. **وردك اليوم** — one card, the daily checklist: fard ring, adhkar (morning/evening as separate ticks), Quran wird progress, hifz review due-count, optional fasting/qiyam. Every row is one tap to act. This *is* the أوراد tab's soul, relocated.
3. **تابِع من حيث توقفت** — one compact row: last read position (real verse, after fixing resume) / due hifz review / unfinished adhkar set. Context-aware, max 1–2 chips.
4. **Ayah/Hadith of the day** — merged into one rotating "تأمّل اليوم" card (halves the decorative area), share button prominent (WhatsApp audience), hadith **without a grade badge** until grades are sourced.
5. Streak flame + this-week dots, small, tappable → Stats.

Delete: the 4+3 duplicate shortcut grids (they're the nav bar's job). Personalization: keep name/greeting; drop the "يا أخي" male default for a neutral "أهلاً بك".

### 5.2 Onboarding
**Now:** 5 steps, solid structure; location errors invisible (`OnboardingPage.tsx:70-73`); typed city decorative (P0 #2); permissions step **empty on desktop/iOS** (`ReliabilitySetup.tsx:60` returns null); no back from step 5.

**Redesign:** surface geolocation denial with a friendly retry + manual path; forward-geocode the manual city and *show the resolved coordinates' prayer times immediately* as confirmation ("مغرب اليوم في القاهرة ٦:٥٨ ✓" — instant trust); on non-Android render a platform-appropriate permissions step (web Notification API / Electron flow) instead of a heading over nothing; allow back-navigation; end with a 3-second "بسم الله" completion moment into the Today screen.

### 5.3 Prayer module & tools
- Add the 3 missing calculation methods; show "لماذا هذه الطريقة؟" helper.
- Qibla: static-bearing fallback when no magnetometer ("القبلة في اتجاه ١٣٧°  جنوب-شرق" + a map link); fix first-tap CTA.
- Mosques: fix first-tap CTA; replace fake pointers with distance-only; add "افتح في الخرائط" per row (exists) and a walking-time estimate.
- Hijri calendar: offline error + retry states; unify the Hijri source; add user ±day adjustment that flows into fasting reminders and Ramadan detection.

### 5.4 Adhkar
The counter UX and daily resume (`dhikrSessionStore`) are genuinely good. Fix the completion semantics (P0 #9), then:
- **Per-set completion records** (morning ≠ evening ≠ post-prayer) feeding the Today checklist; blessing fires on *any* set completion path, including skip-to-end (or block completion when everything was skipped).
- Post-prayer adhkar should accept the prayer context (`getPostPrayer(prayer)` ignores its argument, `DhikrApiService.ts:33`) and be *offered* after a prayer is logged — the cheapest cross-feature integration in the app.
- Optional recited-audio per dhikr (the Asma pattern already exists) — long-requested in this category; low risk.
- Tap-anywhere-on-card to count (the circular button is precise but small during walking/commute use); haptic tick per rep, stronger pulse on item completion.

### 5.5 الأوراد (Targets/Wird)
The engine (baseTotal, carry-over, نافلة surplus, period history) is thoughtful. The experience needs mercy and connection:
- **Cap carry-over debt** (≤2× base) with a gentle "فاتك أسبوع — نبدأ من جديد؟" reset offer on long absence (reactivation moment, §7.3).
- **Auto-advance from actual worship**: reading advances ayat/juz/hizb/surah wird units (not just pages); a completed hifz session advances a hifz wird; a Tasbih/dhikr session with matching text advances a dhikr wird. Manual +1 stays as fallback. This single change makes the whole app feel like one organism.
- Recurring targets: show a "period complete ✓ — نافلة" state distinctly in the list instead of sitting oddly under "active" forever.
- Fix LTR/Arabic-digit manual entry; run `withFreshPeriod` in `updateTarget`.

### 5.6 Tasbih
- Persist pins in the store (one-liner); add preset templates (post-prayer 33/33/34, استغفار ١٠٠, صلاة على النبي ١٠٠…) on the add sheet.
- Define "session" (reset daily like adhkar, or rename to "العدّاد"); keep lifetime totals.
- Optional: count-up haptic crescendo at 33/66/100 — cheap delight in the app's most-repeated interaction.

### 5.7 Quran reader
Mushaf rendering is the app's crown jewel — keep it. Priorities:
1. **MediaSession + audio focus + background playback** (Android foreground service via a thin plugin). Lock-screen controls, pause on call, survive screen-off. Nothing else in the reader matters more.
2. **True resume** (page *and* verse), plus per-surah recent positions ("مواضعك الأخيرة" — you keep 1 global slot today).
3. Downloads: Wi-Fi-only toggle + MB estimate + failure accounting (P0 #15) + auto-download opt-out.
4. Word-by-word audio error feedback; audio error should offer retry, not just toast-and-stop.

### 5.8 الحفظ (Hifz)
The engine shipped; now productize it:
- **Give it the tab + a real home**: due-today reviews (the SRS queue exists), continue-memorizing, a whole-Quran hifz map colored by strength, and the mistake heatmap (data already collected, capped 1500).
- **Arbitrary ranges** (last 10 ayat of a surah, juz sets, cross-page) — the June plan's per-range `HifzItem` model; current per-surah granularity makes review sessions too blunt.
- **Drop the full-page red flash** — per-word marking exists; the flash (`memo-error-flash`, `MemorizationPage.tsx:956-957`) reads as punishment and contradicts the calm brand.
- Wire sessions into wird/streaks/badges (there are zero hifz badges today despite the richest per-word data in the app).
- Desktop Whisper: add an explicit "الاتصال مطلوب لتنزيل النموذج أول مرة (~45MB)" state instead of generic repeated failures; migrate capture to AudioWorklet (ScriptProcessor is deprecated).
- Perf: batch aligner→UI updates per animation frame instead of a new `Map` per ASR token (`MemorizationPage.tsx:462-474`).

### 5.9 Stats
Strong foundation (TodayPanel, clamped ranges, hand-built SVG). Fixes + upgrades:
- **One streak engine** (single source: day-record engine §6), freezes honored, cap removed; prayers read from one store.
- Kill the freeze tiles until freezes work; kill the misleading +100% delta (show "أول فترة نشطة ✨" instead).
- Add TodayPanel to Learning/Sadaqah; align period chrome across all sub-pages.
- **Make weakness actionable**: "أضعف صلاة: الفجر" chip → tap → Fajr settings (earlier reminder, full-screen alarm suggestion). A stat you can't act on is decoration.
- Surface the dead motivational code: `detectReactivations` → "عدتَ بعد ٥ أيام — أهلاً بك 🌿" card; `trendDirection` → small ↑/↓ momentum cues; pass `messageKey` to `ConsistencyScore` (the encouraging copy is written and never shown).
- **Khatma ETA** ("بهذا المعدّل ستختم في ٩٤ يومًا") + **shareable weekly report card** (html-to-image is already a dependency) — the cheapest organic-growth lever for this audience.
- Remove `recharts` + dead `DailyRing.tsx` from the bundle.

### 5.10 Content libraries
- **Duaa:** normalize search with `arabicMatch.ts` (exists, unused here); search benefits too; render the tracked-but-hidden `recentlyViewed`; "see all favorites".
- **Asma:** add search; make "studied" require the flashcard flow or an explicit mark (the hadith's إحصاء deserves more than a scroll-by); drop the odd favRate metric.
- **Hadith:** grade fix (P0 #7); fold its private streak into the day-record engine.
- **Zakat:** price freshness (P0 #8); save calculations to history; "سجّلها صدقة" hand-off into the Sadaqah ledger (obvious integration, currently zero).
- **Sadaqah:** currency fix (P0 #17); move goal into the store; optional share-as-image.

### 5.11 Settings, backup, sync
- Regroup: **المظهر** (dark mode *moved here*, font, contrast, motion, time format), **الصلاة**, **التنبيهات** (with the full `ReliabilitySetup` checklist embedded — today the guided version is unreachable after onboarding), **العبادات**, **بياناتك** (merged cloud + file backup + the currently-invisible pre-pull safety snapshot as a restore option), **حول**.
- Mirror reader settings (theme/tajweed/font) here or link "إعدادات المصحف" — the most-themed surface is invisible to Settings.
- Restore confirmation + safety export (P0 #13); sync BackupPage's chip list with reality (11 shown vs 18 exported).
- Replace raw inputs/buttons with the ui/ components; settings tabs get `role="tablist"`.

---

## 6. One "day record" engine (the structural fix)

Today there are **six parallel completion/streak systems**: `progressStore` modules, `targetsStore` history, prayerLog, hadith's private streak, Asma "studied", Ramadan store — plus hifz sessions that feed none of them. Every motivation bug in §3 is a symptom of this.

**Proposal:** a single `dayRecordStore`:

```ts
interface DayRecord {
  dateKey: string;              // one boundary rule, one place
  prayers: { fard: 0-5, ... };
  adhkar: { morning: bool, evening: bool, postPrayer: bool, custom: string[] };
  quran: { pagesRead, ayatRead, wirdComplete };
  hifz: { sessions, accuracy, reviewsDone };
  dhikrCount, fasting, qiyam, sadaqah, ...
}
```

- All features **write** here (adhkar sets, reader, hifz sessions, tasbih, prayer log); streaks, badges, stats, wird auto-advance, and the Today checklist all **read** from here.
- One `todayKey()` with an optional **Islamic day boundary** (maghrib-to-maghrib, or "grace until Fajr") — Isha logged at 12:30am should not land on tomorrow; this is a worship app, not a todo app.
- Streak rules live here once: freezes consulted, no 365 cap, "today in-progress" grace defined once.
- Backed up + synced as one store; old stores migrate in.

This is the highest-leverage engineering task in the entire document: it converts five recurring bug classes into one tested module.

---

## 7. Motivation & retention system (redesign)

Principle: **mercy over guilt** — this is both the right tone for ibadah and the retention literature's conclusion.

1. **Streaks that forgive:** wire freeze tokens — award 1 per completed week (cap 3), auto-consume on a missed day with a gentle notice ("حفظنا سلسلتك 🕊️"). All code exists (`awardFreeze/useFreeze/isFrozen`); it needs ~20 lines of wiring and streak-engine awareness.
2. **Comeback moments:** `detectReactivations` exists — greet returns ("عدتَ بعد انقطاع — الأعمال أحبّها إلى الله أدومها وإن قلّ"), reset carry-over debt, offer a smaller restart wird.
3. **Honest badges:** fix the max-streak lie; relabel or re-implement `count_dhikr_100`; add the missing Ramadan badge; add hifz badges (first surah, 100 reviewed ayat, 7-day review streak); one badge surface (Stats → الإنجازات; `/badges` redirects).
4. **Completion rituals:** the `CompletionBlessing` is lovely — fire it consistently (adhkar skip-path, wird completion, hifz session end), each with a distinct short haptic+visual signature. Never a full-page red flash anywhere.
5. **Weekly reflection (new, small):** Friday card — "أسبوعك: ٣١ صلاة، ٤ أوراد، ١٢ آية حفظ" + one optional free-text خاطرة saved to the day record (IME-safe TextArea exists). This is journaling sized to fit the app's calm register, not a new module.

---

## 8. Visual system — "premium calm," enforced this time

The June direction (dawn/dusk teal+gold, Uthmani for sacred text, restraint) is right; it was specified and then not enforced. The rebuild is mostly *enforcement*:

1. **Tokens become law.** The `@theme` scale in `index.css` (spacing, type, z-index, motion durations) is defined and ignored — pages still use `p-3/p-4/text-[11px]/z-30` literals and 24 hardcoded hexes across 11 files (`StatsPage.tsx:148-151,330,334`, TasbihPage, stats sub-pages…). Add an ESLint rule (no arbitrary hex/z/px values in `src/pages`+`components`), fix violations file by file. Status colors must become visually distinct (today `bg-success` *is* teal).
2. **Typography:** UI sans = one family (Vazirmatn is in use; Tajawal is installed dead weight — pick one, delete the other). Amiri/KFGQPC reserved for sacred text. Arabic-Indic digits everywhere user-facing (the hero countdown leaks Latin digits today); tabular numerals for counters.
3. **Motion:** implement `layoutId` (nav pill actually slides) and `drag` (sheets actually swipe-dismiss) in `lib/motion.tsx` — or remove those props everywhere; today they're broken promises in the code. **Honor reduce-motion inside the motion lib** (it currently bypasses the CSS kill-switch via WAAPI and inline transitions): a single `prefersReduced()` check that snaps to final values. Route-level exits via AnimatePresence for the tab switcher.
4. **Components:** merge `Input`/`TextInput`; migrate raw `<input>`/`<button>` call-sites (SettingsPage is the worst offender); give `BottomSheet` dialog semantics + focus handling to match `Modal`; delete deprecated `goldAccent`, dead `QuickActionsStrip`, `ComingSoonPage` (or route to it), `DailyRing` + recharts.
5. **Dark mode:** pre-paint theme script in `index.html` (cold-start flash), StatusBar re-sync on toggle, audit the one-off hexes that have no dark variant.
6. **Density:** one hero per screen; Today cockpit ≤4 cards; stats landing's 12-tile grid → 6 period-consistent KPIs + portals. Whitespace is the premium signal, not gradients.

---

## 9. Desktop (Electron) — from ported WebView to real app

- **Persistent side rail on every screen** (render it in `NoNavLayout` at `lg:`) — today most of the app is a floating column with a lone back chevron.
- **Keyboard:** Ctrl+1..5 tabs, Ctrl+, settings, arrows already page the mushaf, Ctrl+F surah search, Ctrl+/- zoom (currently *impossible to zoom at all* on desktop), Esc closes sheets. Restore a minimal app menu so shortcuts are discoverable and Edit-role accelerators are guaranteed.
- **Window-state persistence** (size/position) — resets every launch today.
- **Prayer presence:** tray icon with next-prayer countdown + native desktop notification at adhan (the desktop currently has *no* prayer-alarm affordance at all); optional small always-on-top countdown widget. This is the desktop's reason to exist.
- Fix the empty onboarding permissions step (web Notification permission flow).
- Whisper hifz is desktop's exclusive superpower — market it in-app ("سمّع على جهازك بالكامل دون إنترنت").

---

## 10. Accessibility (P1, not polish)

1. Remove `user-scalable=no` (§2.4). 2. Reduce-motion inside the motion lib (§8.3). 3. Name every Toggle (visible label → `aria-labelledby`; SettingsPage toggles are anonymous switches today). 4. Touch targets ≥44px (Button `sm` is 34px; notification icon-buttons 32px). 5. `role="tablist"` for Settings/period selectors; `role="dialog"` + focus trap for BottomSheet. 6. Contrast pass on `text-text-muted` at 11px and gold-on-cream (the CSS comments themselves flag "unreadable pale gold"). 7. Heatmap day details reachable by tap (currently `title`-attr only).

---

## 11. Performance

- Remove recharts (dead) — instant bundle win.
- MushafPageView measurement is well-batched; keep. Batch hifz aligner UI updates per frame (§5.8).
- Virtualize the 114-surah pickers only if profiling says so (probably fine).
- Storage-quota check before the 604-page bulk download; stream binary writes instead of whole-file base64 in memory (`offlineService.ts:59-75`).
- Pre-paint theme script also kills the dark-mode flash (perceived performance).

---

## 12. New feature opportunities (only what fits)

| Feature | Why it fits | Cost |
|---|---|---|
| **Khatma ETA + weekly shareable report card** | Existing stats + html-to-image; WhatsApp-native audience; organic growth | S |
| **Qada (missed-prayer) ledger** | Logging already knows what was missed; "mercy" framing (make-up plan, not shame) | M |
| **Post-prayer flow** (log prayer → offered post-prayer adhkar → dhikr counter) | Pure wiring of existing modules; the single best "fewer taps" win in the daily loop | S |
| **Khatma circles (family/halaqah shared khatma)** | Supabase infra exists; no polished app owns this | L |
| **Auto cloud backup to Drive AppData** | Google sign-in exists; answers the trust gap permanently | M |
| **Hijri-aware overlays** (white days on heatmaps, Ramadan bands) | Data exists once Hijri offset lands | S |
| **Adhan voice packs + per-prayer sound** | Channel-per-sound infra already built for exactly this | S |
| **Widgets v2**: hifz-due count + wird ring on home screen | Widget bridge exists; hifz data exists | M |

Explicitly **not** recommended: social feeds, gamified leagues/leaderboards, generic habit features, AI chat — all off-register for a calm worship companion and dilute the moat.

---

## 13. Roadmap

**P0 — Trust & correctness (~1–2 weeks) — release gate**
Everything in §2: prayer reschedule-on-change subscription, forward geocoding, BootReceiver + daily re-arm, fasting toggle gate, post-Isha rollover, hadith grade, zakat prices, adhkar skip semantics, Ramadan widget (fix or cut), ErrorBoundary, restore confirmation, sync conflict handling, bulk-download honesty, currency fix, phone number, Play permission flavor, viewport zoom.

**P1 — One engine + IA (~2–3 weeks)**
Day-record engine (§6) with Islamic day boundary; streak/badge/freeze unification (§7.1–7.3); 5-tab IA + Today cockpit (§4–5.1); onboarding fixes; settings regroup + data hub; MediaSession audio.

**P2 — The premium coat (~2 weeks)**
Design-token enforcement + component migration; motion lib (layoutId/drag/reduce-motion); dark-mode pre-paint; accessibility list (§10); density pass; desktop rail + shortcuts + tray countdown + window persistence.

**P3 — Compounding differentiators (ongoing)**
Hifz productization (tab home, ranges, heatmap, badges); post-prayer flow; report cards + Khatma ETA; qada ledger; Drive auto-backup; widgets v2; Khatma circles.

**Sequencing rule:** no P2 visual work before its underlying P0/P1 behavior is honest. A beautiful streak flame over a lying streak engine is the opposite of premium.

---

*Cross-reference: `docs/REVIEW-AND-REDESIGN.md` (June) remains the deep-dive for the Hifz engine architecture and market research; this document supersedes its bug ledger and IA/visual sections.*
