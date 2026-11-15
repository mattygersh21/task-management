-- Initial task schema, managed by Flyway.
CREATE TABLE public.task (
    id int4 NOT NULL,
    title varchar(64) NOT NULL,
    description varchar(256) NULL,
    due_date date NOT NULL,
    status varchar(16) NOT NULL,
    CONSTRAINT task_check CHECK (status IN ('PENDING', 'COMPLETED')),
    CONSTRAINT task_pk PRIMARY KEY (id)
);

CREATE SEQUENCE public.seq_task_id
    INCREMENT BY 1
    MINVALUE 1
    MAXVALUE 9223372036854775807
    START 1
    CACHE 1
    NO CYCLE;
