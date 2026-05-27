export interface ReportConfig {
  catId: string;
  dateRange: '1' | '3' | '7' | '14' | '21' | '30' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
}
