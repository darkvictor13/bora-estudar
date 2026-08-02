const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_FILTER_BATCH_SIZE = 100;

type PageResult<T> = {
  data: T[] | null;
  error: unknown;
};

type PageLoader<T> = (from: number, to: number) => PromiseLike<PageResult<T>>;

export async function fetchAllRows<T>(
  loadPage: PageLoader<T>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError("O tamanho da página deve ser um inteiro positivo.");
  }

  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const result = await loadPage(from, from + pageSize - 1);
    if (result.error) throw result.error;

    const page = result.data ?? [];
    rows.push(...page);

    if (page.length < pageSize) return rows;
  }
}

export async function fetchAllRowsInBatches<T, TValue>(
  values: TValue[],
  loadPage: (values: TValue[], from: number, to: number) => PromiseLike<PageResult<T>>,
  batchSize = DEFAULT_FILTER_BATCH_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("O tamanho do lote deve ser um inteiro positivo.");
  }

  const batches: TValue[][] = [];
  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize));
  }

  const results = await Promise.all(
    batches.map((batch) => fetchAllRows((from, to) => loadPage(batch, from, to))),
  );

  return results.flat();
}
