package dev.clarkngo.changeradar.ingest.deploys;

import java.util.List;

import dev.clarkngo.changeradar.ingest.ChangeSource;
import dev.clarkngo.changeradar.ingest.SourcesProperties;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Deployments API: 1-based page/per_page paging, bare JSON array. */
@Component
public class DeploySource implements ChangeSource {

	private final RestClient client;

	public DeploySource(SourcesProperties properties) {
		this.client = RestClient.create(properties.deploysUrl());
	}

	@Override
	public String name() {
		return "deploys";
	}

	@Override
	public List<DeployEvent> fetchPage(int page, int pageSize) {
		List<DeployEvent> events = client.get()
			.uri(u -> u.path("/deployments").queryParam("page", page + 1).queryParam("per_page", pageSize).build())
			.retrieve()
			.body(new ParameterizedTypeReference<List<DeployEvent>>() {
			});
		return events == null ? List.of() : events;
	}

}
