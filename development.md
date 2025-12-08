# Development Plan: ITRRAS (Supabase Edition)

**Project:** Integrated Travel Request, Review, and Approval System (ITRRAS)
[cite_start]**Methodology:** Agile Software Development [cite: 120]
**Backend Strategy:** Supabase (BaaS) replacing custom Node.js/Express.

---

## 1. Revised Technology Stack
This stack streamlines the implementation phase by offloading security and infrastructure to Supabase.

* [cite_start]**Front-End:** React.js (Maintains the SRS requirement for responsive interfaces)[cite: 177].
* **Back-End / Database:** **Supabase** (PostgreSQL).
    * [cite_start]*Why:* Handles the relational data models defined in Section 6.1 (Traveler, Request, Approval) out of the box[cite: 168].
* **Authentication:** Supabase Auth.
    * [cite_start]*Why:* Meets "secure user login with role-based access" requirement (RTM-001)[cite: 237].
* **File Storage:** Supabase Storage.
    * [cite_start]*Why:* Stores mandatory attachments like ITR, invitation letters, and budget estimates[cite: 46, 237].
* **Real-Time Updates:** Supabase Realtime.
    * [cite_start]*Why:* Directly satisfies the "real-time tracking" requirement (RTM-004)[cite: 240].

---

## 2. Database & Security Schema
[cite_start]*Adapting the "Data Models" section [cite: 168-170] for Supabase PostgreSQL.*

### Core Tables
1.  **`profiles`**: Links to Supabase Auth users. Stores metadata (Name, Department, Role).
    * [cite_start]*Roles needed:* Faculty, Dept. Head, Dean, KTTO Staff, OVCRE Staff, OVCAA/OVCPD, Finance, Chancellor [cite: 47-50].
2.  **`travel_requests`**:
    * Columns: `id`, `user_id`, `status` (Enum), `type` (Research/Academic), `current_office`, `created_at`.
3.  **`approvals`**: Tracks the sequential endorsements.
    * Columns: `request_id`, `approver_id`, `office` (e.g., KTTO, Finance), `verdict` (Approve/Return), `timestamp`.
4.  **`documents`**: References files in Supabase Storage buckets.

### Security: Row Level Security (RLS)
[cite_start]The SRS mandates strict security[cite: 204]. We will use RLS Policies:
* **Travelers:** Can only `SELECT` and `INSERT` their *own* requests.
* **Department Heads:** Can `SELECT` and `UPDATE` requests where `department_id` matches theirs AND `status` = 'Pending Dept Review'.
* **Chancellor:** Can `SELECT` and `UPDATE` requests where `status` = 'Pending Chancellor'.

---

## 3. Development Phases (Agile Sprints)

### Phase 1: Setup & Role Management
**Goal:** Secure access (RTM-001).
* [x] Initialize Supabase Project.
* [x] Create `profiles` table with triggers to auto-create profile on signup.
* [cite_start][x] Define **RLS Policies** to strictly separate "Traveler" access from "Approver" access[cite: 182].

### Phase 2: Submission & Storage
**Goal:** Digital submission flow (RTM-002).
* [x] Build React form for Travel Proposal.
* [ ] Configure **Supabase Storage Buckets** for uploading PDFs (Invitation, Itinerary).
    * [cite_start]*Constraint:* Ensure files are private and only readable by the owner and relevant approvers[cite: 110].
* [cite_start][x] Implement specific logic to require KTTO endorsement documents if the travel is research-related[cite: 110].

### Phase 3: The Routing Logic (Edge Functions)
[cite_start]**Goal:** Automate the complex routing described in Section 2.1 [cite: 47-50].
* [x] **Database Triggers (Postgres Function):**
    * When a request is created, auto-set status to `pending_dept_review`.
* [x] **Routing Logic (Edge Functions/Triggers):**
    * [cite_start]*Scenario A (Research):* After College Dean approves, update status to `pending_ktto`[cite: 48].
    * [cite_start]*Scenario B (Academic):* After College Dean approves, update status to `pending_ovcaa`[cite: 49].
    * [cite_start]*Scenario C (Funds Check):* After VP level, route to `pending_finance`[cite: 50].
    * [cite_start]*Scenario D (Final):* Route to `pending_chancellor`[cite: 50].

### Phase 4: Real-Time Tracking & Notifications
**Goal:** Transparency (RTM-004, RTM-005).
* [x] **Realtime Subscriptions:**
    * React app subscribes to the `travel_requests` table.
    * [cite_start]Traveler sees status change from "Pending Dean" to "Pending KTTO" instantly without refreshing[cite: 85].
* [ ] **Email Notifications:**
    * Use Supabase Edge Functions to trigger emails (via Resend/SendGrid) when a row is inserted into the `approvals` table or status changes.

### Phase 5: Audit & Compliance
**Goal:** Accountability (RTM-008).
* [ ] **Audit Logging:** Enable Postgres extensions (or a custom `audit_logs` table) to record every status change.
    * [cite_start]*Requirement:* Must log user, timestamp, and action for accountability[cite: 90].
* [ ] **Search/Filter:** Allow "Finance Office" to query past approved budgets for reports.

---

## 4. Testing Plan (Supabase Context)
[cite_start]*Refining Section 3.5 [cite: 198] for this stack.*

1.  [cite_start]**RLS Policy Testing:** Attempt to fetch "Chancellor-only" data using a "Faculty" account to ensure security failsafe[cite: 204].
2.  [cite_start]**Workflow Testing:** Submit a "Research" proposal and verify it routes to KTTO/OVCRE automatically, while an "Academic" proposal skips them[cite: 60].
3.  [cite_start]**Load Testing:** Test Supabase Storage upload speeds during "peak seasons" mentioned in the Problem Statement[cite: 67].
