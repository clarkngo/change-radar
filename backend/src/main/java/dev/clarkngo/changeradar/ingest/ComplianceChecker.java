package dev.clarkngo.changeradar.ingest;

import java.util.ArrayList;
import java.util.List;

import dev.clarkngo.changeradar.change.ChangeEvent;

/** Applies the site-impacting change guidelines: every change needs an owner, a ticket and a way back. */
public final class ComplianceChecker {

	public static final String TICKET = "ticket";
	public static final String ROLLBACK_PLAN = "rollbackPlan";
	public static final String OWNER = "owner";

	private ComplianceChecker() {
	}

	public static ChangeEvent check(ChangeEvent change) {
		List<String> missing = new ArrayList<>();
		if (isBlank(change.ticket())) {
			missing.add(TICKET);
		}
		if (!change.hasRollbackPlan()) {
			missing.add(ROLLBACK_PLAN);
		}
		if (isBlank(change.author())) {
			missing.add(OWNER);
		}
		return change.withMissingMetadata(missing);
	}

	private static boolean isBlank(String s) {
		return s == null || s.isBlank();
	}

}
