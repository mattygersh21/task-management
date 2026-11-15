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
