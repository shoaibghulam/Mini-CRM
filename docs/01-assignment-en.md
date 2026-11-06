# Assignment (English) — Mini-CRM "Sites and Tasks"

Source: `../Тестовое задание мини-CRM «Объекты и задачи».docx.pdf` (Russian original).
English PDF: `../Test Assignment - Mini-CRM Sites and Tasks (EN).pdf`.
Client contact: Ivan, 2B Studio, via the hh.ru application chat.

Build a small CRM for a construction company. A manager assigns tasks for sites (construction sites). Assignees do the tasks and send them for review.

## 1. Terms

| Parameter | Value |
|---|---|
| Scope | 2–3 hours |
| Deadline | ASAP, ideally same day. **Tell them when you start and when you'll submit.** |
| Payment | Unpaid. If hired, up to 3 h is paid at your rate in the first payout. |
| Stack | React + TypeScript, Supabase (free cloud tier OK). Any UI library. |
| Tools | Any, including AI (Cursor, Claude Code). |
| Communication | hh.ru chat, as in real work. |

**Design is not graded.** Graded: how the logic works, how the data is protected, **how well you understand what you built**.

## 2. Functional requirements

### 2.1 Roles

| Role | Can do |
|---|---|
| Manager | Create/edit/delete sites and tasks; assign an assignee; accept or send back for rework; sees everything. |
| Assignee | Sees only own tasks and only sites where they have tasks; starts work; sends for review. |

Multiple managers and multiple assignees are allowed.

### 2.2 Sites
Fields: name, address. The site card lists its tasks with statuses.

### 2.3 Tasks
Fields: title, description, site, assignee, status, author, created_at.

| From | To | Who | Condition |
|---|---|---|---|
| — | New | Manager | on create |
| New | In Progress | assigned assignee | — |
| In Progress | Under Review | assigned assignee | — |
| Under Review | Accepted | Manager | — |
| Under Review | Needs Rework | Manager | **comment required** |
| Needs Rework | In Progress | assigned assignee | — |

All other transitions are forbidden.

### 2.4 History
Every status change is stored: who, when, from, to, comment (if any). Visible on the task card to both roles.

### 2.5 Screens
1. Login (email + password)
2. Site list
3. Site card with task list
4. Task card: details, available action buttons, history
5. "My Tasks" for the assignee

The UI shows only the actions available to the current user in the current status.

## 3. Security requirements (must hold when calling Supabase directly, bypassing the UI)

1. Access enforced in the DB (RLS), not just hidden in UI.
2. Assignee cannot read or modify other people's tasks.
3. Status transitions validated in the DB; a forbidden transition fails even via a hand-crafted request.
4. Status history cannot be forged, edited, or deleted via the API.
5. Public sign-up disabled; test users created manually in Supabase.
6. Secret keys (`service_role` etc.) never in the frontend or the repo.

## 4. Deliverables (one message in hh.ru chat)

1. Live app URL + logins: ≥1 manager, ≥2 assignees. DB seeded with 2–3 sites and several tasks in different statuses.
2. GitHub repo (public or shared) with DB migrations + short README (how to run).
3. Explanation for a non-technical manager: ≤5 min video or ½ page text — how it works, how data is protected, what an assignee cannot do.
4. List of decisions and assumptions + what wasn't finished.

Then: 30–40 min call — demo + questions.
