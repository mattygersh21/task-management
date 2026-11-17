# Task Management Application

Build a simple Task Management System where users can perform CRUD operations (Create
Read, Update, Delete) for tasks. Tasks will include a title, description, due date, and status
(Pending/Completed).

**Tech Stack**:
- **Backend**: Java Spring Boot
- **Frontend**: Angular
- **Database**: PostgreSQL
- **Database migrations**: Flyway
- **API Testing**: Postman or equivalent

## Database

### Local PostgreSQL container

From the repository root, start the dedicated database:

```bash
docker compose up -d --wait
```

Connect at `127.0.0.1:5434`, database `postgres`, user `postgres`, password
`Admin@2024` (local practice credentials only). Port 5434 avoids the existing
job-search database on host port 5432. PostgreSQL uses the official
`postgres:17-alpine` image; no host PostgreSQL installation is required.

PostgreSQL data persists in the `ftinoco-task_postgres-data` Docker volume.
Compose starts the database; the backend runs Flyway migrations when it starts.
A new database receives its application schema at that point.

To run the backend on the host against this container:

```bash
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

The `local` profile changes only the database connection URL. The original
default configuration remains available. Stop the database from the repository
root with `docker compose down`; this preserves its data volume.

### Flyway migrations

Spring Boot uses Flyway with the configured application datasource and runs
pending migrations before JPA starts. Maven dependency versions are managed by
Spring Boot. Hibernate schema generation is disabled so Flyway owns schema changes.

Migration scripts live in
[`backend/src/main/resources/db/migration`](./backend/src/main/resources/db/migration).
`V1__create_task_schema.sql` creates the original task table and ID sequence.
To change the database, add a new script such as `V2__add_task_priority.sql`,
then start or restart the backend using the command above. Use increasing,
unique versions and two underscores between the version and description.
Flyway records applied versions and checksums in `public.flyway_schema_history`;
applied migrations should never be edited. Make corrections in a new migration.
A migration failure prevents backend startup.

#### Existing databases created before Flyway

The previous Docker initialization script and manual README DDL created the same
schema as V1. For a database with that schema and no Flyway history, first back up
the database and verify that `public.task` and `public.seq_task_id` match V1.
Then run this **once** from `backend`:

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=local \
  -Dspring-boot.run.arguments="--spring.flyway.baseline-on-migrate=true --spring.flyway.baseline-version=1"
```

This records version 1 as the existing starting point without rerunning V1 or
changing existing tasks. Afterward, stop the backend and use the normal startup
command. For a database outside the local Docker container, select the appropriate
profile/datasource instead. Do not baseline a schema that differs from V1: reconcile
it first. Automatic baselining is disabled by default so an unexpected nonempty
database fails startup rather than silently skipping the initial migration.

Removing the old initialization mount from Compose does not change existing
volumes. No volume reset is required to adopt Flyway.


## API

The endpoints were developed with Java/ Spring Boot, this is the file with the API test requests: [Postman Collection](./docs/Java%20-%20Task%20Management.postman_collection.json)

### One-level subtasks

Tasks and subtasks share `public.task`. A root has `parent_id = NULL`; a subtask
has exactly one root parent. V2 adds the self-referencing foreign key and triggers.
Existing tasks remain roots. Start the backend normally to apply V2; databases
already baselined at V1 do **not** need another baseline command.

- Create a root first. Add subtasks only from its edit dialog afterward.
- The same form collects title, description, due date, and status for both.
- A new subtask defaults to its parent's saved due date and `PENDING` status.
- A subtask may be due on or before its parent's date. Parent date changes that
  conflict with children are rejected with the affected children's titles, IDs,
  dates, and the required date limit.
- Save parent due-date changes before opening a subtask form. Parent edits and
  subtask saves/deletes are separate operations. Canceling parent edits does not
  undo a subtask that was already saved or deleted.
- Subtasks cannot have children. Parent links cannot change after creation,
  including converting an existing root to a child or detaching a child.
- Deleting a root deletes all its children via `ON DELETE CASCADE`. The UI
  explicitly requests confirmation. Deleting a child preserves its family.
- Parent/child status values are independent; completion does not automatically
  change related tasks' statuses.

Database triggers enforce nesting, immutable parent links, and both directions
of the date rule, including direct SQL. Child inserts/updates write a new row
version of the parent without changing its ID, coordinating with parent date
updates. Conflicting stale transactions fail rather than commit invalid dates.
Rules are checked immediately, so adjust child dates before shortening a parent
in manual SQL too. A deadlock or serialization failure requires retrying the
whole transaction. An index on `parent_id` is deliberately deferred for a later
exercise; large hierarchies will require revisiting query and cascade performance.

JPA relationships are lazy with no JPA cascade operations or orphan removal.
Services lock the root before changing a child, assemble DTOs inside transactions,
and fetch children explicitly for detail requests. JSON contains IDs rather than
nested parent objects, so it cannot recurse. Root listing does not traverse child
collections. Drafts are scoped by task and parent so root and child edits cannot
overwrite each other's saved form state.

### Subtask API

The API base URL is `http://localhost:8081`. Requests use JSON. A write payload
contains `title` (required, nonblank, at most 64 characters), `description`
(optional, at most 256 characters), `dueDate` (required, use `YYYY-MM-DD`), and
`status` (required: `PENDING` or `COMPLETED`). Include `id` when updating with PUT.
Relationship fields are not accepted in write payloads.

