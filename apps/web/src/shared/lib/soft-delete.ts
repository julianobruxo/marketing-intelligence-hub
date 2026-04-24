export type SoftDeletableRecord = {
  deletedAt?: Date | null;
};

export function isDeleted(record: SoftDeletableRecord | null | undefined): boolean {
  return Boolean(record?.deletedAt);
}

export function withoutDeleted<T extends object>(where: T): T & { deletedAt: null } {
  return {
    ...where,
    deletedAt: null,
  };
}
