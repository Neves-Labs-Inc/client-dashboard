# Client Dashboard

A portal where Neves Labs' freelance clients see the status of their projects and their invoices.

## Language

**Client**:
A business Neves Labs does freelance work for. The unit that owns projects and invoices; data never crosses between Clients. A Client can be archived: its Client Users lose access and nothing is deleted. The Admin can unarchive it, restoring their access.
_Avoid_: Customer, account, tenant (in conversation)

**Client User**:
A person who belongs to exactly one Client and logs in to see that Client's data. A Client has many Client Users.
_Avoid_: Client (when you mean the person), member

**Owner**:
A **Client User** who manages their Client's roster: invites people, promotes or demotes, and removes Client Users (other Owners included). A Client with any Client Users always has at least one Owner; nobody, the Admin included, can leave it with Members but no Owner.
_Avoid_: Admin (that is Neves Labs staff), manager

**Member**:
A **Client User** who is not an **Owner**. Sees everything an Owner sees, including **Invoices**, but cannot manage the roster.
_Avoid_: Viewer, guest

**Invitation**:
An Owner's or the Admin's offer for a person to join a Client. An Owner's Invitation always makes a **Member**; the Admin's Invitation for a Client's first user makes an **Owner**. It expires after a week and can be revoked; an expired Invitation is gone, and a new one must be sent. The Admin only invites a Client's first Owner; after that, Owners invite. An email that already belongs to a Client User of another Client cannot be invited. Accepting it means signing in as the invited email; any other email is refused. Nobody can become a Client User without one.
_Avoid_: Signup, registration

**Admin**:
Neves Labs staff (today: Franklin) who can see and manage every Client. The Admin's email can never be invited as a Client User.
_Avoid_: Owner, superuser

**Project**:
A body of work Neves Labs does for one Client. Its name and status are mirrored from Neves Labs' project-management tool, never authored in the dashboard. The Admin decides which Client a Project belongs to; it is never inferred. A Project that is finished, closed, or no longer mirrored, is a **Past Project**. Unlinking a board freezes its Project with that Client; the board can later be linked again, reviving the same Project for the same Client or starting a new one for another Client.

**Past Project**:
A **Project** that is complete or inactive, closed in the project-management tool, or whose link to the project-management tool was removed. Client Users can still read it; one that is no longer mirrored is frozen as it last was.
_Avoid_: Archived, closed

**Status Update**:
A dated note on a **Project** giving its health (on track, at risk, off track, complete, inactive). Client Users see the latest one and the history of earlier ones.

**Milestone**:
A named, dated stage of a **Project** that groups its **Tasks**. Its progress is the share of its client-visible Tasks that are Done.
_Avoid_: Phase, sprint

**Task**:
A piece of work inside a **Project** that has been marked client-visible. Its client status is one of Up next, In progress or Done. It may belong to a **Milestone** and may carry a client note and a target date. Work not marked client-visible is never a Task, as far as Client Users are concerned; work is hidden until someone marks it visible.
_Avoid_: Issue, ticket, item, deliverable

**Invoice**:
A bill Neves Labs issues to a Client, authored in the dashboard by the Admin (there is no separate source document). It has a number, issue date, due date, an optional memo, one or more **Line Items**, and may bill for one **Project**. Its amount is the sum of its Line Items. Its status is Open, Paid or Void. Client Users can only read it, and never see Void Invoices. Payment happens outside the dashboard; the Admin marks an Invoice Paid by hand, and can revert a mistaken Paid back to Open (a status change, not an edit). Its total must be greater than zero. An issued Invoice is never edited; a mistake is fixed by voiding it and issuing a new one.
_Avoid_: Bill, statement

**Line Item**:
One row of an **Invoice**: a description and a non-zero amount, which may be negative (a discount or credit).
_Avoid_: Charge, entry

**Overdue**:
An **Invoice** that is Open and past its due date, judged in Neves Labs' business timezone (US Eastern): it becomes Overdue the day after the due date. Never set by hand; always follows from the dates.

**Void**:
An **Invoice** cancelled by the Admin, usually a mistake. Only an Open (or Overdue) Invoice can be voided, never a Paid one. It is final and keeps its number, leaving a gap in the sequence.
_Avoid_: Deleted, cancelled

**Request**:
A bug report or feature ask that a **Client User** (Owner or Member) submits from the dashboard. It has a kind (Bug or Feature), a title, a description, and may concern one of its Client's **Projects**. It lives only in the dashboard; it is never itself work in the project-management tool. Every Client User of the Client can see it. Its status is New, Accepted, Declined, Done or Withdrawn; the Admin sets all but Withdrawn, and may add one response note the Client sees. While New, its submitter can edit or withdraw it. An Accepted or Done Request may point to the **Task** it became (any other status clears the link); if that Task is later hidden or removed, the Request shows its last title as no longer tracked.
_Avoid_: Ticket, issue, submission, feedback

## Relationships

- A **Client** has many **Client Users**, **Projects** and **Invoices**
- An **Invoice** has one or more **Line Items** and bills for at most one **Project**
- A **Project** has many **Status Updates**, **Milestones** and **Tasks**; a **Task** belongs to at most one **Milestone**
- An **Admin** is not a **Client User** and belongs to no **Client**
- A **Client User** is either an **Owner** or a **Member**; a Client's first Client User is invited by the **Admin** and starts as an **Owner**
- A removed **Client User** loses access at once; their past actions stay attributed to them
- A **Client** has many **Requests**; a **Request** is submitted by one **Client User**, concerns at most one **Project** and may point to one **Task**
