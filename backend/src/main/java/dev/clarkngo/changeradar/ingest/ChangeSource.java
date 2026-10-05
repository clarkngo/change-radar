package dev.clarkngo.changeradar.ingest;

import java.util.List;

/** A system that records changes. Implementations hide each source's own pagination style. */
public interface ChangeSource {

	String name();

	/** Fetches one page of records, where {@code page} is 0-based. An empty list means there are no more. */
	List<? extends SourceRecord> fetchPage(int page, int pageSize);

}
