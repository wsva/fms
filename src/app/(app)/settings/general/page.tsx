import { redirect } from 'next/navigation';

// Settings is a single page now (section-filtered client-side). The old
// /settings/general route is kept as a redirect so bookmarks and any stale
// links keep working.
export default function Page() {
    redirect('/settings');
}
