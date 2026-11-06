# 06 — Decisions & assumptions (draft of deliverable #4)

Where the spec has no clear answer, these are the calls made. Each one matches [03-db-security-design.md](03-db-security-design.md).
Any of these can be changed if the client prefers a different answer.

| # | Question the spec leaves open | Decision | Why |
|---|---|---|---|
| D1 | Manager deletes a task, but "history can't be deleted via API" | Soft delete. "Delete" calls the `delete_task` RPC (managers only), which sets `tasks.deleted_at`/`deleted_by`. The task then disappears from every list and card for everyone, but its status history is never removed: nobody has DELETE on tasks, and the history FK is `ON DELETE RESTRICT`. A site that has tasks, even archived ones, still cannot be deleted. | The spec requires that history can never be deleted through the API, and a cascading delete broke that. (Migration `0006_hardening.sql`.) |
| D2 | Delete a site that has tasks | Blocked (`ON DELETE RESTRICT`), UI says "remove its tasks first". | One click shouldn't wipe out tasks and their audit trail. |
| D3 | Can a manager edit or reassign a task mid-work? | Title and description editable until Accepted. Assignee can be changed in New, In Progress, and Needs Rework. Status is never editable directly, only through the actions. | Status must follow the transition table. Reassigning a task that's under review would be confusing. |
| D4 | Is Accepted final? | Yes. No transitions out, and content is frozen. | The spec lists no transition out of Accepted. |
| D5 | One user, two roles? | No. Exactly one role per user, stored in `profiles.role`, never in `user_metadata`. | `user_metadata` is user-editable, so a role stored there could be self-escalated. |
| D6 | What an assignee sees on a site card | Only their own tasks on that site. | Spec: "sees only their own tasks". |
| D7 | Which profiles an assignee can read | Self, authors of their tasks, and actors in their tasks' history (names only). Managers read all. | Needed to render names without exposing the user list. |
| D8 | How status changes are enforced | Through one DB function `change_task_status` (checks rules, locks the row, writes history in the same transaction). Direct `UPDATE` of `status` is denied by column grants and by a trigger. | "Forbidden transition fails even via a hand-crafted request." |
| D9 | Comment for Needs Rework | Required, non-empty after trimming whitespace, enforced in the DB. Optional for other transitions. | Spec requires it only for rework. |
| D10 | Task without an assignee | Not allowed. The assignee must be a user with the assignee role. | Every transition after New needs "the assigned assignee". |
| D11 | Accounts | Sign-up disabled. 1 manager + 2 assignees created by hand. | Spec §3.5. |
| D12 | UI library | Mantine | Fastest route to forms, tables, and modals; design isn't graded. |

## Not finished / out of scope (fill in honestly at submission)

- Reassignment and content edits are not written to the history; only status changes are, as the spec requires.
- No UI to view or restore archived (soft-deleted) tasks; they are visible only to the DB owner. A site that once had tasks can't be deleted (see D1).
- Automated DB tests (pgTAP). The security checks run as a supabase-js script instead ([04-security-audit-checklist.md](04-security-audit-checklist.md)).
- Pagination, search, user management UI, deactivating users.
