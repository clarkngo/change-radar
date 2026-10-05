package dev.clarkngo.changeradar.ingest.flags;

import java.util.List;

import dev.clarkngo.changeradar.ingest.ChangeSource;
import dev.clarkngo.changeradar.ingest.SourcesProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Feature-flag audit API: 0-based page/size paging, {"items": [...], "hasMore": bool}. */
@Component
public class FlagAuditSource implements ChangeSource {

	record AuditPage(List<FlagAuditEntry> items, boolean hasMore) {
	}

	private final RestClient client;

	public FlagAuditSource(SourcesProperties properties) {
		this.client = RestClient.create(properties.flagsUrl());
	}

	@Override
	public String name() {
		return "feature-flags";
	}

	@Override
	public List<FlagAuditEntry> fetchPage(int page, int pageSize) {
		AuditPage response = client.get()
			.uri(u -> u.path("/audit").queryParam("page", page).queryParam("size", pageSize).build())
			.retrieve()
			.body(AuditPage.class);
		return response == null || response.items() == null ? List.of() : response.items();
	}

}
