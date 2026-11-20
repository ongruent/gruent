# Runtime worker image. Build from the repository root:
#   docker build -f services/runtime/deploy/production/Dockerfile -t gruent-runtime:local .
FROM eclipse-temurin:21-jdk AS build
WORKDIR /gruent
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties ./
COPY gradle gradle
COPY libs/engine/steps libs/engine/steps
COPY services/runtime services/runtime
RUN ./gradlew --no-daemon :services:runtime:installDist

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 runtime
COPY --from=build /gruent/services/runtime/build/install/runtime /opt/runtime
USER 10001
ENTRYPOINT ["/opt/runtime/bin/runtime"]
