export interface Cat {
  id: string;
  name: string;
  status: 'normal' | 'watch' | 'abnormal';
  avatar: string | null;
  isOnline: boolean;
}
