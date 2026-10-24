# Organizer FAQ: moved into the product

The FAQ drafted here on 23 October 2026 now lives in the product, split by who may read it. Edit it there, not here, so there is one source of truth.

| Layer | Who sees it | Source |
|---|---|---|
| Public help, `/help` | Everyone | `apps/web/lib/help-public.ts` |
| Organizer help, Dashboard then Help | Signed-in team members, filtered by role (staff, organizer, admin and owner) | `apps/api/src/modules/help/help-content.ts`, served by `GET /v1/organizations/:orgId/help` |
| Internal | Orkora only | `docs/SUPPORT_POLICY_NOTES.md` and runbooks. Limits, payment mechanics and support procedures stay out of the published help. |

The organizer sections come from the API, so a section is only ever sent to a role allowed to read it. Hiding a page in the web app alone would not do that, because dashboard pages render in the browser.

Writing rules for help content: answer in user terms (buttons and steps). Leave out rate limits, quotas, timing of internal processes and how payments are verified.
