# Task Management Application

Build a simple Task Management System where users can perform CRUD operations (Create
Read, Update, Delete) for tasks. Tasks will include a title, description, due date, and status
(Pending/Completed).

**Tech Stack**:
- **Backend**: Java Spring Boot
- **Frontend**: Angular
- **Database**: PostgreSQL/MySQL
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

The first startup creates the table and sequence shown below using
`docker/postgres/001-schema.sql`. Data persists in the `ftinoco-task_postgres-data`
Docker volume. Initialization SQL runs only when that volume is empty.

To run the backend on the host against this container:

```bash
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

The `local` profile changes only the database connection URL. The original
default configuration remains available. Stop the database from the repository
root with `docker compose down`; this preserves its data volume.

The database was create on PostgreSQL, here is the required DDL:

``` SQL
CREATE TABLE public.task (
	id int4 NOT NULL,
	title varchar(64) NOT NULL,
	description varchar(256) NULL,
	due_date date NOT NULL,
	status varchar(16) NOT NULL,
	CONSTRAINT task_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'COMPLETED'::character varying])::text[]))),
	CONSTRAINT task_pk PRIMARY KEY (id)
);
```

``` SQL
CREATE SEQUENCE public.seq_task_id
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
```


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
