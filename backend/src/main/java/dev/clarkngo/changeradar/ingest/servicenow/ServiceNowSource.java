package dev.clarkngo.changeradar.ingest.servicenow;

import java.util.List;

import dev.clarkngo.changeradar.ingest.ChangeSource;
import dev.clarkngo.changeradar.ingest.SourcesProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** ServiceNow Table API: offset/limit paging, rows wrapped in {"result": [...]}. */
@Component
public class ServiceNowSource implements ChangeSource {

	record TableResponse(List<ServiceNowChange> result) {
	}

	private final RestClient client;

	public ServiceNowSource(SourcesProperties properties) {
		this.client = RestClient.create(properties.servicenowUrl());
	}

	@Override
	public String name() {
		return "servicenow";
	}

	@Override
	public List<ServiceNowChange> fetchPage(int page, int pageSize) {
		TableResponse response = client.get()
			.uri(u -> u.path("/api/now/table/change_request")
				.queryParam("sysparm_offset", page * pageSize)
				.queryParam("sysparm_limit", pageSize)
				.build())
			.retrieve()
			.body(TableResponse.class);
		return response == null || response.result() == null ? List.of() : response.result();
	}

}
