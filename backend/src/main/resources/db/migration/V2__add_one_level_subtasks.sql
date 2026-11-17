-- Existing tasks remain roots. Indexing parent_id is intentionally deferred.
ALTER TABLE public.task
    ADD COLUMN parent_id integer,
    ADD CONSTRAINT task_parent_fk FOREIGN KEY (parent_id)
        REFERENCES public.task(id) ON DELETE CASCADE,
    ADD CONSTRAINT task_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);

-- Relationships are immutable after creation, including through direct SQL.
-- A child write also writes a new MVCC version of its parent (id = id).
-- This serializes child changes with parent date changes and causes a stale
-- REPEATABLE READ/SERIALIZABLE writer to fail rather than validate stale data.
-- Merely SELECTing the parent FOR UPDATE would not create that MVCC version.
CREATE FUNCTION public.enforce_task_hierarchy() RETURNS trigger
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    parent_parent integer;
    parent_due date;
    blockers text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
            RAISE EXCEPTION 'A task cannot be moved to another parent or changed between root and subtask.'
                USING ERRCODE = '23514', CONSTRAINT = 'task_parent_immutable';
        END IF;
    END IF;

    IF NEW.parent_id IS NOT NULL THEN
        IF NEW.parent_id = NEW.id THEN
            RAISE EXCEPTION 'A task cannot be its own parent.' USING ERRCODE = '23514';
        END IF;
        -- This id-only update does not fire this trigger recursively.
        UPDATE public.task SET id = id WHERE id = NEW.parent_id
            RETURNING parent_id, due_date INTO parent_parent, parent_due;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent task % does not exist.', NEW.parent_id
                USING ERRCODE = '23503', CONSTRAINT = 'task_parent_fk';
        END IF;
        IF parent_parent IS NOT NULL THEN
            RAISE EXCEPTION 'Subtasks cannot have subtasks.'
                USING ERRCODE = '23514', CONSTRAINT = 'task_one_level';
        END IF;
        IF NEW.due_date > parent_due THEN
            RAISE EXCEPTION 'Subtask due date must be % or earlier (the parent due date).', parent_due
                USING ERRCODE = '23514', CONSTRAINT = 'task_child_due_date';
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
            SELECT string_agg(format('"%s" (#%s, %s)', title, id, due_date), ', ' ORDER BY id)
                INTO blockers FROM public.task
                WHERE parent_id = NEW.id AND due_date > NEW.due_date;
            IF blockers IS NOT NULL THEN
                RAISE EXCEPTION 'Update the due date of % to % or earlier before saving this parent due date.', blockers, NEW.due_date
                    USING ERRCODE = '23514', CONSTRAINT = 'task_parent_due_date';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER task_hierarchy_guard
BEFORE INSERT OR UPDATE OF parent_id, due_date ON public.task
FOR EACH ROW EXECUTE FUNCTION public.enforce_task_hierarchy();
