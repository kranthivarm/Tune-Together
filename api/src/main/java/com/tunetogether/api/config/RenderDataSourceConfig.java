package com.tunetogether.api.config;

import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import javax.sql.DataSource;
import java.net.URI;
import java.net.URISyntaxException;

/**
 * Converts Render's DATABASE_URL (postgres://user:pass@host:port/db)
 * to a JDBC DataSource that Spring Boot can use.
 *
 * Only active in the 'prod' profile.
 */
@Configuration
@Profile("prod")
public class RenderDataSourceConfig {

    @Bean
    public DataSource dataSource() throws URISyntaxException {
        String databaseUrl = System.getenv("DATABASE_URL");

        if (databaseUrl == null || databaseUrl.isEmpty()) {
            throw new IllegalStateException(
                "DATABASE_URL environment variable is required in production. " +
                "Render should set this automatically from the database binding.");
        }

        URI dbUri = new URI(databaseUrl);

        String username = dbUri.getUserInfo().split(":")[0];
        String password = dbUri.getUserInfo().split(":")[1];

        // Convert postgres:// → jdbc:postgresql://
        String jdbcUrl = "jdbc:postgresql://" + dbUri.getHost()
                + ":" + dbUri.getPort()
                + dbUri.getPath();

        // Render managed Postgres requires SSL
        if (!jdbcUrl.contains("?")) {
            jdbcUrl += "?sslmode=require";
        } else {
            jdbcUrl += "&sslmode=require";
        }

        return DataSourceBuilder.create()
                .url(jdbcUrl)
                .username(username)
                .password(password)
                .driverClassName("org.postgresql.Driver")
                .build();
    }
}
