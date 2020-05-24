export enum FileStatus {
  NeedDownload = 0,
  Downloaded = 1,
  Verified = 2,
  Imported = 3,
}

export interface ClickhouseSelectResponse<T> {
  meta: { name: string; type: string }[];
  data: T;
  rows: number;
  rows_before_limit_at_least: number;
  statistics: { elapsed: number; rows_read: number; bytes_read: number };
  transferred: number;
}