| Request | Behavior |
| --- | --- |
| `POST /task` | Create a root; existing behavior returns 200. |
| `POST /task/{parentId}/subtasks` | Create a child of an existing root; returns 201 with a `Location` header. |
| `GET /task/{id}` | Retrieve root detail with its subtasks ordered by ID, or child detail with an empty `subtasks` array. |
| `GET /task` | List roots ordered by ID. These are summaries: `subtasks` is empty; request detail to load children. |
| `PUT /task` | Update root or child fields; relationship stays unchanged. |
| `DELETE /task/{id}` | Delete a task; root deletion cascades. Returns 204. |

Example: add a child to saved task 12 (choose a date no later than its due date):

```bash
curl -i http://localhost:8081/task/12/subtasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Review release notes","description":"Check the final draft","dueDate":"2026-12-03","status":"PENDING"}'
```

Example parent-detail response:

```json
{
  "id": 12,
  "title": "Prepare release",
  "description": null,
  "dueDate": "2026-12-04",
  "status": "PENDING",
  "parentId": null,
  "subtasks": [
    {
      "id": 13,
      "title": "Review release notes",
      "description": "Check the final draft",
      "dueDate": "2026-12-03",
      "status": "PENDING",
      "parentId": 12
    }
  ]
}
```

Unknown task/parent IDs return 404. Invalid fields, blank titles, dates outside
parent limits, or attempts to use a subtask as a parent return 400. Unknown JSON
properties, including relationship fields, are rejected. Errors have a
`{"message":"..."}` body. Concurrency conflicts return 409 when translated by
Spring's locking exception handling; refresh before retrying. Confirmation is a
UI requirement: direct API DELETE calls execute immediately.

### Tests

With Java 17+ and Docker running:

```bash
cd backend
./mvnw test
```

Backend integration tests use a disposable PostgreSQL 17 Testcontainers database;
they do not change the local application database. They cover migration from an
existing V1 baseline, API validation, finite JSON, query counts, direct SQL rule
violations, cascading deletes, and concurrent date changes.

From `frontend`, run `npm test -- --watch=false --browsers=ChromeHeadless` with
Chrome installed, and `npm run build` for a production build. Frontend tests cover
subtask date limits, independent drafts, descriptive date errors, and confirmation
before parent and child deletion.

The temporary, standalone [UI exploration](./frontend/design-explorations/one-level-subtasks/index.html)
uses sample data only and is not part of the Angular application.


## UI

Start the frontend in a separate terminal:

```bash
cd frontend
npm install
npm start
```

Open http://localhost:4200/ in your browser; it redirects to `/task/list`.
The frontend calls the backend at http://localhost:8081/task.

## Debugging in VS Code

Open the **repository root** (`task-management`) in VS Code so that it loads
the root `.vscode/launch.json`. Install the recommended **Extension Pack for
Java** and **Angular Language Service** if needed. Browser debugging is built
into VS Code; the frontend configuration uses Google Chrome.

1. Keep the database running (`docker compose up -d --wait` from the root).
2. Stop the backend started with Maven using Ctrl+C in its terminal, freeing
   port 8081. Open `TaskManagementApplication.java` and let VS Code finish
   importing the Maven project. This project requires Java 17 or newer.
3. Open **Run and Debug** (Ctrl+Shift+D), select **Backend: Spring Boot (local)**,
   and press F5. VS Code builds and launches the Java application with the
   `local` profile. Wait for the backend startup message.
4. Keep `npm start` running in the frontend terminal. Select
   **Frontend: Chrome (running dev server)** in Run and Debug and press F5.
   Use the Chrome window it opens; both debug sessions can run together.

To trace a request, click the gutter beside `this.taskService.getAll().subscribe(...)`
in `frontend/src/app/task/list/list.component.ts` to set a breakpoint. Set another
beside `Iterable<TaskDto> tasks = service.getAllTasks();` in
`backend/src/main/java/com/ftinoco/task/management/controllers/TaskController.java`.
Reload the debugger's Chrome window. Execution pauses in the frontend first.
Press F5 to continue and send the HTTP request; execution then pauses in Java.
Continue again to let the response reach the browser. A paused backend leaves
the browser request pending until you resume it.

While paused, inspect **Variables**, hover over expressions, or add them to
**Watch**. F10 steps over a statement, F11 steps into a call, Shift+F11 steps
out, and F5 continues. Shift+F5 stops the selected debug session. Stopping the
frontend browser debug session leaves the separately started `npm start`
process running.

The frontend's development configuration already enables source maps, which
let VS Code map the browser's JavaScript back to your TypeScript files. A hollow
breakpoint may be unbound until its source loads; check that the frontend is
running and you are using the browser window opened by the debugger.

| ![List of task](./docs/ListOfTasks.png) |
|:--:| 
| *List of task* | 

| ![New Task](./docs/NewTask.png) | 
|:--:| 
| *New Task* |

| ![Update task](./docs/UpdateTask.png) | 
|:--:| 
| *Update task* |

| ![Delete task](./docs/DeleteTask.png) | 
|:--:| 
| *Delete task* |
