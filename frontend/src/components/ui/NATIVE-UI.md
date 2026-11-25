# App layout ownership

Android/iOS sizes live in `src/lib/native-layout.ts`, with `use-app-layout.ts` exposing them to shared views. Web keeps its existing values. `use-responsive-layout.native.ts` controls app chrome. Native ScrollArea and PhotoScrollStrip use touch scrolling and OS indicators; desktop draggable scrollbars stay in their generic files.

Keep authentication, requests, purchases, diary saving, push and group state in shared hooks/stores. When merging test updates, retain native files and audit shared component props and native-only branches rather than copying a whole frontend folder. Platform extensions are resolved by Metro; do not add duplicate routes.

Check Android/iOS on device after layout changes: 320/393dp widths, large text (120%), keyboard, long names, long product descriptions, landscape/tablets if supported. Run typecheck, lint and platform exports before delivery. Git push and EAS build/update are separate explicit actions.

## Checkpoint: app branch (2026-11-25)

- Native UI sizing, touch scroll views and EAS development-build configuration are saved together on `app`.
- Home diary/menu/quest/shop overlays now share one exclusive state; diary topics are always expanded.
- Native bottom navigation artwork is enlarged by 20%, with recalculated hit targets and content insets.
- Known device issue reported by the user: two-finger zoom does not work in the group universe. The touch handling changes are experimental; this still needs diagnosis and on-device verification in a later session. Do not treat a successful JS export or unit test as proof of working multi-touch.
- Future mobile changes should stay on `app`; merge test updates with care for native-only files. Do not merge `app` into test/main without the user's instruction.
