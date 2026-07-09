# ── Build Stage ──────────────────────────────────────────────
FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /app

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw dependency:resolve --batch-mode --no-transfer-progress

COPY src/ src/
RUN ./mvnw package -DskipTests --batch-mode --no-transfer-progress

# ── Runtime Stage ────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

# Render uses PORT env var; Spring Boot reads it from application-prod.yml
# For local Docker, default is 8080
EXPOSE ${PORT:-8080}

ENTRYPOINT ["java", "-jar", "app.jar"]
