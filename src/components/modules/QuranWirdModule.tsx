import { Navigate } from 'react-router';

/** Legacy `/module/quran` (old reminders) → «القرآن», which opens مصحفي. */
export function QuranWirdModule() {
  return <Navigate to="/quran" replace />;
}
