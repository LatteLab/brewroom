'use client';

interface FormattedTimeProps {
  date: Date | string;
  format: 'date' | 'date-short' | 'time' | 'datetime' | 'month-short' | 'day' | 'weekday';
  className?: string;
}

export function FormattedTime({ date, format, className }: FormattedTimeProps) {
  const d = new Date(date);

  let text: string;
  switch (format) {
    case 'date':
      text = d.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });
      break;
    case 'date-short':
      text = d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      break;
    case 'time':
      text = d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit',
      });
      break;
    case 'datetime':
      text = d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      }) + ', ' + d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit',
      });
      break;
    case 'month-short':
      text = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      break;
    case 'day':
      text = String(d.getDate());
      break;
    case 'weekday':
      text = d.toLocaleDateString('en-US', { weekday: 'long' });
      break;
  }

  return <span className={className} suppressHydrationWarning>{text}</span>;
}
