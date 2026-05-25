export interface Cat {
  id: string;
  name: string;
  status: 'normal' | 'abnormal';
  avatar: string | null;
  isOnline: boolean;
}
