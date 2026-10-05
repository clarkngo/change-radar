package dev.clarkngo.changeradar.demo;

import java.util.List;
import java.util.Map;

import dev.clarkngo.changeradar.ingest.deploys.DeployEvent;
import dev.clarkngo.changeradar.ingest.flags.FlagAuditEntry;
import dev.clarkngo.changeradar.ingest.servicenow.ServiceNowChange;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Stand-ins for the three upstream systems. Each one deliberately uses a different response shape and
 * pagination style, just like real ones do.
 */
@RestController
@RequestMapping("/mock")
@Profile("demo")
class MockSourcesController {

	private final DemoData data;

	MockSourcesController(DemoData data) {
		this.data = data;
	}

	@GetMapping("/servicenow/api/now/table/change_request")
	Map<String, List<ServiceNowChange>> serviceNow(@RequestParam(name = "sysparm_offset", defaultValue = "0") int offset,
			@RequestParam(name = "sysparm_limit", defaultValue = "100") int limit) {
		return Map.of("result", slice(data.serviceNow(), offset, limit));
	}

	@GetMapping("/deploys/deployments")
	List<DeployEvent> deployments(@RequestParam(defaultValue = "1") int page,
			@RequestParam(name = "per_page", defaultValue = "30") int perPage) {
		return slice(data.deploys(), (page - 1) * perPage, perPage);
	}

	@GetMapping("/flags/audit")
	Map<String, Object> flagAudit(@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "50") int size) {
		List<FlagAuditEntry> items = slice(data.flags(), page * size, size);
		return Map.of("items", items, "hasMore", (page + 1) * size < data.flags().size());
	}

	private static <T> List<T> slice(List<T> all, int offset, int limit) {
		if (offset >= all.size() || offset < 0) {
			return List.of();
		}
		return all.subList(offset, Math.min(all.size(), offset + limit));
	}

}
