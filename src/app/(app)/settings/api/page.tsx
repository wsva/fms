import { redirect } from 'next/navigation';

// The API reference is now a section of the single /settings page. Keep the
// old route as a redirect that opens straight on that section.
export default function Page() {
    redirect('/settings?section=api_reference');
}
