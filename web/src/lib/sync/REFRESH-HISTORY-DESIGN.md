# Medication Promise — Refresh / History UX Design

Version: draft-1
Date: 2026-08-22
Status: design only — no deploy, no push

## 1. Purpose

- Clarify how the app refreshes data when the user records on another device or screen while the app is open.
- Provide a safe UX for selecting and recording past-day conditions (history UX).
- Guarantee: existing records are never silently overwritten.

## 2. Scope

In scope:

- Refresh strategy (manual, visibility-based, optimistic conflict display).
- Past-day condition recording UX (date picker, guardrails).
- Conflict handling rules when a record already exists.
- Test plan for "no overwrite" behavior.

Out of scope (this task):

- Real-time WebSocket sync (future enhancement).
- Multi-user shared editing.
- Production deploy or schema migration.

## 3. Current State (as of 2026-08-22)

| Feature | Status |
|---|---|
| Manual refresh button in header (`更新`) | Exists — calls `fetchAll()` |
| Date navigation (`← 前日`, `今日`) | Exists — `selectedDate` state |
| Condition save | POST `/api/condition` with `{ date, score }` |
| Medication record save | POST/PUT `/api/records` |
| Optimistic UI | Not implemented |
| Conflict detection | Not implemented |
| Auto-refresh on visibility change | Not implemented |

## 4. Refresh Strategy

### 4.1 Manual Refresh (existing)

- Header `更新` button calls `fetchAll()`.
- Disabled while `loading === true`.
- No change needed.

### 4.2 Visibility-Based Refresh (recommended addition)

When the user returns to the app tab (e.g., after recording on another device), auto-refresh:

```ts
// Proposed hook: useVisibilityRefresh
useEffect(() => {
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void fetchAll()
    }
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}, [fetchAll])
```

Guardrails:

- Debounce: skip if last fetch was < 5 s ago.
- Do not auto-refresh while a modal is open (avoid losing user input).
- Do not auto-refresh while `conditionSaving` or form submission is in progress.

### 4.3 Conflict Display

If a refresh reveals that a record the user was about to edit has changed:

1. Do NOT auto-merge.
2. Show a non-blocking banner:
   > 「別の端末で記録が更新されました。最新の情報に更新しました。」
3. If the user was editing, keep the modal open and mark the record as `stale`. On save, the server returns 409 if the version conflicts.

## 5. Past-Day History UX

### 5.1 Current Behavior

- `← 前日` button navigates back one day.
- `今日` button returns to today.
- Condition can be saved for any `selectedDate`.

### 5.2 Proposed Enhancements

1. **Date picker input** — allow direct selection up to 30 days back:

```tsx
<input
  type="date"
  value={selectedDate}
  min={format(subDays(new Date(), 30), 'yyyy-MM-dd')}
  max={today}
  onChange={e => setSelectedDate(e.target.value)}
  aria-label="記録日を直接選択"
/>
```

2. **Past-day banner** — when `selectedDate < today`, show:

```
📝 過去の日付の記録です（{selectedDateLabel}）。
保存しても既存の記録は上書きされません。
```

3. **Existing condition indicator** — if a condition already exists for the selected date, show it clearly and require explicit confirmation before overwriting:

```
この日の体調記録: 4
上書きしますか？ [キャンセル] [上書きする]
```

### 5.3 Guardrails

| Rule | Implementation |
|---|---|
| Future dates cannot be selected | `max={today}` on date input; server rejects `date > today` |
| Max 30 days back | `min` attribute + server validation |
| No silent overwrite | If condition exists, PUT requires `If-Match` version or explicit `overwrite: true` flag |
| Medication records immutable after 48 h | Server rejects edit/delete for records older than 48 h (except admin) |

## 6. No-Overwrite Contract

### 6.1 Condition Records

- `POST /api/condition` creates if absent; returns 409 if exists.
- `PUT /api/condition` updates only if `expectedVersion` matches.
- Client must pass `expectedVersion` from the last GET.

### 6.2 Medication Records

- Each record has `id` (UUID) and `version` (integer, starts at 1).
- `PUT /api/records/:id` requires `expectedVersion`.
- On mismatch → 409 Conflict with current record in body.
- Client displays conflict banner; does not auto-resolve.

## 7. Test Plan

| # | Scenario | Expected |
|---|---|---|
| T1 | Save condition for a date with no condition | 201 Created |
| T2 | Save condition for a date with existing condition (no overwrite flag) | 409 Conflict |
| T3 | Save condition with `overwrite: true` | 200 OK, version incremented |
| T4 | Edit medication record with correct `expectedVersion` | 200 OK |
| T5 | Edit medication record with stale `expectedVersion` | 409 Conflict, original unchanged |
| T6 | Select future date via date input | Rejected client-side; server also validates |
| T7 | Select date > 30 days back | Rejected client-side; server also validates |
| T8 | Visibility refresh while modal open | Skipped |
| T9 | Visibility refresh within 5 s of last fetch | Skipped (debounce) |
| T10 | Visibility refresh after > 5 s, no modal | `fetchAll()` called |

## 8. Open Questions

1. Should the 48 h immutability window for medication records be configurable per user?
2. Should condition overwrite keep an audit trail (previous score, timestamp)?
3. Is 30 days the right look-back window, or should it align with the monthly view?
4. Should the conflict banner offer "reload latest" vs "keep my edit" choices?
5. Do we need a `lastSyncedAt` indicator in the UI for user confidence?

## 9. Files Changed (this design task)

- `src/lib/sync/REFRESH-HISTORY-DESIGN.md` (this file)
- `src/lib/sync/refresh-history.test.mts` (unit tests for visibility debounce + no-overwrite logic)

No API routes, no DB schema, no deploy.