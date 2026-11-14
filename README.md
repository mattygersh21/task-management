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
