package com.aimap.backend.config;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.Test;

import java.sql.DriverManager;

import static org.junit.jupiter.api.Assertions.*;

class DatabaseMigrationTests {
    @Test
    void migrationCreatesSchemaOnceAndPreservesRecords() throws Exception {
        String url = "jdbc:h2:mem:migration-empty;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        int availableMigrations = Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration").load().info().all().length;
        Flyway flyway = Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration").load();
        assertEquals(availableMigrations, flyway.migrate().migrationsExecuted);
        try (var connection = DriverManager.getConnection(url, "sa", ""); var statement = connection.createStatement()) {
            statement.execute("INSERT INTO contacts (owner_id, name) VALUES ('migration-test-owner', 'Migration test')");
            assertEquals(0, flyway.migrate().migrationsExecuted);
            try (var result = statement.executeQuery("SELECT COUNT(*) FROM contacts")) {
                assertTrue(result.next());
                assertEquals(1, result.getInt(1));
            }
        }
        assertDoesNotThrow(flyway::validate);
    }

    @Test
    void preexistingDatabaseRequiresExplicitBaseline() throws Exception {
        String url = "jdbc:h2:mem:migration-existing;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", ""); var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE existing_data (id BIGINT PRIMARY KEY)");
        }
        Flyway flyway = Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration").load();
        assertThrows(FlywayException.class, flyway::migrate);
    }
}
