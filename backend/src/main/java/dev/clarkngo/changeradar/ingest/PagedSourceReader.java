package dev.clarkngo.changeradar.ingest;

import java.util.Iterator;

import org.springframework.batch.infrastructure.item.data.AbstractPaginatedDataItemReader;

/** Spring Batch reader that pages through a {@link ChangeSource} until it returns an empty page. */
public class PagedSourceReader extends AbstractPaginatedDataItemReader<SourceRecord> {

	private final ChangeSource source;

	public PagedSourceReader(ChangeSource source, int pageSize) {
		this.source = source;
		setName("reader-" + source.name());
		setPageSize(pageSize);
	}

	@Override
	@SuppressWarnings("unchecked")
	protected Iterator<SourceRecord> doPageRead() {
		return (Iterator<SourceRecord>) source.fetchPage(page, pageSize).iterator();
	}

}
