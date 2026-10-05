package dev.clarkngo.changeradar.ingest;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("changeradar.ingest")
public record IngestProperties(
		@DefaultValue("true") boolean scheduled,
		@DefaultValue("60s") Duration interval,
		@DefaultValue("100") int pageSize,
		@DefaultValue("100") int chunkSize) {
}
