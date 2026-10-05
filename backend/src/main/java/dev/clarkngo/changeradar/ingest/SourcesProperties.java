package dev.clarkngo.changeradar.ingest;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Base URLs for each change source. In the demo profile they point at the app's own mock endpoints. */
@ConfigurationProperties("changeradar.sources")
public record SourcesProperties(String servicenowUrl, String deploysUrl, String flagsUrl) {
}
