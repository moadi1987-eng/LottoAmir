# Simple learning form

The user asked to stop the infrastructure discussion, implement the previously described simple NUMBERS-based workflow, and start afresh. This is a browser-only change to the existing independent panel after PINs, not a new lottery prediction algorithm or a cloud service.

## Experience

- Title: הטופס הלומד. Show one current learner form of 14 lines, with six legible RTL number balls, strong number and a winnings column. A pending draw says ממתין לתוצאה, never ₪0.
- One primary button loads the site's NUMBERS.xlsx and prize data. Once an experiment exists this reconciles saved forms and creates only the next target. On first use an explicit start action creates the first saved form after source loading.
- Show the latest settled learner form separately, with per-line matches and monetary amounts, and a prominent total. Missing prize data says ממתין לנתוני פרסים, never zero. Regular Lotto only; no implication of actual ticket purchase/payment.
- Show concise learner-only draw history. Preserve immutable snapshots and missed-draw/late-draw labels. Technical metadata, simulation, controls and benchmark arms remain accessible under collapsed advanced sections, not in the primary flow.
- Add explicit התחלה מחדש with confirmation. Generate the replacement before committing; in one IndexedDB transaction archive the full previous compatible experiment and replace active records. Preserve archived forms/prizes; allow read-only inspection/export of prior experiments. Never automatically reset on load/deploy. PIN and Backtest storage remains untouched.
- Source latest draw and refresh state are visible. Repeated refresh with unchanged results must not replace numbers. Work happens only while the page is open and uses already published data, not direct Pais scraping. No retrospective form generation.
- Local-only storage and absence of guaranteed prediction improvement remain clear in short copy.

## Approach and boundaries

Reuse the existing vanilla JS UI/controller/store and tested worker/report pipeline. This is the simple on-open/on-click approach already discussed; cloud background operation was ruled out of this change by the user's request. A cosmetic-only relabel would not meet the request because it would leave the controls and comparisons dominant.

Implementation calls: retain comparison computation for valid historical evaluation but collapse its presentation; provide a fresh-start button rather than deleting browser history at deployment. Archives use reserved meta records without changing the database version; older clients safely become read-only after an archive exists. Active revision stays monotonic to reject stale tabs. A restart from incompatible/corrupt storage is prohibited.

No new dependencies, external service, paid resource, lottery data changes, PIN number changes, or optimizer-branch merge. Deployment must be verified separately and never claimed from local tests alone.

## Acceptance

Real-browser tests cover old data rendering, single visible current form, pending vs zero vs missing money, a full source/result/next-form cycle, unchanged-source idempotency, restart cancellation/success/race/abort, archived state inspection, PIN byte preservation, and mobile overflow. Existing core/report/controller/store and project regression suites remain green with intentional UI selector/visibility updates only.
