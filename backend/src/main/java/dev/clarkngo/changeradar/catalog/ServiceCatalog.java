package dev.clarkngo.changeradar.catalog;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Services, their owning teams, and what each one depends on. Used to resolve a change's team
 * and to measure how far a change is from the service that is alerting.
 */
@ConfigurationProperties("changeradar.catalog")
public record ServiceCatalog(Map<String, ServiceInfo> services) {

	public static final String UNKNOWN_TEAM = "unknown";

	public record ServiceInfo(String team, List<String> dependsOn) {
		public ServiceInfo {
			dependsOn = dependsOn == null ? List.of() : List.copyOf(dependsOn);
		}
	}

	public ServiceCatalog {
		services = services == null ? Map.of() : Map.copyOf(services);
	}

	public String teamOf(String service) {
		ServiceInfo info = services.get(service);
		return info == null ? UNKNOWN_TEAM : info.team();
	}

	/**
	 * Number of dependency hops from {@code from} down to {@code to}: 0 for the same service,
	 * 1 for a direct dependency, and so on. Returns -1 when {@code to} is not upstream of {@code from}.
	 */
	public int dependencyDistance(String from, String to) {
		if (from.equals(to)) {
			return 0;
		}
		Map<String, Integer> depth = new HashMap<>(Map.of(from, 0));
		ArrayDeque<String> queue = new ArrayDeque<>(List.of(from));
		while (!queue.isEmpty()) {
			String current = queue.poll();
			ServiceInfo info = services.get(current);
			if (info == null) {
				continue;
			}
			for (String dep : info.dependsOn()) {
				if (depth.containsKey(dep)) {
					continue;
				}
				int d = depth.get(current) + 1;
				if (dep.equals(to)) {
					return d;
				}
				depth.put(dep, d);
				queue.add(dep);
			}
		}
		return -1;
	}

}
