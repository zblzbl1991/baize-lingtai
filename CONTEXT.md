# Pi Web

Pi Web hosts coding-agent sessions for user-selected projects while keeping the web server's runtime concerns separate from project work.

## Language

**Host Runtime Environment**:
The environment owned by the Pi Web server and its framework runtime.
_Avoid_: Project environment, shell environment

**Project Command Environment**:
The environment presented to a command that Pi Web runs on behalf of a user-selected project.
_Avoid_: Host environment, inherited environment

**Built-in Project Shell**:
A shell entry point owned and operated by Pi Web for commands associated with a project.
_Avoid_: Extension shell, arbitrary child process

## Work organization

**Project**:
A user-selected project whose sessions are grouped together in the sidebar; a Git repository's main checkout and linked worktrees share one Project, while each session retains its own working directory.
_Avoid_: Workspace, cwd, folder

**Work Item（工作目标）**:
The durable, outcome-oriented unit of work that a user organizes sessions under; it belongs to one Project and outlives any single session.
_Avoid_: Task, thread group, workspace

**Workbench（工作台）**:
The cross-Project view for creating, resuming, reviewing, and completing Work Items.
_Avoid_: Dashboard, session list

**Association**:
The explicit link between one session and one Work Item in the same Project. A session is associated with at most one Work Item. Starting a session from a Work Item associates it automatically; a fork inherits the source's Association while the source keeps its own. Saving or attaching an existing session is an explicit user action; earlier sessions are never associated automatically.
_Avoid_: Ownership, tagging, membership

**Unassociated Session**:
A session with no Work Item; it stays in the Project's ordinary session list until the user explicitly saves it as a new Work Item or attaches it to one.
_Avoid_: Free conversation, orphan session, loose session

**Work Item Outputs（产出）**:
The files within the Project's checkouts that supported successful tool calls in a Work Item's currently associated sessions wrote. They include supported writes made before an explicit Association and identify current files, rather than retained versions or changes exclusively attributable to this Work Item. Detaching or deleting a source session removes its contribution.
_Avoid_: Artifacts, deliverables, git changes

**Completed Work Item**:
A Work Item the user has explicitly marked as done; it stays readable and reopenable. Its status organizes work without changing session permissions: continuing a session or changing Associations leaves it completed until the user explicitly reopens it.
_Avoid_: Archived, closed, auto-completed
