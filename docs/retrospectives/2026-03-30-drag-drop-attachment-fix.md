# Drag-and-Drop Attachment Fix Retrospective

Date: 2026-03-30
Scope: compose attachment drag-and-drop failure in packaged macOS app
Outcome: fixed and verified in packaged DMG

## Summary

The visible symptom was:

- Drag highlight appeared.
- No attachment was added.
- No toast was shown at first.
- Devtools showed `TypeError: null is not an object`.

The direct root cause was not Tauri, WebView drag/drop support, or the upload API itself.
The direct root cause was that the parent component passed a React state setter to the child as if it were a plain "register callback" function.

That mistake caused the child to call the setter like this:

- `setAttachmentDropHandler(files => { ... })`

But because the prop was a React state setter under the hood, React interpreted that function as a state updater, not as the handler value to store.
As a result, the updater ran immediately with the previous state value, which was `null`.
That `null` then flowed into `appendAttachments()` as `files`, producing the runtime failure seen in devtools.

## Timeline

1. Initial hypothesis space was broad.
   We looked at:
   - Tauri `dragDropEnabled`
   - HTML5 drag/drop behavior
   - macOS `public.file-url`
   - upload validation
   - `megalodon` media upload implementation

2. The code review showed drag events were already wired.
   Evidence:
   - [Compose.tsx](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/src/components/compose/Compose.tsx)
   - [dragDrop.ts](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/src/components/compose/dragDrop.ts)
   - [Status.tsx](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/src/components/compose/Status.tsx)

3. We added defensive logging and a direct upload fallback.
   This was useful for observability, but it was not the direct fix.

4. The turning point was the captured runtime log:
   - [.context/attachments/pasted_text_2026-03-30_15-02-54.txt](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/.context/attachments/pasted_text_2026-03-30_15-02-54.txt)
   - It pointed to `Status.tsx` around `appendAttachments()`.

5. Re-reading the parent-child handoff exposed the actual bug.
   - Parent held `attachmentDropHandler` in React state in [Compose.tsx](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/src/components/compose/Compose.tsx)
   - Child treated `setAttachmentDropHandler` like a normal registration API in [Status.tsx](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/src/components/compose/Status.tsx)

6. Final fix:
   - Introduce a dedicated registration wrapper in the parent.
   - Stop exposing the raw state setter semantics across the component boundary.
   - Rebuild, package, and verify in DMG.

## Root Cause

### Technical root cause

The parent stored a drop handler in component state:

- [Compose.tsx](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/src/components/compose/Compose.tsx)

The child received a prop named like a registration API:

- `setAttachmentDropHandler?: (handler: ((files: Array<File>) => void) | null) => void`

The child then called it with a function:

- `props.setAttachmentDropHandler?.(files => { ... })`

That is safe only if the prop is a plain callback setter.
It is unsafe if the prop is actually `useState`'s setter, because React interprets function arguments as updater functions.

In practice, React did this:

- previous state: `null`
- updater function invoked with previous state
- child code interpreted that `null` as `files`

That produced the observed `null is not an object` failure.

### Why the symptom looked different from the cause

The drag highlight still appeared because the drag event path itself was correct.
The failure occurred after drop, at callback handoff time, before a useful user-facing error path completed.

This is why the symptom looked like:

- DnD partly works
- upload does nothing
- devtools error only

## What We Got Wrong

### 1. We widened the hypothesis space too early

We investigated platform and transport layers before fully validating the immediate data flow from:

- `drop` event
- collected files
- registered callback
- `appendAttachments(files)`

That was not the fastest path to the root cause.

### 2. We over-weighted plausible but secondary risks

Two risks were real, but secondary:

- Tauri/WebView drag/drop differences
- `megalodon` using Node-oriented `form-data`

Those may still matter in edge cases, but they were not the cause of this incident.

### 3. We did not immediately challenge the prop contract

The prop name `setAttachmentDropHandler` hid the semantic mismatch.
We should have asked earlier:

- Is this a plain callback registration function?
- Or is this literally a React state setter?

That question would likely have found the bug much earlier.

## What Went Well

- We added enough logging to make the failure observable.
- We captured the runtime error into a file and used line references to narrow it.
- We did not stop at analysis; we verified in packaged DMG, which matched the user’s real environment.
- We converted the final fix into a structural fix, not a one-off workaround.

## Final Fix

### Structural fix

Instead of passing the raw React state setter down, the parent now exposes an explicit registration wrapper:

- [Compose.tsx](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/src/components/compose/Compose.tsx)

This wrapper stores the function value safely with:

- `setAttachmentDropHandler(() => handler)`

That preserves "store this function as state" semantics.

### Child-side behavior

The child can now continue to register the drop handler with plain callback semantics:

- [Status.tsx](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/src/components/compose/Status.tsx)

### Supporting changes

- Added drag/drop helper tests:
  - [dragDrop.test.ts](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/src/components/compose/dragDrop.test.ts)
- Added explicit Tauri scripts in:
  - [package.json](/Users/mindasom/conductor/workspaces/fedistar-v1/pangyo/package.json)

## Verification

Completed:

- `pnpm typecheck`
- `pnpm test -- dragDrop.test.ts`
- packaged DMG build
- packaged DMG launch
- manual confirmation that drag-and-drop attachment now works

## Lessons

### Debugging lesson

When the UI partially works, do not jump layers too quickly.
If drag highlight appears, validate the callback handoff and immediate arguments before investigating platform integration.

### React lesson

Never pass raw state setters across boundaries when the child is supposed to "register" a callback.
Provide an explicit registration API instead.

Bad shape:

```ts
setSomething: Dispatch<SetStateAction<Fn | null>>
```

Safer shape:

```ts
registerSomething: (fn: Fn | null) => void
```

### Incident handling lesson

Potential risks should be recorded separately from the direct cause.
Otherwise the investigation drifts into plausible architecture issues instead of the live defect.

## Follow-up Actions

1. Keep the parent-side explicit registration wrapper pattern for callback state.
2. Audit similar props that may currently expose raw state setters under callback-like names.
3. Decide separately whether the direct upload fallback should remain.
   It improved resilience, but it was not required for the root-cause fix.
4. Keep packaged-app validation in the workflow for desktop bugs.
   The final confirmation needed the DMG, not just dev mode.

## Short Version

This bug looked like a drag/drop or upload compatibility issue, but it was actually a React callback registration bug.
The parent passed a state setter.
The child treated it like a plain registrar.
React executed the function as an updater.
`null` flowed into the upload path.
The fix was to stop exposing the raw setter and provide an explicit registration function instead.
