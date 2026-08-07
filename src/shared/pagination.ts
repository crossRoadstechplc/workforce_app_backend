export type PaginationInput = { page: number; pageSize: number };

export function pagination(input: PaginationInput) {
  return {
    skip: (input.page - 1) * input.pageSize,
    take: input.pageSize
  };
}

export function pageMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}
