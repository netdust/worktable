# Plan review — drawer-tabs
Reviewed-plan: 6468f880b6817a719db7ab27261d959ca6986cd8 specs/drawer-tabs/plan.md
Verdict: ready with fixes (plan-reviewer, opus, 2026-10-26). 0 Blocking, 7 Should fix, 7 Notes.

## Should fix (all applied in plan blob 9699582)
1. Tab overflow named `Meer` collides with the action row's `moreInRow: 'Meer'` (i18n.ts:224; test-setup.ts:45, 58; e2e/drawer.ts:30; studio.spec.ts:1490, 1951). Applied: `tabMore: 'Meer tabbladen'`.
2. RAC 1.22 `Tabs` with a controlled selectedKey outside its TabList leaves no focusable tab and a dangling aria-labelledby (useTabListState, useSelectableItem.mjs:91, useTabList.mjs:59, useTabPanel.mjs:29). Applied: ToggleButtonGroup + MenuTrigger, with a keyboard test.
3. Empty Notities pane where LongSection renders nothing (Sections.tsx:30; drawers without onWrite: Dashboard.tsx:142, Calendar.tsx:257, Grid.tsx:421, useOpenRow.tsx:44). Applied: notes pane only when a long column is writable or has text.
4. Existing tests reading moved sections not listed (Grid.test.tsx:1017, 1036, 1063, 1068, 1349; matrix/Panel.test.tsx:113; Drawer.test.tsx:75, 198-220, 598-719). Applied.
5. No test for Review Focus 3 (fresh data in a hidden pane). Applied.
6. Reset on row.id alone fails for the dashboard's single Drawer across models (Dashboard.tsx:142). Applied: `${model?.key}:${row.id}`, and Gegevens when the open key is gone.
7. Test map row 1 named e2e flows Task 2 builds; drawer-tabs-at-1280 missing from row 2. Applied.

## Notes
- Choose-other on a second link section in a hidden pane would do nothing (derive.ts:93-97, Drawer.tsx:200); no domain has one today. Applied: choose-other shows the link's pane first.
- Inbound pane keys need the field: `inbound:<model>:<field>` (derive.ts:71-73). Applied.
- Notities collects every long text (site: Extra smoke-URL's, Notities, Beheerders, Bekende beheerders; opdracht: Samenvatting) — for Stefan in the Step 5 screenshots.
- A note typed then a tab switch could lose its draft (Note.tsx:54). Applied as a test.
- Line ranges corrected (Drawer.tsx:179-237), stylesheet named (ui/app.css), tooltip named (RAC Tooltip).
- e2e/step-3f.spec.ts:804 reads `section.nv-dw-sec`; Task 2 Step 1's full run catches it.
- docs/SPEC.md:155-156 still hold; no spec edit.
