export interface ReportConfig {
  catId: string;
  dateRange: '7' | '30' | '90' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
}