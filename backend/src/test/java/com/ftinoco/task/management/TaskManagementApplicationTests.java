package com.ftinoco.task.management;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.*;
import java.util.Map;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.jpa.properties.hibernate.generate_statistics=true",
        "logging.level.org.hibernate.stat=OFF", "logging.level.org.hibernate.engine.internal.StatisticalLoggingSessionEventListener=OFF", "logging.level.org.springframework.web=INFO"})
@AutoConfigureMockMvc
@Testcontainers
class TaskManagementApplicationTests {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
    @Autowired MockMvc api;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory emf;

    @BeforeEach void clean() { jdbc.execute("TRUNCATE public.task CASCADE"); }

    private String input(String title, String due) throws Exception {
        return json.writeValueAsString(Map.of("title", title, "description", "Description", "dueDate", due, "status", "PENDING"));
    }
    private int root(String title, String due) throws Exception {
        return json.readTree(api.perform(post("/task").contentType("application/json").content(input(title, due)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asInt();
    }
    private int child(int parent, String title, String due) throws Exception {
        return json.readTree(api.perform(post("/task/{id}/subtasks", parent).contentType("application/json").content(input(title, due)))
                .andExpect(status().isCreated()).andExpect(header().exists("Location"))
                .andReturn().getResponse().getContentAsString()).get("id").asInt();
    }
    private int sqlTask(String title, String due, Integer parent) {
        return jdbc.queryForObject("INSERT INTO task(id,title,due_date,status,parent_id) VALUES(nextval('seq_task_id'),?,?::date,'PENDING',?) RETURNING id", Integer.class, title, due, parent);
    }
    private Connection connection() throws SQLException {
        Connection c = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        c.setAutoCommit(false);
        try (Statement s = c.createStatement()) { s.execute("SET LOCAL statement_timeout = '8s'"); }
        return c;
    }

    @Test void linksChildrenAndSerializesFiniteStableDetailWithoutNPlusOne() throws Exception {
        int parent = root("Release", "2026-12-04");
        int first = child(parent, "Checklist", "2026-12-03");
        child(parent, "Notes", "2026-12-04");
        var stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.clear();
        String response = api.perform(get("/task/{id}", parent)).andExpect(status().isOk())
                .andExpect(jsonPath("$.parentId").isEmpty()).andExpect(jsonPath("$.subtasks.length()").value(2))
                .andExpect(jsonPath("$.subtasks[0].id").value(first))
                .andExpect(jsonPath("$.subtasks[0].parentId").value(parent))
                .andExpect(jsonPath("$.subtasks[0].subtasks").doesNotExist())
                .andExpect(jsonPath("$.subtasks[0].parent").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
        assertThat(json.readTree(response).get("subtasks")).hasSize(2);
        for (int i = 0; i < 3; i++) {
            int other = root("Other parent " + i, "2026-12-04");
            child(other, "Other child", "2026-12-03");
        }
        stats.clear();
        api.perform(get("/task")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(4));
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
        api.perform(get("/task/{id}", first)).andExpect(status().isOk()).andExpect(jsonPath("$.subtasks").isEmpty());
        assertThat(jdbc.queryForObject("SELECT parent_id FROM task WHERE id=?", Integer.class, first)).isEqualTo(parent);
    }

    @Test void rejectsUnknownParentBlankTitlesAndInvalidFields() throws Exception {
        api.perform(post("/task/2147483647/subtasks").contentType("application/json").content(input("Child", "2026-12-04")))
                .andExpect(status().isNotFound());
        int parent = root("Parent", "2026-12-04");
        for (String title : new String[]{"", " ", "\t\n"}) {
            api.perform(post("/task/{id}/subtasks", parent).contentType("application/json").content(input(title, "2026-12-04")))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
        }
        api.perform(post("/task/{id}/subtasks", parent).contentType("application/json")
                .content("{\"title\":\"Child\",\"status\":\"PENDING\"}")).andExpect(status().isBadRequest());
        api.perform(post("/task").contentType("application/json")
                .content(input("Root", "2026-12-04").replace("\"description\":", "\"parentId\":1,\"description\":")))
                .andExpect(status().isBadRequest());
    }

    @Test void enforcesDatesOnChildAndParentUpdatesWithNamedErrors() throws Exception {
        int parent = root("Parent", "2026-12-04");
        int child = child(parent, "Review release notes", "2026-12-04");
        api.perform(post("/task/{id}/subtasks", parent).contentType("application/json").content(input("Late", "2026-12-05")))
                .andExpect(status().isBadRequest());
        api.perform(put("/task").contentType("application/json").content(withId(child, "Review release notes", "2026-12-05")))
                .andExpect(status().isBadRequest());
        api.perform(put("/task").contentType("application/json").content(withId(parent, "Parent", "2026-12-03")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Review release notes")))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("2026-12-03")));
        api.perform(put("/task").contentType("application/json").content(withId(child, "Review release notes", "2026-12-02"))).andExpect(status().isOk());
        api.perform(put("/task").contentType("application/json").content(withId(parent, "Parent", "2026-12-03"))).andExpect(status().isOk());
    }
    private String withId(int id, String title, String date) throws Exception {
        var node = (com.fasterxml.jackson.databind.node.ObjectNode)json.readTree(input(title, date));
        node.put("id", id);
        return node.toString();
    }

    @Test void rejectsGrandchildrenThroughApiAndDirectSqlAndForbidsReparenting() throws Exception {
        int parent = root("Parent", "2026-12-04");
        int child = child(parent, "Child", "2026-12-03");
        api.perform(post("/task/{id}/subtasks", child).contentType("application/json").content(input("Grandchild", "2026-12-02")))
                .andExpect(status().isBadRequest());
        assertThatThrownBy(() -> sqlTask("Grandchild", "2026-12-02", child)).hasMessageContaining("Subtasks cannot have subtasks");
        assertThatThrownBy(() -> jdbc.update("UPDATE task SET parent_id=? WHERE id=?", child, parent)).hasMessageContaining("cannot be moved");
        assertThatThrownBy(() -> jdbc.update("UPDATE task SET parent_id=NULL WHERE id=?", child)).hasMessageContaining("cannot be moved");
        assertThatThrownBy(() -> sqlTask("Missing", "2026-12-02", Integer.MAX_VALUE)).hasMessageContaining("does not exist");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO task VALUES (999999,'Self',NULL,'2026-12-02','PENDING',999999)"))
                .hasMessageContaining("own parent");
    }

    @Test void directSqlEnforcesBothSidesOfDateRule() {
        int parent = sqlTask("Parent", "2026-12-04", null);
        int child = sqlTask("SQL child", "2026-12-04", parent);
        assertThatThrownBy(() -> sqlTask("Late", "2026-12-05", parent)).hasMessageContaining("Subtask due date");
        assertThatThrownBy(() -> jdbc.update("UPDATE task SET due_date='2026-12-05' WHERE id=?", child)).hasMessageContaining("Subtask due date");
        assertThatThrownBy(() -> jdbc.update("UPDATE task SET due_date='2026-12-03' WHERE id=?", parent)).hasMessageContaining("SQL child");
    }

    @Test void deleteChildPreservesFamilyAndDeleteParentCascadesThroughApiAndSql() throws Exception {
        int parent = root("Parent", "2026-12-04");
        int first = child(parent, "First", "2026-12-03");
        int sibling = child(parent, "Sibling", "2026-12-03");
        api.perform(delete("/task/{id}", first)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM task", Integer.class)).isEqualTo(2);
        api.perform(get("/task/{id}", sibling)).andExpect(status().isOk());
        api.perform(delete("/task/{id}", parent)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM task", Integer.class)).isZero();
        parent = sqlTask("SQL parent", "2026-12-04", null);
        sqlTask("SQL child", "2026-12-03", parent);
        jdbc.update("DELETE FROM task WHERE id=?", parent);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM task", Integer.class)).isZero();
    }

    @Test void concurrentChildInsertAndParentDateUpdateCannotBothCommit() throws Exception {
        raceDateChange(true);
        raceDateChange(false);
    }
    private void raceDateChange(boolean childFirst) throws Exception {
        int parent = sqlTask("Concurrent parent", "2026-12-04", null);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try (Connection first = connection(); Connection second = connection()) {
            String insert = "INSERT INTO task(id,title,due_date,status,parent_id) VALUES(nextval('seq_task_id'),'Racing child','2026-12-04','PENDING'," + parent + ")";
            String shorten = "UPDATE task SET due_date='2026-12-03' WHERE id=" + parent;
            first.createStatement().execute(childFirst ? insert : shorten);
            CountDownLatch started = new CountDownLatch(1);
            Future<String> result = executor.submit(() -> {
                started.countDown();
                try { second.createStatement().execute(childFirst ? shorten : insert); second.commit(); return "committed"; }
                catch (SQLException ex) { second.rollback(); return ex.getSQLState(); }
            });
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> result.get(250, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            first.commit();
            assertThat(result.get(5, TimeUnit.SECONDS)).isEqualTo("23514");
        } finally { executor.shutdownNow(); }
    }

    @Test void upgradesAnExistingV1BaselineWithoutChangingTaskData() throws Exception {
        jdbc.execute("CREATE DATABASE flyway_upgrade_verify");
        String url = postgres.getJdbcUrl().replace("/" + postgres.getDatabaseName(), "/flyway_upgrade_verify");
        try (Connection existing = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword())) {
            org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(existing,
                    new org.springframework.core.io.ClassPathResource("db/migration/V1__create_task_schema.sql"));
            existing.createStatement().execute("INSERT INTO task VALUES(1,'Existing task','Keep me','2026-12-04','PENDING')");
        }
        org.flywaydb.core.Flyway.configure().dataSource(url, postgres.getUsername(), postgres.getPassword())
                .baselineOnMigrate(true).baselineVersion("1").load().migrate();
        var migrated = new JdbcTemplate(new org.springframework.jdbc.datasource.DriverManagerDataSource(
                url, postgres.getUsername(), postgres.getPassword()));
        assertThat(migrated.queryForObject("SELECT title FROM task WHERE id=1", String.class)).isEqualTo("Existing task");
        assertThat(migrated.queryForObject("SELECT count(*) FROM task WHERE parent_id IS NULL", Integer.class)).isEqualTo(1);
        assertThat(migrated.queryForObject("SELECT type FROM flyway_schema_history WHERE version='1'", String.class)).isEqualTo("BASELINE");
        assertThat(migrated.queryForObject("SELECT success FROM flyway_schema_history WHERE version='2'", Boolean.class)).isTrue();
    }

    @Test void staleRepeatableReadParentCannotMissNewChild() throws Exception {
        int parent = sqlTask("Parent", "2026-12-04", null);
        try (Connection stale = connection()) {
            stale.rollback();
            stale.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
            stale.createStatement().executeQuery("SELECT * FROM task WHERE id=" + parent).close();
            sqlTask("New child", "2026-12-04", parent);
            assertThatThrownBy(() -> stale.createStatement().execute("UPDATE task SET due_date='2026-12-03' WHERE id=" + parent))
                    .isInstanceOf(SQLException.class).satisfies(ex -> assertThat(((SQLException) ex).getSQLState()).isEqualTo("40001"));
            stale.rollback();
        }
    }
}
