export const CATEGORIES = [
  { value: 'salon', label: 'Salon' },
  { value: 'football', label: 'Football pitch' },
  { value: 'gym', label: 'Gym' },
  { value: 'other', label: 'Other' },
];

export const categoryLabel = (v) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const formatPrice = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

export const formatTime = (iso, timeZone) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone });

export const formatDateTime = (iso, timeZone) =>
  new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone });

export const formatDuration = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}`);

/** Today's date as YYYY-MM-DD in the browser's local time. */
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const STATUS_LABELS = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled_by_client: 'Cancelled by client',
  cancelled_by_owner: 'Cancelled by business',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  suspended: 'Suspended',
};
