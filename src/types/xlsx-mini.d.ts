declare module 'xlsx/dist/xlsx.mini.min.js' {
  import type { WorkBook, WorkSheet } from 'xlsx';

  export function read(data: ArrayBuffer, options: { type: 'array' }): WorkBook;
  export function writeFile(workbook: WorkBook, fileName: string): void;

  export const utils: {
    aoa_to_sheet(rows: readonly (readonly unknown[])[]): WorkSheet;
    book_append_sheet(workbook: WorkBook, worksheet: WorkSheet, name: string): void;
    book_new(): WorkBook;
    sheet_to_json<T>(
      worksheet: WorkSheet,
      options: { defval: unknown; raw: boolean },
    ): T[];
  };
}
